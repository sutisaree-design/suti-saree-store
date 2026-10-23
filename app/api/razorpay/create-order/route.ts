import { NextRequest, NextResponse } from 'next/server';
import Razorpay from 'razorpay';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { isInPaymentRequestFlow, logPaymentRequestEvent } from '@/lib/order-payment-events';

// SECURITY: amount is NEVER taken from the request body anymore. It is
// looked up server-side from the `orders` row (total_amount, set by the
// authoritative place_order_with_items() RPC) using internalOrderId.
// Previously this route trusted a client-supplied `amount` directly,
// letting anyone open dev tools and create a Razorpay order for any
// amount they chose regardless of what the cart actually cost.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { internalOrderId } = body;

    if (!internalOrderId || typeof internalOrderId !== 'string') {
      return NextResponse.json({ error: 'internalOrderId is required' }, { status: 400 });
    }

    const admin = getSupabaseAdmin();
    const { data: order, error: orderError } = await admin
      .from('orders')
      .select('id, total_amount, status, payment_method, advance_amount')
      .eq('id', internalOrderId)
      .maybeSingle();

    if (orderError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    if (order.status !== 'pending') {
      return NextResponse.json(
        { error: `Order is already ${order.status}; cannot create a new payment for it` },
        { status: 409 }
      );
    }

    // Partial Pay: only the advance is charged online; the balance is collected on delivery.
    // advance_amount is computed by the orders_apply_partial_pay() DB trigger, never by the client.
    const isPartial = order.payment_method === 'partial';
    const chargeAmount = isPartial ? Number(order.advance_amount) : Number(order.total_amount);
    const amountPaise = Math.round(chargeAmount * 100);
    if (!amountPaise || amountPaise < 1) {
      return NextResponse.json({ error: 'Order has an invalid amount' }, { status: 400 });
    }

    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    if (!keyId || !keySecret) {
      return NextResponse.json(
        { error: 'Razorpay keys not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in .env' },
        { status: 500 }
      );
    }

    const rzp = new Razorpay({
      key_id: keyId,
      key_secret: keySecret,
    });

    const options = {
      amount: amountPaise, // authoritative amount, in paise, from the DB (advance only for partial orders)
      currency: 'INR',
      receipt: internalOrderId,
      notes: {
        internal_order_id: internalOrderId,
        ...(isPartial ? { payment_type: 'partial_advance' } : {}),
      },
    };

    const rzpOrder = await rzp.orders.create(options);

    // Persist the mapping so verify-payment can confirm the signature it
    // receives actually belongs to *this* internal order, not a replayed
    // signature from a different (cheaper) order.
    const { error: updateError } = await admin
      .from('orders')
      .update({ razorpay_order_id: rzpOrder.id })
      .eq('id', internalOrderId)
      .eq('status', 'pending');

    if (updateError) {
      return NextResponse.json({ error: 'Failed to link payment order' }, { status: 500 });
    }

    // Best-effort, and only for orders that went through Admin >
    // "Request Online Payment" -- ordinary checkout/resume-cart online
    // orders never touch order_payment_request_events.
    isInPaymentRequestFlow(internalOrderId)
      .then((inFlow) => {
        if (inFlow) {
          return logPaymentRequestEvent(internalOrderId, 'payment_attempt_created', {
            meta: { razorpay_order_id: rzpOrder.id },
          });
        }
      })
      .catch(() => {});

    return NextResponse.json({
      success: true,
      order: {
        id: rzpOrder.id,
        amount: rzpOrder.amount,
        currency: rzpOrder.currency,
        receipt: rzpOrder.receipt,
        status: rzpOrder.status,
      },
      keyId: keyId, // expose key ID to frontend for checkout.js
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create Razorpay order';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
