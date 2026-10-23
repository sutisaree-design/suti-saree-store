import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/supabase-server-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { sendEmail } from '@/lib/email';
import { supportTicketConfirmationEmail } from '@/lib/email-templates';

const MAX_LEN = 800;

// Lets the AI chat widget raise a support ticket on the shopper's
// behalf when a question needs a human (delayed order, wrong item,
// anything the AI/quick-reply flow can't resolve on its own). Visible
// and manageable from Admin > Support Tickets.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const orderId = typeof body?.orderId === 'string' ? body.orderId.trim() || null : null;
  const subject = typeof body?.subject === 'string' ? body.subject.trim().slice(0, 150) : 'Support request from chat';
  const message = typeof body?.message === 'string' ? body.message.trim().slice(0, MAX_LEN) : '';
  let email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  let name = typeof body?.name === 'string' ? body.name.trim().slice(0, 120) : '';
  // Set by the widget after a successful /api/chat/upload-attachment call
  // — just a URL we already trust (we minted it), so a light sanity check
  // is enough rather than re-validating the whole upload here.
  const attachmentUrl =
    typeof body?.attachmentUrl === 'string' && body.attachmentUrl.startsWith('http')
      ? body.attachmentUrl.slice(0, 500)
      : null;

  if (!message) {
    return NextResponse.json({ ok: false, error: 'Please describe the issue before raising a ticket.' }, { status: 200 });
  }

  try {
    const user = await getCurrentUser();
    if (user) {
      email = email || user.email || '';
      name = name || (user.user_metadata?.full_name as string | undefined) || '';
    }

    if (!email) {
      return NextResponse.json({
        ok: false,
        needsEmail: true,
        error: 'Please share the email you want us to follow up on.',
      }, { status: 200 });
    }

    const supabase = getSupabaseAdmin();
    const { data: ticket, error } = await supabase
      .from('support_tickets')
      .insert({
        order_id: orderId,
        user_id: user?.id || null,
        customer_name: name || null,
        customer_email: email,
        subject,
        message,
        attachment_url: attachmentUrl,
        source: 'chat',
        status: 'open',
      })
      .select('*')
      .single();

    if (error) throw error;

    sendEmail({
      to: email,
      ...supportTicketConfirmationEmail({
        id: ticket.id,
        subject: ticket.subject,
        message: ticket.message,
        customer_name: name,
      }),
    }).catch(() => {});

    return NextResponse.json({
      ok: true,
      ticketId: ticket.id,
      shortId: `#${String(ticket.id).slice(0, 8).toUpperCase()}`,
    });
  } catch (err) {
    console.error('[chat/raise-ticket] error:', err);
    return NextResponse.json({ ok: false, error: 'Could not raise a ticket right now — please try WhatsApp instead.' }, { status: 200 });
  }
}
