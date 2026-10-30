import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/supabase-server-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { fetchFulfillmentSettings } from '@/lib/marketing-api';
import { refundOrderPayment } from '@/lib/payment-refund';
import { sendEmail } from '@/lib/email';
import { orderCancelledByCustomerEmail } from '@/lib/email-templates';
import { normalizePartialPay } from '@/lib/partial-pay';

// Statuses a customer is still allowed to self-cancel from. Once an order
// has moved past this (shipped/delivered/etc.) it must go through the
// return/exchange flow instead, not a plain cancellation.
const CANCELLABLE_STATUSES = ['pending', 'paid', 'confirmed'];

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();

  // Guest checkouts have no account, so there's nothing to "log in" as.
  // We already trust the order UUID as the access token for this order --
  // the order-confirmation page shows full address/invoice/tracking to
  // anyone with the link, with no login. Cancellation uses the same trust
  // model: if the order was placed as a guest (user_id is null), knowing
  // the order id is enough. If the order IS tied to an account, we still
  // require that account's session (or, for a logged-in user cancelling
  // an order that was placed as a guest under the same email, an email
  // match) so a stranger with a leaked link can't cancel someone's
  // logged-in account order.
  const admin = getSupabaseAdmin();
  const { data: order, error: fetchError } = await admin
    .from('orders')
    .select(
      'id, user_id, customer_email, customer_name, items, status, created_at, payment_method, razorpay_payment_id, payment_gateway, cashfree_order_id, total_amount, tracking_number, advance_amount, advance_paid_at, advance_refund_id'
    )
    .eq('id', params.id)
    .single();

  if (fetchError || !order) {
    return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
  }

  if (order.user_id) {
    // Account order -- must be logged in as the owner (or same email).
    if (!user) {
      return NextResponse.json({ error: 'You must be logged in to cancel this order.' }, { status: 401 });
    }
    const ownsByEmail =
      !!order.customer_email && !!user.email && order.customer_email.toLowerCase() === user.email.toLowerCase();
    if (order.user_id !== user.id && !ownsByEmail) {
      return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
    }
  }
  // else: guest order (user_id is null) -- proceed, no login required.

  if (!CANCELLABLE_STATUSES.includes(order.status)) {
    return NextResponse.json(
      { error: 'This order can no longer be cancelled online. Please contact us for help.' },
      { status: 400 }
    );
  }

  // Belt-and-suspenders: once a shipment has been created (tracking
  // number assigned), the order can no longer be self-cancelled --
  // regardless of how much time is left in the cancellation window.
  // Normally order.status already flips to 'shipped' the moment a
  // waybill is generated (see delhivery/create-shipment route), which
  // the CANCELLABLE_STATUSES check above already catches, but we check
  // tracking_number directly too in case status hasn't been bumped yet.
  if (order.tracking_number) {
    return NextResponse.json(
      { error: 'This order has already shipped and can no longer be cancelled online. Please contact us for help.' },
      { status: 400 }
    );
  }

  const { cancellation_window_hours } = await fetchFulfillmentSettings();
  const hoursSinceOrder = (Date.now() - new Date(order.created_at).getTime()) / (1000 * 60 * 60);
  if (hoursSinceOrder > cancellation_window_hours) {
    return NextResponse.json(
      {
        error: `The ${cancellation_window_hours}-hour cancellation window for this order has passed. Please contact us for help.`,
      },
      { status: 400 }
    );
  }

  const { error: updateError } = await admin
    .from('orders')
    .update({ status: 'cancelled' })
    .eq('id', order.id);

  if (updateError) {
    return NextResponse.json({ error: 'Failed to cancel order. Please try again or contact us.' }, { status: 500 });
  }

  // Best-effort confirmation email for every self-cancel, regardless of
  // refund outcome below -- a failed/unconfigured email provider must
  // never block the cancellation itself, so this never throws.
  const notifyCustomer = (refund: {
    status: 'not_applicable' | 'refunded' | 'pending_manual' | 'failed';
    amount?: number;
    razorpay_refund_id?: string | null;
  }) => {
    if (!order.customer_email) return;
    const { subject, html } = orderCancelledByCustomerEmail({
      id: order.id,
      customer_name: order.customer_name,
      items: Array.isArray(order.items) ? order.items : [],
      total_amount: order.total_amount,
      refund,
    });
    sendEmail({ to: order.customer_email, subject, html }).catch((err) => {
      console.error('[orders/cancel] confirmation email failed:', err);
    });
  };

  // Only orders that actually had money captured need a refund. A COD
  // order, or an "online" order where Razorpay's verify-payment step never
  // ran (no razorpay_payment_id / not actually 'paid'), never took money
  // in the first place — nothing to refund.
  const isPartialPaid =
    order.payment_method === 'partial' && !!order.advance_paid_at && !!order.razorpay_payment_id && !order.advance_refund_id;

  // Partial Pay: only the ADVANCE was ever collected. Whether it is refunded on a self-cancel
  // before dispatch is the admin's choice (Admin > Settings > Partial Pay). Orders that are
  // refused at the door / RTO are never auto-refunded -- they don't come through this route.
  let partialRefundAllowed = false;
  if (isPartialPaid) {
    const { data: ppRow } = await admin.from('settings').select('value').eq('key', 'partial_pay').maybeSingle();
    partialRefundAllowed = normalizePartialPay(ppRow?.value as any).refund_advance_on_cancel;
  }
  const refundAmount = isPartialPaid ? Number(order.advance_amount) : Number(order.total_amount);

  const needsRefund =
    (order.payment_method === 'online' && order.status === 'paid' && !!order.razorpay_payment_id) ||
    (isPartialPaid && partialRefundAllowed);

  if (isPartialPaid && !partialRefundAllowed) {
    notifyCustomer({ status: 'not_applicable' });
    return NextResponse.json({
      success: true,
      refunded: false,
      refundError: 'Your order was cancelled. As per our policy, the advance paid for a Partial Pay order is non-refundable.',
    });
  }

  if (!needsRefund) {
    notifyCustomer({ status: 'not_applicable' });
    return NextResponse.json({ success: true, refunded: false });
  }

  const { data: refundSettingRow } = await admin
    .from('settings')
    .select('value')
    .eq('key', 'refund_automation')
    .maybeSingle();
  const autoRefundEnabled = (refundSettingRow?.value as { auto_refund_enabled?: boolean } | null)
    ?.auto_refund_enabled ?? true; // default on, matches DEFAULT_REFUND_AUTOMATION_SETTINGS

  if (!autoRefundEnabled) {
    await admin.from('orders').update({ refund_status: 'pending_manual' }).eq('id', order.id);
    notifyCustomer({ status: 'pending_manual', amount: refundAmount });
    return NextResponse.json({
      success: true,
      refunded: false,
      refundError: 'Your order was cancelled. Our team will process your refund manually within 1-2 business days.',
    });
  }

  const refundResult = await refundOrderPayment(order as any, refundAmount);

  if (refundResult.success) {
    await admin
      .from('orders')
      .update({
        refund_status: 'refunded',
        razorpay_refund_id: refundResult.refundId,
        ...(isPartialPaid ? { advance_refund_id: refundResult.refundId } : {}),
      })
      .eq('id', order.id);
    notifyCustomer({ status: 'refunded', amount: refundAmount, razorpay_refund_id: refundResult.refundId });
    return NextResponse.json({ success: true, refunded: true });
  }

  // The order is still cancelled even if the refund call failed — we
  // don't want to block cancellation on Razorpay being reachable. We just
  // flag it so the admin can see it needs a manual refund instead of it
  // silently getting missed.
  await admin.from('orders').update({ refund_status: 'failed' }).eq('id', order.id);
  notifyCustomer({ status: 'failed', amount: refundAmount });
  return NextResponse.json({
    success: true,
    refunded: false,
    refundError: 'Your order was cancelled, but the automatic refund failed. Our team will process your refund manually within 1-2 business days.',
  });
}
