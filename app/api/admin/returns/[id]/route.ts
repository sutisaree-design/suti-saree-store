import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAdminToken, ADMIN_SESSION_COOKIE } from '@/lib/admin-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { sendEmail } from '@/lib/email';
import { returnStatusEmail } from '@/lib/email-templates';
import { getReturnAutomationMode, schedulePickupForReturn, processRefundForReturn } from '@/lib/return-automation';

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const cookie = cookies().get(ADMIN_SESSION_COOKIE)?.value ?? null;
  const verified = await verifyAdminToken(cookie);
  if (!verified.valid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const {
    status,
    admin_notes,
    refund_amount,
    // Exchange shipping fields
    exchange_courier,
    exchange_tracking_number,
    exchange_shipped_at,
    exchange_ready_date,
  } = body || {};

  const hasUpdate =
    status !== undefined ||
    admin_notes !== undefined ||
    refund_amount !== undefined ||
    exchange_courier !== undefined ||
    exchange_tracking_number !== undefined ||
    exchange_shipped_at !== undefined ||
    exchange_ready_date !== undefined;

  if (!hasUpdate) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  const validStatuses = ['requested', 'approved', 'rejected', 'refunded', 'completed'];
  if (status && !validStatuses.includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  try {
    const updatePayload: Record<string, any> = {};
    if (status !== undefined) updatePayload.status = status;
    if (admin_notes !== undefined) updatePayload.admin_notes = admin_notes;
    if (refund_amount !== undefined) updatePayload.refund_amount = refund_amount;
    if (exchange_courier !== undefined) updatePayload.exchange_courier = exchange_courier;
    if (exchange_tracking_number !== undefined) updatePayload.exchange_tracking_number = exchange_tracking_number;
    if (exchange_shipped_at !== undefined) updatePayload.exchange_shipped_at = exchange_shipped_at;
    if (exchange_ready_date !== undefined) updatePayload.exchange_ready_date = exchange_ready_date;

    if (status && ['refunded', 'completed', 'rejected'].includes(status)) {
      updatePayload.resolved_at = new Date().toISOString();
    }

    let { data: updated, error } = await supabase
      .from('returns')
      .update(updatePayload)
      .eq('id', params.id)
      .select('*')
      .single();

    if (error) throw error;

    // Fetch full order context
    const { data: order } = await supabase
      .from('orders')
      .select(
        'id, customer_name, customer_email, customer_phone, shipping_address, items, total_amount, payment_method, razorpay_payment_id'
      )
      .eq('id', updated.order_id)
      .single();

    // Auto-schedule pickup on approval
    if (status === 'approved' && order) {
      const mode = await getReturnAutomationMode(supabase);
      if (mode === 'automatic') {
        await schedulePickupForReturn(supabase, updated, order);
        const { data: refreshed } = await supabase
          .from('returns')
          .select('*')
          .eq('id', params.id)
          .single();
        if (refreshed) updated = refreshed;
      }
    }

    // Auto-refund on manual 'refunded' status
    if (status === 'refunded' && order && updated.refund_status !== 'refunded') {
      await processRefundForReturn(supabase, updated, order);
      const { data: refreshed } = await supabase
        .from('returns')
        .select('*')
        .eq('id', params.id)
        .single();
      if (refreshed) updated = refreshed;
    }

    // Send exchange shipped email when exchange_shipped_at is set
    if (exchange_shipped_at && order?.customer_email) {
      const trackingInfo = exchange_tracking_number
        ? `Tracking: ${exchange_tracking_number}${exchange_courier ? ` (${exchange_courier})` : ''}`
        : exchange_courier
        ? `Courier: ${exchange_courier}`
        : '';
      await sendEmail({
        to: order.customer_email,
        subject: `Aapka exchange item ship ho gaya — Order #${updated.order_id.slice(0, 8)}`,
        html: `
          <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px">
            <h2 style="margin:0 0 16px">Exchange Item Ship Ho Gaya! 🎉</h2>
            <p>Namaste ${order.customer_name || 'Customer'},</p>
            <p>Aapka exchange item dispatch ho gaya hai.</p>
            ${trackingInfo ? `<p><strong>${trackingInfo}</strong></p>` : ''}
            <p>Koi sawaal ho toh reply karen.</p>
          </div>
        `,
      }).catch(() => {});
    }

    // Send ready-date email when exchange_ready_date is set (and not shipping yet)
    if (exchange_ready_date && !exchange_shipped_at && order?.customer_email) {
      const readyDateStr = new Date(exchange_ready_date).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
      await sendEmail({
        to: order.customer_email,
        subject: `Exchange update — Order #${updated.order_id.slice(0, 8)}`,
        html: `
          <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px">
            <h2 style="margin:0 0 16px">Exchange Update</h2>
            <p>Namaste ${order.customer_name || 'Customer'},</p>
            <p>Aapka desired size/colour abhi hamare paas stock mein nahi hai, lekin <strong>${readyDateStr}</strong> tak ready ho jayega.</p>
            <p>Jaise hi ready hoga, hum turant ship karenge aur aapko tracking details bhejenge.</p>
            <p>Wait karne ke liye shukriya!</p>
          </div>
        `,
      }).catch(() => {});
    }

    // General status-change email
    if (status && updated && order?.customer_email) {
      const { subject, html } = returnStatusEmail({
        id: updated.id,
        order_id: updated.order_id,
        type: updated.type,
        status: updated.status,
        admin_notes: updated.admin_notes,
        refund_amount: updated.refund_amount,
      });
      sendEmail({ to: order.customer_email, subject, html }).catch(() => {});
    }

    return NextResponse.json({ success: true, data: updated });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to update return request' }, { status: 500 });
  }
}
