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

// GET /api/track/open/<campaign_send id> — embedded as an invisible <img>
// in campaign emails. No auth (mail clients can't send cookies/headers),
// so this only ever touches the single row matching the unguessable uuid.
export async function GET(_req: NextRequest, { params }: { params: { trackingId: string } }) {
  const trackingId = params.trackingId;

  // Basic uuid shape check so we don't run a query for obviously bad ids.
  if (!/^[0-9a-f-]{36}$/i.test(trackingId)) {
    return pixelResponse();
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data: existing } = await supabase
      .from('woocommerce_campaign_sends')
      .select('open_count, opened_at')
      .eq('id', trackingId)
      .maybeSingle();

    if (existing) {
      await supabase
        .from('woocommerce_campaign_sends')
        .update({
          // Keep the *first* open time, just bump the counter on repeats
          // (image proxies/link scanners can trigger more than one hit).
          opened_at: existing.opened_at ?? new Date().toISOString(),
          open_count: (existing.open_count ?? 0) + 1,
        })
        .eq('id', trackingId);
    }
  } catch (err) {
    console.error('[track/open] failed to record open:', err);
  }

  return pixelResponse();
}
