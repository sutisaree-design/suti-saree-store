import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { verifyCashfreeWebhook } from '@/lib/cashfree';
import { runOrderConfirmationSideEffects } from '@/lib/order-confirmation';
import { expectedChargeRupees, markOrderPaidViaCashfree, PAYABLE_ORDER_COLUMNS } from '@/lib/cashfree-mark-paid';

// Server-to-server safety net, exactly like /api/razorpay/webhook: if the customer's browser
// closes after paying, Cashfree still tells us and the order becomes 'paid'.
//
// Cashfree dashboard > Developers > Webhooks > Add Webhook Endpoint
//   URL:     https://<your-domain>/api/cashfree/webhook
//   Event:   Payment Success  (PAYMENT_SUCCESS_WEBHOOK)
// The signature is made with your CASHFREE_SECRET_KEY -- no separate webhook secret.
export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text(); // must be the exact raw body for the signature
    const ok = verifyCashfreeWebhook(
      rawBody,
      req.headers.get('x-webhook-signature'),
      req.headers.get('x-webhook-timestamp')
    );
    if (!ok) {
      console.error('[cashfree-webhook] invalid signature');
      return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 400 });
    }

    const event = JSON.parse(rawBody);
    if (event.type !== 'PAYMENT_SUCCESS_WEBHOOK') {
      return NextResponse.json({ received: true, skipped: event.type });
    }

    const cfOrderId: string | undefined = event.data?.order?.order_id;
    const payment = event.data?.payment;
    if (!cfOrderId || !payment?.cf_payment_id || payment.payment_status !== 'SUCCESS') {
      return NextResponse.json({ received: true, skipped: 'malformed_payload' });
    }

    const admin = getSupabaseAdmin();
    const { data: order, error } = await admin
      .from('orders')
      .select(PAYABLE_ORDER_COLUMNS)
      .eq('cashfree_order_id', cfOrderId)
      .maybeSingle();

    if (error) return NextResponse.json({ error: 'Order lookup failed' }, { status: 500 });
    if (!order) {
      // e.g. a test ping or an order not created by this store -- ack so Cashfree stops retrying.
      return NextResponse.json({ received: true, skipped: 'order_not_found' });
    }
    if (order.status !== 'pending') {
      return NextResponse.json({ received: true, alreadyStatus: order.status });
    }

    const expected = expectedChargeRupees(order as any);
    if (Math.abs(Number(payment.payment_amount) - expected) > 0.01) {
      console.error(`[cashfree-webhook] amount mismatch for ${order.id}: expected ${expected}, got ${payment.payment_amount}`);
      return NextResponse.json({ received: true, skipped: 'amount_mismatch' });
    }

    const result = await markOrderPaidViaCashfree(order as any, String(payment.cf_payment_id), 'webhook');
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

    // Order-confirmed email, admin notification, loyalty, referral etc. (idempotent).
    runOrderConfirmationSideEffects(order.id).catch((err) => {
      console.error('[cashfree-webhook] order-confirmation side effects failed:', err);
    });

    return NextResponse.json({ received: true, orderId: order.id, status: 'paid' });
  } catch (err) {
    console.error('[cashfree-webhook] handler threw:', err);
    const message = err instanceof Error ? err.message : 'Webhook processing failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
