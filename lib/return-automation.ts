// ---------------------------------------------------------------------
// Shared orchestration for the automated return flow:
//   approve -> schedule Delhivery reverse pickup -> poll tracking ->
//   item received at warehouse -> Razorpay refund (online orders).
//
// Used by:
//   - app/api/admin/returns/[id]/route.ts        (PATCH: approve/refund)
//   - app/api/admin/returns/[id]/schedule-pickup  (manual trigger)
//   - app/api/admin/returns/[id]/refund           (manual trigger)
//   - app/api/admin/returns/[id]/check-pickup     (manual "check now")
//   - lib/cron-jobs.ts runReturnPickupTrackingJob (daily poll)
//
// Every step is best-effort and never throws past its own boundary —
// a failed automated step still leaves the return in a sane, visible
// state (pickup_status/refund_status + *_error columns) and emails the
// admin (store support_email) so nothing silently gets stuck.
// ---------------------------------------------------------------------

import type { SupabaseClient } from '@supabase/supabase-js';
import { createDelhiveryReversePickup, trackDelhiveryShipment } from './delhivery-api';
import { refundRazorpayPayment } from './razorpay-refund';
import { recordReturnRiskIncident } from './return-risk-api';
import { sendEmail } from './email';
import {
  returnPickupScheduledEmail,
  returnPickupReceivedEmail,
  returnRefundProcessedEmail,
  returnAutomationAdminAlert,
} from './email-templates';

export type ReturnAutomationMode = 'automatic' | 'manual';

export async function getReturnAutomationMode(admin: SupabaseClient): Promise<ReturnAutomationMode> {
  const { data } = await admin
    .from('settings')
    .select('value')
    .eq('key', 'return_automation')
    .maybeSingle();
  const mode = (data?.value as { mode?: string } | null)?.mode;
  return mode === 'manual' ? 'manual' : 'automatic';
}

async function getSupportEmail(admin: SupabaseClient): Promise<string | null> {
  const { data } = await admin
    .from('settings')
    .select('value')
    .eq('key', 'store_info')
    .maybeSingle();
  return (data?.value as { support_email?: string } | null)?.support_email || null;
}

async function alertAdmin(
  admin: SupabaseClient,
  args: { returnId: string; orderId: string; stage: 'pickup' | 'refund'; error: string }
) {
  try {
    const supportEmail = await getSupportEmail(admin);
    if (!supportEmail) return;
    const { subject, html } = returnAutomationAdminAlert(args);
    await sendEmail({ to: supportEmail, subject, html });
  } catch {
    // Best-effort only — never let an alert failure mask the original error.
  }
}

type ReturnRow = {
  id: string;
  order_id: string;
  type: string;
  status: string;
  pickup_status: string;
  pickup_waybill?: string | null;
  refund_status?: string | null;
};

type OrderRow = {
  id: string;
  customer_name?: string | null;
  customer_email?: string | null;
  customer_phone?: string | null;
  shipping_address?: any;
  items?: any;
  total_amount: number;
  payment_method?: string | null;
  razorpay_payment_id?: string | null;
};

/**
 * Creates the Delhivery reverse pickup for an approved return and
 * updates the row. Safe to call whether triggered automatically (on
 * approval) or manually (admin clicks "Schedule Pickup").
 */
export async function schedulePickupForReturn(
  admin: SupabaseClient,
  ret: ReturnRow,
  order: OrderRow
): Promise<{ success: boolean; error?: string }> {
  if (ret.pickup_waybill) {
    return { success: true }; // already scheduled — no-op, avoids double-booking
  }

  try {
    const result = await createDelhiveryReversePickup(ret.id, {
      id: order.id,
      customer_name: order.customer_name,
      customer_phone: order.customer_phone,
      shipping_address: order.shipping_address,
      items: Array.isArray(order.items) ? order.items : [],
    });

    if (!result.success || !result.waybill) {
      const errorMsg = result.remark || 'Delhivery did not return a waybill';
      await admin
        .from('returns')
        .update({ pickup_status: 'failed', pickup_error: errorMsg })
        .eq('id', ret.id);
      await alertAdmin(admin, { returnId: ret.id, orderId: ret.order_id, stage: 'pickup', error: errorMsg });
      return { success: false, error: errorMsg };
    }

    await admin
      .from('returns')
      .update({
        pickup_status: 'scheduled',
        pickup_waybill: result.waybill,
        pickup_scheduled_at: new Date().toISOString(),
        pickup_error: null,
      })
      .eq('id', ret.id);

    if (order.customer_email) {
      const { subject, html } = returnPickupScheduledEmail({
        order_id: ret.order_id,
        type: ret.type,
        waybill: result.waybill,
      });
      sendEmail({ to: order.customer_email, subject, html }).catch(() => {});
    }

    return { success: true };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Failed to schedule reverse pickup';
    await admin
      .from('returns')
      .update({ pickup_status: 'failed', pickup_error: errorMsg })
      .eq('id', ret.id);
    await alertAdmin(admin, { returnId: ret.id, orderId: ret.order_id, stage: 'pickup', error: errorMsg });
    return { success: false, error: errorMsg };
  }
}

/**
 * Fires the Razorpay refund for a return whose item is back at the
 * warehouse (or that the admin is force-processing manually). No-op
 * (returns success) if already refunded, or if the order needs no
 * refund at all (COD / never actually captured payment).
 */
