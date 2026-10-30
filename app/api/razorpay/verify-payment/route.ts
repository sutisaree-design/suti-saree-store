import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { cookies } from 'next/headers';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { sendEmail } from '@/lib/email';
import { orderStatusUpdateEmail } from '@/lib/email-templates';
import { isInPaymentRequestFlow, logPaymentRequestEvent } from '@/lib/order-payment-events';

// SECURITY: this route now does the `orders` status update itself,
// using the service-role client, instead of just returning
// `verified: true` and letting the browser (anon key) write
// status: 'paid' directly. Previously, RLS allowed anon to update ANY
// order to ANY status regardless of whether this route was ever
// called — so a payment could be "verified" here and still never
// actually mark the order paid the legitimate way, or worse, the
// client-side write could be called directly with a forged/never-
// verified payload. Now:
//   1. the Razorpay signature is checked (unchanged logic)
//   2. the order is looked up by internalOrderId
//   3. the order's stored razorpay_order_id must match the one in this
//      request (prevents replaying a valid signature from a different,
//      possibly cheaper, order against this order)
//   4. only then is status flipped to 'paid', and only from 'pending'
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, internalOrderId } = body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !internalOrderId) {
      return NextResponse.json(
        { error: 'Missing required payment fields' },
        { status: 400 }
      );
    }

    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keySecret) {
      return NextResponse.json(
        { error: 'Razorpay key secret not configured' },
        { status: 500 }
      );
    }

    // Verify the signature: HMAC SHA256 of `razorpay_order_id|razorpay_payment_id` using key_secret
    const expectedSignature = crypto
      .createHmac('sha256', keySecret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      isInPaymentRequestFlow(internalOrderId)
        .then((inFlow) => {
          if (inFlow) return logPaymentRequestEvent(internalOrderId, 'payment_failed', { meta: { reason: 'signature_mismatch' } });
        })
        .catch(() => {});
      return NextResponse.json(
        { error: 'Payment signature verification failed' },
        { status: 400 }
      );
    }

    const admin = getSupabaseAdmin();
    const { data: order, error: orderError } = await admin
      .from('orders')
      .select(
        'id, status, razorpay_order_id, total_amount, customer_name, customer_email, tracking_number, courier_name, items, payment_method, advance_amount'
      )
      .eq('id', internalOrderId)
      .maybeSingle();

    if (orderError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    if (order.razorpay_order_id !== razorpay_order_id) {
      return NextResponse.json(
        { error: 'Payment does not match this order' },
        { status: 400 }
      );
    }

    if (order.status !== 'pending') {
      // Already paid (or failed) — treat as idempotent success only if
      // already paid, otherwise refuse.
      if (order.status === 'paid') {
        return NextResponse.json({ success: true, verified: true });
      }
      return NextResponse.json({ error: `Order is ${order.status}` }, { status: 409 });
    }

    const { error: updateError } = await admin
      .from('orders')
      .update({
        status: 'paid',
        payment_gateway: 'razorpay',
        razorpay_payment_id,
        razorpay_signature,
        // Partial Pay: record the advance and what is still due on delivery.
        ...(order.payment_method === 'partial'
          ? {
              advance_payment_id: razorpay_payment_id,
              advance_paid_at: new Date().toISOString(),
              balance_due: Math.max(0, Number(order.total_amount) - Number(order.advance_amount)),
            }
          : {}),
      })
      .eq('id', internalOrderId)
      .eq('status', 'pending');

    if (updateError) {
      return NextResponse.json({ error: 'Failed to update order status' }, { status: 500 });
    }

    const inPaymentRequestFlow = await isInPaymentRequestFlow(internalOrderId).catch(() => false);

    if (inPaymentRequestFlow) {
      logPaymentRequestEvent(internalOrderId, 'payment_verified', { meta: { razorpay_payment_id } }).catch(() => {});
    }

    // Was previously silent: this route writes status:'paid' directly
    // (see the security note above for why), which bypasses
    // updateOrderStatus() in lib/orders-api.ts -- the function that
    // normally sends the "payment confirmed" email on any admin-driven
    // status change. That meant a customer who paid online never
    // actually got a "we've received your payment" email. Best-effort,
    // same as every other lifecycle email here: a slow/broken email
    // provider must never fail the payment itself.
    //
    // isPaymentRequestFlow: only true for orders that went through Admin >
    // "Request Online Payment" -- that's the only case where the
    // made/kept-ready-on-demand "sorry for the inconvenience" copy in the
    // 'paid' template actually applies. A regular customer who checked
    // out and paid immediately should just get a plain confirmation.
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
        console.error('[verify-payment] payment-confirmed email failed:', err);
      });
    }

    // Self-hosted blog conversion attribution — if this browser visited a
    // blog post in the last 30 minutes (see BlogViewTracker), credit this
    // sale to that post in blog_analytics_events. Best-effort: a failure
    // here must never block the actual order confirmation.
    try {
      const lastBlogSlug = cookies().get('last_blog_slug')?.value;
      if (lastBlogSlug) {
        await admin.from('blog_analytics_events').insert({
          blog_slug: lastBlogSlug,
          event_type: 'conversion',
          amount: order.total_amount,
        });
      }
    } catch {
      // non-fatal — order is already confirmed above
    }

    return NextResponse.json({ success: true, verified: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Verification failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
