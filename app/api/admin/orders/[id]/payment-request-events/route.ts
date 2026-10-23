import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAdminToken, ADMIN_SESSION_COOKIE } from '@/lib/admin-auth';
import { getPaymentRequestEvents } from '@/lib/order-payment-events';

// Admin > Orders > "Test Notifications" > "Online payment request
// activity". Returns the full order_payment_request_events timeline for
// one order -- when the admin clicked "Request Online Payment", when the
// email went out/was opened, whether the customer clicked it (or opened
// the payment page from their account instead), and when they tried/
// completed/failed the actual payment.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const cookie = cookies().get(ADMIN_SESSION_COOKIE)?.value ?? null;
  const verified = await verifyAdminToken(cookie);
  if (!verified.valid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const events = await getPaymentRequestEvents(params.id);
    return NextResponse.json({ events });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to load activity' }, { status: 500 });
  }
}
