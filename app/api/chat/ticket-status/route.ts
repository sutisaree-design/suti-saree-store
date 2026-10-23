import { NextResponse } from 'next/server';
import { getCurrentUser, getSupabaseServer } from '@/lib/supabase-server-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

// ---------------------------------------------------------------------
// Deterministic (non-AI) support-ticket status lookup used by the chat
// widget's "Check my ticket" quick reply. Mirrors app/api/chat/
// order-lookup/route.ts:
//
// Logged-in shopper -> their own tickets (RLS-scoped by user_id/email),
//                      no extra info needed.
// Guest / not logged in -> needs the email used when raising the ticket;
//                          optionally a ticket ID to narrow to one.
// ---------------------------------------------------------------------

const MAX_TICKETS = 5;

function shortId(id: string) {
  return `#${String(id).slice(0, 8).toUpperCase()}`;
}

function present(t: any) {
  return {
    id: t.id,
    shortId: shortId(t.id),
    subject: t.subject,
    message: t.message,
    status: t.status,
    replyMessage: t.reply_message || null,
    repliedAt: t.replied_at || null,
    createdAt: t.created_at,
    attachmentUrl: t.attachment_url || null,
    replyAttachmentUrl: t.reply_attachment_url || null,
    suggestedProduct: t.suggested_product || null,
  };
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const rawTicketId = typeof body?.ticketId === 'string' ? body.ticketId.trim() : '';
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';

  try {
    const user = await getCurrentUser();

    if (user) {
      const supabase = await getSupabaseServer();
      const { data: tickets, error } = await supabase
        .from('support_tickets')
        .select('*')
        .or(`user_id.eq.${user.id},customer_email.eq.${user.email}`)
        .order('created_at', { ascending: false })
        .limit(MAX_TICKETS);

      if (error) throw error;

      if (!tickets || tickets.length === 0) {
        return NextResponse.json({ ok: true, loggedIn: true, tickets: [] });
      }

      const cleanedId = rawTicketId.replace(/^#/, '').toUpperCase();
      const filtered = cleanedId
        ? tickets.filter((t: any) => String(t.id).toUpperCase().startsWith(cleanedId))
        : tickets;

      const target = (filtered.length > 0 ? filtered : tickets).slice(0, MAX_TICKETS);
      return NextResponse.json({ ok: true, loggedIn: true, tickets: target.map(present) });
    }

    // Guest path -- needs the email used when the ticket was raised.
    if (!email) {
      return NextResponse.json({
        ok: true,
        loggedIn: false,
        needsDetails: true,
        message: 'Please log in, or share the email you used when raising the ticket so I can look it up.',
      });
    }

    const supabase = getSupabaseAdmin();
    const { data: tickets, error } = await supabase
      .from('support_tickets')
      .select('*')
      .eq('customer_email', email)
      .order('created_at', { ascending: false })
      .limit(30);

    if (error) throw error;

    if (!tickets || tickets.length === 0) {
      return NextResponse.json({
        ok: true,
        loggedIn: false,
        tickets: [],
        message: "I couldn't find any support tickets raised with that email. Double-check it, or continue on WhatsApp with our team.",
      });
    }

    const cleanedId = rawTicketId.replace(/^#/, '').toUpperCase();
    const match = cleanedId ? tickets.find((t: any) => String(t.id).toUpperCase().startsWith(cleanedId)) : null;

    const target = match ? [match] : tickets.slice(0, MAX_TICKETS);
    return NextResponse.json({ ok: true, loggedIn: false, tickets: target.map(present) });
  } catch (err) {
    console.error('[chat/ticket-status] error:', err);
    return NextResponse.json(
      { ok: false, error: 'Could not fetch your ticket status right now. Please try again shortly.' },
      { status: 200 }
    );
  }
}
