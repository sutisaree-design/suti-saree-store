import { NextResponse } from 'next/server';
import { getCurrentUser, getSupabaseServer } from '@/lib/supabase-server-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { sendEmail } from '@/lib/email';
import { returnRequestedCustomerEmail, returnRequestedAdminNotification } from '@/lib/email-templates';

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: 'You must be logged in to request a return or exchange.' },
      { status: 401 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const orderId     = (body?.order_id    || '').toString().trim();
  const type        = body?.type === 'exchange' ? 'exchange' : 'return';
  const reason      = (body?.reason      || '').toString().trim();
  const reasonKey   = (body?.reason_key  || '').toString().trim();
  const desiredSize = type === 'exchange' ? (body?.desired_size || '').toString().trim() : null;

  if (!orderId || !reason) {
    return NextResponse.json({ error: 'Order and reason are required.' }, { status: 400 });
  }

  const supabase = await getSupabaseServer();
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('id, user_id, customer_name, customer_email, status')
    .eq('id', orderId)
    .single();

  if (orderError || !order) {
    return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
  }

  const ownsByEmail =
    !!order.customer_email &&
    !!user.email &&
    order.customer_email.toLowerCase() === user.email.toLowerCase();
  if (order.user_id !== user.id && !ownsByEmail) {
    return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
  }

  const admin = getSupabaseAdmin();
  const insertData: Record<string, unknown> = {
    order_id: orderId,
    user_id: user.id,
    type,
    reason,
  };
  if (reasonKey)   insertData.reason_key   = reasonKey;
  if (desiredSize) insertData.desired_size = desiredSize;

  const { data: created, error: insertError } = await admin
    .from('returns')
    .insert(insertData)
    .select('*')
    .single();

  if (insertError || !created) {
    return NextResponse.json(
      { error: 'Failed to submit your request. Please try again.' },
      { status: 500 }
    );
  }

  // Best-effort notifications
  try {
    const customerEmail = order.customer_email || user.email;
    if (customerEmail) {
      const { subject, html } = returnRequestedCustomerEmail({
        id: created.id,
        order_id: created.order_id,
        type: created.type,
        reason: created.reason,
      });
      await sendEmail({ to: customerEmail, subject, html });
    }

    const { data: storeInfoRow } = await admin
      .from('settings')
      .select('value')
      .eq('key', 'store_info')
      .maybeSingle();
    const supportEmail = (storeInfoRow?.value as { support_email?: string } | null)?.support_email;
    if (supportEmail) {
      const notice = returnRequestedAdminNotification({
        id: created.id,
        order_id: created.order_id,
        type: created.type,
        reason: created.reason,
        customer_name: order.customer_name,
        customer_email: order.customer_email,
      });
      await sendEmail({ to: supportEmail, subject: notice.subject, html: notice.html });
    }
  } catch (emailErr) {
    console.error('[returns] notification email failed:', emailErr);
  }

  return NextResponse.json({ success: true, data: created });
}
