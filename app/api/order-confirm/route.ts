import { NextResponse } from 'next/server';
import { runOrderConfirmationSideEffects } from '@/lib/order-confirmation';

// Called from the checkout page (app/checkout/page.tsx) right after an
// order is created/confirmed -- both COD and post-payment. Fire-and-forget
// from the client (`fetch(...).catch(() => {})`), so this must never throw
// in a way that leaves things half-done, and must be safe to call more
// than once for the same order (retries on a flaky connection, etc).
//
// The actual work (confirmation email, admin notification, abandoned-cart
// clearing, gift card redemption, loyalty points, referral reward) lives
// in lib/order-confirmation.ts, shared with app/api/razorpay/webhook/route.ts
// -- see that file's header comment for why an online order now also gets
// these side effects triggered server-side, not just from this route.
//
// REGRESSION HISTORY (see git log on this file): jobs 1, 3, 4, and 5 all
// existed and worked as of 4 Aug, and were further improved on 19 Aug
// (non-blocking email, this comment block). Later the same day the file
// was accidentally overwritten with a completely different, much older
// draft (a Razorpay-shaped webhook handler expecting `{ data: { custom:
// { order_id }}}` and writing to an `order_status` column that doesn't
// exist on `orders`) that had none of this -- wiping out the customer/
// admin emails, gift card redemption, loyalty points, and referral
// rewards in one shot. Two follow-up commits patched the abandoned-cart
// piece back to the new`{ orderId }` shape but never restored the rest.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const orderId = body?.orderId;
  if (!orderId) {
    return NextResponse.json({ error: 'Missing orderId' }, { status: 400 });
  }

  try {
    await runOrderConfirmationSideEffects(orderId);
    return NextResponse.json({ success: true, order_id: orderId, message: 'Order confirmed successfully' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to confirm order';
    console.error('[order-confirm] Unexpected error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
