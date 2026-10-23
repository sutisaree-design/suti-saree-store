import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

// 1x1 transparent GIF, served regardless of whether the token matches --
// an email client must never see anything but a normal image response,
// or some clients will show a broken-image icon.
const PIXEL = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBTAA7', 'base64');

// NOTE: lives under /api/track/cart-open (not /api/track/open) because
// this app already has an unrelated /api/track/open/[trackingId] route
// (WooCommerce campaign emails) -- Next.js doesn't allow two different
// dynamic-segment names ([token] vs [trackingId]) as siblings in the
// same folder, so the cart-recovery sequence gets its own subpath
// instead of trying to share that one's table/shape.
export async function GET(_req: Request, { params }: { params: { token: string } }) {
  try {
    const supabase = getSupabaseAdmin();
    const { data: row } = await supabase
      .from('abandoned_cart_emails')
      .select('id, opened_at, open_count')
      .eq('tracking_token', params.token)
      .maybeSingle();

    if (row) {
      await supabase
        .from('abandoned_cart_emails')
        .update({
          opened_at: row.opened_at || new Date().toISOString(),
          open_count: (row.open_count || 0) + 1,
        })
        .eq('id', row.id);
    }
  } catch {
    // Never let a tracking failure surface to the email client.
  }

  return new NextResponse(PIXEL, {
    status: 200,
    headers: {
      'Content-Type': 'image/gif',
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
    },
  });
}
