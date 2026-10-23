import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { isAllowedRedirectTarget } from '@/lib/email-tracking';

export const dynamic = 'force-dynamic';

const FALLBACK_URL = `${process.env.NEXT_PUBLIC_SITE_URL || ''}/cart`;

// NOTE: lives under /api/track/cart-click (not /api/track/click) because
// this app already has an unrelated /api/track/click/[sendId] route
// (WooCommerce campaign emails, sets a wc_sid attribution cookie) --
// Next.js doesn't allow two different dynamic-segment names ([token] vs
// [sendId]) as siblings in the same folder, so the cart-recovery
// sequence gets its own subpath instead.
export async function GET(req: Request, { params }: { params: { token: string } }) {
  const { searchParams } = new URL(req.url);
  const target = searchParams.get('u') || FALLBACK_URL;
  const destination = isAllowedRedirectTarget(target) ? target : FALLBACK_URL;

  try {
    const supabase = getSupabaseAdmin();
    const { data: row } = await supabase
      .from('abandoned_cart_emails')
      .select('id, clicked_at, click_count')
      .eq('tracking_token', params.token)
      .maybeSingle();

    if (row) {
      await supabase
        .from('abandoned_cart_emails')
        .update({
          clicked_at: row.clicked_at || new Date().toISOString(),
          click_count: (row.click_count || 0) + 1,
        })
        .eq('id', row.id);
    }
  } catch {
    // A tracking failure should never block the customer from reaching
    // the destination link.
  }

  return NextResponse.redirect(destination, { status: 302 });
}
