import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAdminToken, ADMIN_SESSION_COOKIE } from '@/lib/admin-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { sendEmail } from '@/lib/email';
import { supportTicketReplyEmail } from '@/lib/email-templates';

const VALID_STATUSES = ['open', 'in_progress', 'resolved', 'closed'];

// PATCH body:
//   { status?, admin_notes? }   -> plain status/notes update (unchanged)
//   { reply_message: string,
//     reply_attachment_url?: string,   -> optional photo/PDF from
//                                          /api/admin/support-tickets/upload-attachment
//     suggested_product?: {            -> optional product picked from
//       id, name, slug, image, price      /api/admin/products/search
//     } | null }
//   -> emails the customer via the configured provider (Resend/ZeptoMail),
//      then stamps reply_message/replied_at (+ the attachment/suggestion,
//      if any) and bumps status to 'in_progress' if it was still 'open'.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const cookie = cookies().get(ADMIN_SESSION_COOKIE)?.value ?? null;
  const verified = await verifyAdminToken(cookie);
  if (!verified.valid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { status, admin_notes, reply_message, reply_attachment_url, suggested_product } = body || {};

  if (!status && admin_notes === undefined && !reply_message) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }
  if (
    reply_attachment_url !== undefined &&
    reply_attachment_url !== null &&
    typeof reply_attachment_url !== 'string'
  ) {
    return NextResponse.json({ error: 'Invalid attachment' }, { status: 400 });
  }
  if (
    suggested_product !== undefined &&
    suggested_product !== null &&
    (typeof suggested_product !== 'object' || !suggested_product.id || !suggested_product.name)
  ) {
    return NextResponse.json({ error: 'Invalid suggested product' }, { status: 400 });
  }
  if (status && !VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  try {
    let ticket: any = null;
    if (reply_message && reply_message.trim()) {
      const { data, error: fetchErr } = await supabase
        .from('support_tickets')
        .select('*')
        .eq('id', params.id)
        .single();
      if (fetchErr) throw fetchErr;
      ticket = data;

      const tpl = supportTicketReplyEmail({
        id: ticket.id,
        customer_name: ticket.customer_name,
        subject: ticket.subject,
        message: ticket.message,
        reply_message: reply_message.trim(),
        reply_attachment_url: reply_attachment_url || null,
        suggested_product: suggested_product || null,
      });
      const emailResult = await sendEmail({ to: ticket.customer_email, subject: tpl.subject, html: tpl.html });

      if (!emailResult.success) {
        return NextResponse.json(
          {
            error: emailResult.skipped
              ? 'Email provider not configured — set it up in Admin > Settings > Email Notifications.'
              : 'Failed to send reply email',
          },
          { status: 502 }
        );
      }
    }

    const updatePayload: Record<string, any> = {};
    if (status) updatePayload.status = status;
    if (admin_notes !== undefined) updatePayload.admin_notes = admin_notes;
    if (reply_message && reply_message.trim()) {
      updatePayload.reply_message = reply_message.trim();
      updatePayload.replied_at = new Date().toISOString();
      // reply_attachment_url / suggested_product are optional add-ons to
      // the same reply -- explicit null clears a previously-set value
      // (e.g. admin removes the attachment/suggestion before sending),
      // undefined leaves the column untouched.
      if (reply_attachment_url !== undefined) {
        updatePayload.reply_attachment_url = reply_attachment_url;
      }
      if (suggested_product !== undefined) {
        updatePayload.suggested_product_id = suggested_product?.id || null;
        updatePayload.suggested_product = suggested_product || null;
      }
      // Don't clobber an explicit status the admin also sent in the same
      // request -- only auto-advance 'open' -> 'in_progress' when they
      // didn't already pick a status themselves.
      if (!status && ticket?.status === 'open') {
        updatePayload.status = 'in_progress';
      }
    }

    const { data: updated, error } = await supabase
      .from('support_tickets')
      .update(updatePayload)
      .eq('id', params.id)
      .select('*')
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, data: updated });
  } catch (err) {
    console.error('[admin/support-tickets] update failed:', err);
    return NextResponse.json({ error: 'Failed to update support ticket' }, { status: 500 });
  }
}
