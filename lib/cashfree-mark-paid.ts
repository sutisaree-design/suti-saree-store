// Marks an order 'paid' after Cashfree confirmed a SUCCESS payment, and sends the same
// "payment confirmed" email the Razorpay routes send. Shared by the verify-payment route
// (customer's browser) and the webhook (Cashfree's server) -- whichever gets there first
// flips pending -> paid, the other is a harmless no-op.
import { getSupabaseAdmin } from './supabase-admin';
import { sendEmail } from './email';
import { orderStatusUpdateEmail } from './email-templates';
import { isInPaymentRequestFlow, logPaymentRequestEvent } from './order-payment-events';

export interface PayableOrder {
  id: string;
  status: string;
  total_amount: number | string;
  advance_amount?: number | string | null;
  payment_method?: string | null;
  customer_name?: string | null;
  customer_email?: string | null;
  tracking_number?: string | null;
  courier_name?: string | null;
  items?: any;
}

export const PAYABLE_ORDER_COLUMNS =
  'id, status, total_amount, advance_amount, payment_method, customer_name, customer_email, tracking_number, courier_name, items, cashfree_order_id';

/** Amount (rupees) this order should have been charged online. */
export function expectedChargeRupees(order: PayableOrder): number {
  return Number(order.payment_method === 'partial' ? order.advance_amount : order.total_amount);
}

export async function markOrderPaidViaCashfree(
  order: PayableOrder,
  cashfreePaymentId: string,
  via: 'verify' | 'webhook'
): Promise<{ ok: true; alreadyPaid: boolean } | { ok: false; error: string; status: number }> {
  if (order.status === 'paid') return { ok: true, alreadyPaid: true };
  if (order.status !== 'pending') {
    return { ok: false, error: `Order is ${order.status}`, status: 409 };
  }

  const admin = getSupabaseAdmin();
  const { data: updated, error } = await admin
    .from('orders')
    .update({
      status: 'paid',
      payment_gateway: 'cashfree',
      // Column is named after Razorpay for historical reasons; it holds "the gateway payment id"
      // for every gateway so all existing "paid online?" logic keeps working.
      razorpay_payment_id: cashfreePaymentId,
      ...(order.payment_method === 'partial'
        ? {
            advance_payment_id: cashfreePaymentId,
            advance_paid_at: new Date().toISOString(),
            balance_due: Math.max(0, Number(order.total_amount) - Number(order.advance_amount)),
          }
        : {}),
    })
    .eq('id', order.id)
    .eq('status', 'pending')
    .select('id');

  if (error) return { ok: false, error: 'Failed to update order status', status: 500 };
  // Lost the race to the other path (verify vs webhook) -- it already did the email etc.
  if (!updated || updated.length === 0) return { ok: true, alreadyPaid: true };

  const inFlow = await isInPaymentRequestFlow(order.id).catch(() => false);
  if (inFlow) {
    logPaymentRequestEvent(order.id, 'payment_verified', {
      meta: { cashfree_payment_id: cashfreePaymentId, via },
    }).catch(() => {});
  }

  if (order.customer_email) {
    const { subject, html } = orderStatusUpdateEmail({
      id: order.id,
      customer_name: order.customer_name,
      status: 'paid',
      tracking_number: order.tracking_number,
      courier_name: order.courier_name,
      items: order.items,
      total_amount: order.total_amount,
      isPaymentRequestFlow: inFlow,
      payment_method: order.payment_method,
      advance_amount: order.advance_amount,
    } as any);
    sendEmail({ to: order.customer_email, subject, html }).catch((err) => {
      console.error(`[cashfree:${via}] payment-confirmed email failed:`, err);
    });
  }

  return { ok: true, alreadyPaid: false };
}
