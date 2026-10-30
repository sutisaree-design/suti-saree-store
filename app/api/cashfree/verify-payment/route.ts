import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { findSuccessfulCashfreePayment } from '@/lib/cashfree';
import { expectedChargeRupees, markOrderPaidViaCashfree, PAYABLE_ORDER_COLUMNS } from '@/lib/cashfree-mark-paid';

// Unlike Razorpay there is no client-supplied signature to trust: the browser only tells us
// WHICH internal order to check. We then ask Cashfree's server directly whether that order
// has a SUCCESS payment for the right amount -- the client can't fake that.
export async function POST(req: NextRequest) {
  try {
    const { internalOrderId } = await req.json().catch(() => ({}));
    if (!internalOrderId || typeof internalOrderId !== 'string') {
      return NextResponse.json({ error: 'internalOrderId is required' }, { status: 400 });
    }

    const admin = getSupabaseAdmin();
    const { data: order, error } = await admin
      .from('orders')
      .select(PAYABLE_ORDER_COLUMNS)
      .eq('id', internalOrderId)
      .maybeSingle();
    if (error || !order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    if (!order.cashfree_order_id) {
      return NextResponse.json({ error: 'No Cashfree payment started for this order' }, { status: 400 });
    }
    if (order.status === 'paid') return NextResponse.json({ success: true, verified: true });

    const found = await findSuccessfulCashfreePayment(order.cashfree_order_id);
    if (!found.ok) return NextResponse.json({ error: found.error }, { status: 502 });
    if (!found.payment) {
      return NextResponse.json({ error: 'Payment not completed', verified: false }, { status: 402 });
    }

    // Amount sanity check -- never mark paid if the captured amount doesn't match what we charged.
    const expected = expectedChargeRupees(order as any);
    if (Math.abs(Number(found.payment.payment_amount) - expected) > 0.01) {
      console.error(`[cashfree-verify] amount mismatch for ${order.id}: expected ${expected}, got ${found.payment.payment_amount}`);
      return NextResponse.json({ error: 'Payment amount mismatch' }, { status: 400 });
    }

    const result = await markOrderPaidViaCashfree(order as any, String(found.payment.cf_payment_id), 'verify');
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

    // Self-hosted blog conversion attribution (same as the Razorpay verify route).
    if (!result.alreadyPaid) {
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
        // non-fatal
      }
    }

    return NextResponse.json({ success: true, verified: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Verification failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
