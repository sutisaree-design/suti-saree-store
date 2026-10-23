import { NextResponse } from 'next/server';
import { getCurrentUser, getSupabaseServer } from '@/lib/supabase-server-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { sendEmail } from '@/lib/email';
import { orderTrackingSummaryEmail } from '@/lib/email-templates';

// Sends the shopper a copy of the order status/tracking info shown in
// the chat widget, to their own account email (if logged in) or the
// checkout email they just verified (guest flow) — never to an
// arbitrary address supplied in the request.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const orderId = typeof body?.orderId === 'string' ? body.orderId.trim() : '';
  const guestEmail = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';

  if (!orderId) {
    return NextResponse.json({ ok: false, error: 'Missing order ID.' }, { status: 200 });
  }

  try {
    const user = await getCurrentUser();
    let order: any = null;

    if (user) {
      const supabase = await getSupabaseServer();
      const { data } = await supabase
        .from('orders')
        .select('id, status, items, total_amount, customer_name, customer_email, tracking_number, courier_name')
        .or(`user_id.eq.${user.id},customer_email.eq.${user.email}`)
        .eq('id', orderId)
        .maybeSingle();
      order = data;
    } else if (guestEmail) {
      const supabase = getSupabaseAdmin();
      const { data } = await supabase
        .from('orders')
        .select('id, status, items, total_amount, customer_name, customer_email, tracking_number, courier_name')
        .eq('id', orderId)
        .eq('customer_email', guestEmail)
        .maybeSingle();
      order = data;
    }

    if (!order) {
      return NextResponse.json({ ok: false, error: 'Order not found.' }, { status: 200 });
    }

    const recipient = user?.email || order.customer_email;
    if (!recipient) {
      return NextResponse.json({ ok: false, error: 'No email on file for this order.' }, { status: 200 });
    }

    const { subject, html } = orderTrackingSummaryEmail({
      id: order.id,
      customer_name: order.customer_name,
      status: order.status,
      courier_name: order.courier_name,
      tracking_number: order.tracking_number,
      items: order.items,
      total_amount: order.total_amount,
    });

    const result = await sendEmail({ to: recipient, subject, html });
    if (!result.success) {
      return NextResponse.json({ ok: false, error: 'Could not send the email right now.' }, { status: 200 });
    }

    return NextResponse.json({ ok: true, sentTo: recipient });
  } catch (err) {
    console.error('[chat/email-order] error:', err);
    return NextResponse.json({ ok: false, error: 'Could not send the email right now.' }, { status: 200 });
  }
}
