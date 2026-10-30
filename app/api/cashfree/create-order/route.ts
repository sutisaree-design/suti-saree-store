import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { isGatewayAllowed } from '@/lib/payment-gateways-server';
import { isInPaymentRequestFlow, logPaymentRequestEvent } from '@/lib/order-payment-events';
import { createCashfreeOrder, getCashfreeMode, isCashfreeConfigured, newCashfreeOrderId } from '@/lib/cashfree';

// Same security model as /api/razorpay/create-order: the amount is NEVER taken from the
// client. It is read from the `orders` row (set by place_order_with_items() / the partial-pay
// trigger) using internalOrderId.
export async function POST(req: NextRequest) {
  try {
    const { internalOrderId } = await req.json().catch(() => ({}));
    if (!internalOrderId || typeof internalOrderId !== 'string') {
      return NextResponse.json({ error: 'internalOrderId is required' }, { status: 400 });
    }

    if (!(await isGatewayAllowed('cashfree'))) {
      return NextResponse.json({ error: 'Online payment via Cashfree is currently unavailable.' }, { status: 403 });
    }
    if (!isCashfreeConfigured()) {
      return NextResponse.json(
        { error: 'Cashfree keys not configured. Set CASHFREE_APP_ID and CASHFREE_SECRET_KEY in .env' },
        { status: 500 }
      );
    }

    const admin = getSupabaseAdmin();
    const { data: order, error: orderError } = await admin
      .from('orders')
      .select('id, total_amount, status, payment_method, advance_amount, customer_name, customer_email, customer_phone')
      .eq('id', internalOrderId)
      .maybeSingle();

    if (orderError || !order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    if (order.status !== 'pending') {
      return NextResponse.json(
        { error: `Order is already ${order.status}; cannot create a new payment for it` },
        { status: 409 }
      );
    }

    const isPartial = order.payment_method === 'partial';
    const chargeAmount = isPartial ? Number(order.advance_amount) : Number(order.total_amount);
    if (!chargeAmount || chargeAmount < 1) {
      return NextResponse.json({ error: 'Order has an invalid amount' }, { status: 400 });
    }

    const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || req.nextUrl.origin).replace(/\/$/, '');
    const isHttps = siteUrl.startsWith('https://');
    const cashfreeOrderId = newCashfreeOrderId(internalOrderId);

    const created = await createCashfreeOrder({
      cashfreeOrderId,
      amountRupees: chargeAmount,
      internalOrderId,
      customerName: order.customer_name,
      customerEmail: order.customer_email,
      customerPhone: order.customer_phone,
      // Cashfree only accepts https URLs in production.
      returnUrl: isHttps ? `${siteUrl}/order-confirmation/${internalOrderId}` : undefined,
      notifyUrl: isHttps ? `${siteUrl}/api/cashfree/webhook` : undefined,
      note: isPartial ? 'Partial advance' : 'Sutisaree order',
    });

    if (!created.ok) {
      return NextResponse.json({ error: created.error }, { status: created.status >= 400 ? created.status : 500 });
    }

    const { error: updateError } = await admin
      .from('orders')
      .update({ cashfree_order_id: cashfreeOrderId, payment_gateway: 'cashfree' })
      .eq('id', internalOrderId)
      .eq('status', 'pending');
    if (updateError) return NextResponse.json({ error: 'Failed to link payment order' }, { status: 500 });

    isInPaymentRequestFlow(internalOrderId)
      .then((inFlow) => {
        if (inFlow) {
          return logPaymentRequestEvent(internalOrderId, 'payment_attempt_created', {
            meta: { cashfree_order_id: cashfreeOrderId },
          });
        }
      })
      .catch(() => {});

    return NextResponse.json({
      success: true,
      paymentSessionId: created.data.payment_session_id,
      cashfreeOrderId,
      mode: getCashfreeMode(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create Cashfree order';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
