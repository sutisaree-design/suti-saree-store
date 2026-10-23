import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

// 1x1 transparent GIF, served no matter what (even if the DB update fails)
// so the recipient's mail client never sees a broken image / error.
const PIXEL = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBTAA7',
  'base64'
);

function pixelResponse() {
  return new NextResponse(PIXEL, {
    status: 200,
    headers: {
      'Content-Type': 'image/gif',
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      Pragma: 'no-cache',
    },
  });
}

// GET /api/track/order-payment/open/<order_payment_request_events row id>
// — embedded as an invisible <img> in the "Request Online Payment" email
// (see lib/email-templates.ts -> codToPrepaidRequestEmail). No auth (mail
// clients can't send cookies/headers) -- the unguessable per-send uuid is
// the only thing that gates this, same model as the existing campaign
// pixel at /api/track/open/[trackingId].
export async function GET(_req: NextRequest, { params }: { params: { eventId: string } }) {
  const eventId = params.eventId;

  if (!/^[0-9a-f-]{36}$/i.test(eventId)) {
    return pixelResponse();
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data: existing } = await supabase
      .from('order_payment_request_events')
      .select('opened_at, open_count')
      .eq('id', eventId)
      .eq('event_type', 'email_sent')
      .maybeSingle();

    if (existing) {
      await supabase
        .from('order_payment_request_events')
        .update({
          // Keep the *first* open time, just bump the counter on repeats
          // (image proxies/link scanners can trigger more than one hit).
          opened_at: existing.opened_at ?? new Date().toISOString(),
          open_count: (existing.open_count ?? 0) + 1,
        })
        .eq('id', eventId);
    }
  } catch (err) {
    console.error('[track/order-payment/open] failed to record open:', err);
  }

  return pixelResponse();
}