export async function processRefundForReturn(
  admin: SupabaseClient,
  ret: ReturnRow,
  order: OrderRow
): Promise<{ success: boolean; refunded: boolean; error?: string }> {
  if (ret.refund_status === 'refunded') {
    return { success: true, refunded: true };
  }
  if (ret.refund_status === 'not_applicable') {
    return { success: true, refunded: false }; // already recorded — don't double-count the risk incident
  }

  const needsRefund = order.payment_method === 'online' && !!order.razorpay_payment_id;
  if (!needsRefund) {
    await admin.from('returns').update({ refund_status: 'not_applicable' }).eq('id', ret.id);
    if (ret.type === 'return') {
      recordReturnRiskIncident(admin, order.customer_phone, 'return').catch(() => {});
    }
    return { success: true, refunded: false };
  }

  await admin.from('returns').update({ refund_status: 'processing' }).eq('id', ret.id);

  const refundAmount = order.total_amount;
  const result = await refundRazorpayPayment(order.razorpay_payment_id as string, refundAmount);

  if (!result.success) {
    await admin
      .from('returns')
      .update({ refund_status: 'failed', refund_error: result.error })
      .eq('id', ret.id);
    await alertAdmin(admin, { returnId: ret.id, orderId: ret.order_id, stage: 'refund', error: result.error });
    return { success: false, refunded: false, error: result.error };
  }

  await admin
    .from('returns')
    .update({
      refund_status: 'refunded',
      razorpay_refund_id: result.refundId,
      refunded_at: new Date().toISOString(),
      refund_error: null,
      status: ret.type === 'return' ? 'refunded' : 'completed',
      resolved_at: new Date().toISOString(),
    })
    .eq('id', ret.id);

  // Return-risk tracking: only "return" (not "exchange") counts as a
  // return-risk incident — an exchange isn't money/stock lost the way a
  // refunded return or an RTO is.
  if (ret.type === 'return') {
    recordReturnRiskIncident(admin, order.customer_phone, 'return').catch(() => {});
  }

  if (order.customer_email) {
    const { subject, html } = returnRefundProcessedEmail({
      order_id: ret.order_id,
      refund_amount: refundAmount,
      razorpay_refund_id: result.refundId,
    });
    sendEmail({ to: order.customer_email, subject, html }).catch(() => {});
  }

  return { success: true, refunded: true };
}

/**
 * Polls Delhivery tracking for one return's pickup waybill and, once
 * it shows the item delivered back to the warehouse, marks it
 * received and (in automatic mode) kicks off the refund. Called by
 * the daily cron for every in-flight pickup, and by the admin's
 * "Check pickup status" button for a single return.
 */
export async function checkPickupStatusForReturn(
  admin: SupabaseClient,
  ret: ReturnRow,
  order: OrderRow,
  mode: ReturnAutomationMode
): Promise<{ pickup_status: string; refund_triggered: boolean }> {
  if (!ret.pickup_waybill) {
    return { pickup_status: ret.pickup_status, refund_triggered: false };
  }

  const tracking = await trackDelhiveryShipment(ret.pickup_waybill);
  await admin.from('returns').update({ pickup_last_checked_at: new Date().toISOString() }).eq('id', ret.id);

  if (!tracking.tracked || !tracking.currentStatus) {
    return { pickup_status: ret.pickup_status, refund_triggered: false };
  }

  const statusText = tracking.currentStatus.toLowerCase();
  let nextStatus = ret.pickup_status;

  if (statusText.includes('deliver')) {
    // Delivered back to the warehouse — the reverse-pickup leg is done.
    nextStatus = 'received';
  } else if (statusText.includes('transit') || statusText.includes('dispatch')) {
    nextStatus = 'in_transit';
  } else if (statusText.includes('picked') || statusText.includes('pick up') || statusText.includes('pickup')) {
    nextStatus = 'picked_up';
  }

  if (nextStatus === ret.pickup_status) {
    return { pickup_status: nextStatus, refund_triggered: false };
  }

  const updatePayload: Record<string, any> = { pickup_status: nextStatus };
  if (nextStatus === 'picked_up') updatePayload.pickup_picked_up_at = new Date().toISOString();
  if (nextStatus === 'received') updatePayload.pickup_received_at = new Date().toISOString();
  await admin.from('returns').update(updatePayload).eq('id', ret.id);

  if (nextStatus === 'received') {
    if (order.customer_email) {
      const { subject, html } = returnPickupReceivedEmail({
        order_id: ret.order_id,
        type: ret.type,
        online_payment: order.payment_method === 'online',
      });
      sendEmail({ to: order.customer_email, subject, html }).catch(() => {});
    }

    if (mode === 'automatic') {
      const refundResult = await processRefundForReturn(admin, { ...ret, pickup_status: nextStatus }, order);
      return { pickup_status: nextStatus, refund_triggered: refundResult.refunded };
    }

    // Manual mode: flag it so the admin sees a refund is waiting on them.
    const needsRefund = order.payment_method === 'online' && !!order.razorpay_payment_id;
    await admin
      .from('returns')
      .update({ refund_status: needsRefund ? 'pending_manual' : 'not_applicable' })
      .eq('id', ret.id);
  }

  return { pickup_status: nextStatus, refund_triggered: false };
}
