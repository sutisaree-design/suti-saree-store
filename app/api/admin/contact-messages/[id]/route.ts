import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAdminToken, ADMIN_SESSION_COOKIE } from '@/lib/admin-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { sendEmail } from '@/lib/email';
import { contactMessageReplyEmail } from '@/lib/email-templates';

const VALID_STATUSES = ['new', 'read', 'replied', 'closed'];

// PATCH body:
//   { status?, admin_notes? }                 -> plain status/notes update
//   { reply_message: string }                 -> emails the customer, then
//                                                  marks the message 'replied'
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const cookie = cookies().get(ADMIN_SESSION_COOKIE)?.value ?? null;
  const verified = await verifyAdminToken(cookie);
  if (!verified.valid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { status, admin_notes, reply_message } = body || {};

  if (!status && admin_notes === undefined && !reply_message) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }
  if (status && !VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  try {
    if (reply_message && reply_message.trim()) {
      const { data: msg, error: fetchErr } = await supabase
        .from('contact_messages')
        .select('*')
        .eq('id', params.id)
        .single();
      if (fetchErr) throw fetchErr;

      const tpl = contactMessageReplyEmail({
        customer_name: msg.name,
        original_subject: msg.subject,
        reply_message: reply_message.trim(),
      });
      const emailResult = await sendEmail({ to: msg.email, subject: tpl.subject, html: tpl.html });

      if (!emailResult.success) {
        return NextResponse.json(
          { error: emailResult.skipped ? 'Email provider not configured — set it up in Admin > Settings.' : 'Failed to send reply email' },
          { status: 502 }
        );
      }
    }

    const updatePayload: Record<string, any> = {};
    if (status) updatePayload.status = status;
    if (admin_notes !== undefined) updatePayload.admin_notes = admin_notes;
    if (reply_message && reply_message.trim()) {
      updatePayload.status = 'replied';
      updatePayload.replied_at = new Date().toISOString();
    }

    const { data: updated, error } = await supabase
      .from('contact_messages')
      .update(updatePayload)
      .eq('id', params.id)
      .select('*')
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, data: updated });
  } catch (err) {
    console.error('[admin/contact-messages] update failed:', err);
    return NextResponse.json({ error: 'Failed to update message' }, { status: 500 });
  }
}
