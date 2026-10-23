import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase-server';
import { sendEmail } from '@/lib/email';
import { contactMessageAdminNotification, contactMessageAutoReply } from '@/lib/email-templates';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Public "Contact Us" form submission. Saves the message to
// contact_messages (manageable from Admin > Contact Messages) and, best
// effort, emails the store's support address + an auto-reply to the
// customer. Email failures never block the submission — the message is
// always saved even if no email provider is configured yet.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const name = (body?.name || '').toString().trim();
  const email = (body?.email || '').toString().trim();
  const phone = (body?.phone || '').toString().trim();
  const subject = (body?.subject || '').toString().trim();
  const message = (body?.message || '').toString().trim();

  if (!name || !email || !subject || !message) {
    return NextResponse.json({ error: 'Name, email, subject and message are required' }, { status: 400 });
  }
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: 'Please enter a valid email address' }, { status: 400 });
  }

  const supabase = getServerSupabase();

  try {
    const { data: saved, error } = await supabase
      .from('contact_messages')
      .insert({ name, email, phone: phone || null, subject, message })
      .select('*')
      .single();

    if (error) throw error;

    // Best-effort notifications -- don't fail the request if email isn't configured.
    try {
      const { data: storeInfoRow } = await supabase
        .from('settings')
        .select('value')
        .eq('key', 'store_info')
        .maybeSingle();
      const supportEmail = storeInfoRow?.value?.support_email;

      if (supportEmail) {
        const notice = contactMessageAdminNotification({ id: saved.id, name, email, phone, subject, message });
        await sendEmail({ to: supportEmail, subject: notice.subject, html: notice.html });
      }

      const autoReply = contactMessageAutoReply({ name, subject });
      await sendEmail({ to: email, subject: autoReply.subject, html: autoReply.html });
    } catch (emailErr) {
      console.error('[contact] notification email failed:', emailErr);
    }

    return NextResponse.json({ success: true, data: saved });
  } catch (err) {
    console.error('[contact] failed to save message:', err);
    return NextResponse.json({ error: 'Failed to send message. Please try again.' }, { status: 500 });
  }
}
