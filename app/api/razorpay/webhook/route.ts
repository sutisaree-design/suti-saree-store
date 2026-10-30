import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { sendEmail } from '@/lib/email';
import { orderStatusUpdateEmail } from '@/lib/email-templates';
import { isInPaymentRequestFlow, logPaymentRequestEvent } from '@/lib/order-payment-events';
import { runOrderConfirmationSideEffects } from '@/lib/order-confirmation';

// WHY THIS ROUTE EXISTS
// -----------------------------------------------------------------------
// Before this file, the ONLY way an order's status went from 'pending' to
// 'paid' was /api/razorpay/verify-payment -- and that route is only ever
// called by the customer's own browser, from the Razorpay Checkout.js
// `handler` callback (see openRazorpayCheckout() in app/checkout/page.tsx).
//
// That callback fires in the browser *after* Razorpay has already
// captured the payment on their servers. If the browser tab/app closes,
// loses network, or crashes in that window -- payment already captured,
// customer already charged -- the callback never runs, verify-payment is
// never called, and the order sits at 'pending' forever. The Razorpay
// dashboard shows "Captured", the store shows "Payment Pending". That's
// the exact bug this route fixes.
//
// This route is a server-to-server webhook: Razorpay calls it directly
// from their backend when a payment is captured, independent of whatever
// happened in the customer's browser. Configure it in:
//   Razorpay Dashboard -> Settings -> Webhooks -> Add New Webhook
//   URL: https://<your-domain>/api/razorpay/webhook
//   Active events: payment.captured (order.paid optional/redundant)
//   Secret: put the same value in RAZORPAY_WEBHOOK_SECRET (.env)
// Note: this is a DIFFERENT secret from RAZORPAY_KEY_SECRET used to sign
// checkout orders -- Razorpay generates it specifically for the webhook.
//
// This route is intentionally idempotent and safe to run alongside
// verify-payment: whichever one reaches the order first while it's still
// 'pending' flips it to 'paid'; the other becomes a no-op.
export async function POST(req: NextRequest) {
  try {
    // Signature is computed over the exact raw request body, so this must
    // be read as text BEFORE any JSON parsing.
    const rawBody = await req.text();
    const signature = req.headers.get('x-razorpay-signature');

    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error('[razorpay-webhook] RAZORPAY_WEBHOOK_SECRET not configured');
      return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
    }

    if (!signature) {
      return NextResponse.json({ error: 'Missing signature header' }, { status: 400 });
    }

    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(rawBody)
      .digest('hex');

    // Constant-time compare -- avoid leaking timing info about the secret.
    const sigMatches =
      expectedSignature.length === signature.length &&
      crypto.timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(signature));

    if (!sigMatches) {
      console.error('[razorpay-webhook] signature mismatch');
      return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 400 });
    }

    const event = JSON.parse(rawBody);

    // We only act on payment.captured. order.paid fires around the same
    // time and would just race this handler for no benefit; ignoring it
    // keeps this idempotent without extra bookkeeping.
    if (event.event !== 'payment.captured') {
      return NextResponse.json({ received: true, skipped: event.event });
    }

    const payment = event.payload?.payment?.entity;
    const razorpayOrderId: string | undefined = payment?.order_id;
    const razorpayPaymentId: string | undefined = payment?.id;
    const amountPaise: number | undefined = payment?.amount;

    if (!razorpayOrderId || !razorpayPaymentId) {
      console.error('[razorpay-webhook] payload missing order_id/payment_id', event);
      // Acknowledge anyway -- retrying a malformed payload won't help.
      return NextResponse.json({ received: true, skipped: 'malformed_payload' });
    }

    const admin = getSupabaseAdmin();
    const { data: order, error: orderError } = await admin
      .from('orders')
      .select(
        'id, status, razorpay_order_id, total_amount, customer_name, customer_email, tracking_number, courier_name, items, payment_method, advance_amount'
      )
      .eq('razorpay_order_id', razorpayOrderId)
      .maybeSingle();

    if (orderError) {
      console.error('[razorpay-webhook] order lookup failed:', orderError);
      return NextResponse.json({ error: 'Order lookup failed' }, { status: 500 });
    }

    if (!order) {
      // Can legitimately happen for test-mode webhooks or orders created
      // outside this flow. Acknowledge so Razorpay doesn't keep retrying.
      console.error('[razorpay-webhook] no order matches razorpay_order_id', razorpayOrderId);
      return NextResponse.json({ received: true, skipped: 'order_not_found' });
    }

    // Idempotency: if verify-payment (or an earlier webhook delivery)
    // already marked this order paid, there's nothing left to do.
    if (order.status !== 'pending') {
      return NextResponse.json({ received: true, alreadyStatus: order.status });
    }

    // Sanity check: captured amount should match what we charged for.
    // Mismatch doesn't necessarily mean fraud (could be a partial capture
    // edge case), but it's worth a loud log rather than silently trusting it.
    const expectedPaise = Math.round(
      Number(order.payment_method === 'partial' ? order.advance_amount : order.total_amount) * 100
    );
    if (amountPaise != null && amountPaise !== expectedPaise) {
      console.error(
        `[razorpay-webhook] amount mismatch for order ${order.id}: expected ${expectedPaise}, got ${amountPaise}`
      );
    }

    const { error: updateError } = await admin
      .from('orders')
      .update({
        status: 'paid',
        payment_gateway: 'razorpay',
        razorpay_payment_id: razorpayPaymentId,
        ...(order.payment_method === 'partial'
          ? {
              advance_payment_id: razorpayPaymentId,
              advance_paid_at: new Date().toISOString(),
              balance_due: Math.max(0, Number(order.total_amount) - Number(order.advance_amount)),
            }
          : {}),
      })
      .eq('id', order.id)
      .eq('status', 'pending'); // guards against a race with verify-payment

    if (updateError) {
      console.error('[razorpay-webhook] failed to update order status:', updateError);
      return NextResponse.json({ error: 'Failed to update order status' }, { status: 500 });
    }

    const inPaymentRequestFlow = await isInPaymentRequestFlow(order.id).catch(() => false);
    if (inPaymentRequestFlow) {
      logPaymentRequestEvent(order.id, 'payment_verified', {
        meta: { razorpay_payment_id: razorpayPaymentId, via: 'webhook' },
      }).catch(() => {});
    }

    // Same "payment confirmed" email verify-payment sends -- a customer
    // whose order is only ever confirmed via this webhook (because their
    // browser never called back) should still get their confirmation email.
    if (order.customer_email) {
      const { subject, html } = orderStatusUpdateEmail({
        id: order.id,
        customer_name: order.customer_name,
        status: 'paid',
        tracking_number: order.tracking_number,
        courier_name: order.courier_name,
        items: order.items,
        total_amount: order.total_amount,
        isPaymentRequestFlow: inPaymentRequestFlow,
        payment_method: order.payment_method,
        advance_amount: order.advance_amount,
      });
      sendEmail({ to: order.customer_email, subject, html }).catch((err) => {
        console.error('[razorpay-webhook] payment-confirmed email failed:', err);
      });
    }

    // Same "order confirmed" side effects the checkout page normally
    // triggers itself (app/checkout/page.tsx -> POST /api/order-confirm)
    // right after openRazorpayCheckout() resolves in the browser: the
    // "Order Confirmed" email, admin new-order notification, abandoned-cart
    // clearing, gift card redemption, loyalty points, and referral reward.
    // That client call is gated behind the exact same browser round-trip
    // as verify-payment -- if the tab/app closed or the network dropped
    // right after Razorpay captured the payment, none of those five things
    // ever ran either, even once the order itself is correctly marked
    // 'paid'. Running it here closes that gap: it's idempotent (guarded by
    // confirmation_email_sent_at / existing ledger rows, same as the
    // client-triggered path), so if the browser call DID also succeed,
    // this is just a harmless no-op.
    runOrderConfirmationSideEffects(order.id).catch((err) => {
      console.error('[razorpay-webhook] order-confirmation side effects failed:', err);
    });

    return NextResponse.json({ received: true, orderId: order.id, status: 'paid' });
  } catch (err) {
    console.error('[razorpay-webhook] handler threw:', err);
    const message = err instanceof Error ? err.message : 'Webhook processing failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
