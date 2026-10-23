import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

// GET /api/track/click/<campaign_send id>?u=<encoded target url>
//
// Every real link inside a sent campaign email is rewritten (see
// lib/campaign-templates.ts -> wrapCampaignLinksForClickTracking) to point
// here first. No auth -- mail clients / browsers can't send our cookies --
// so this only ever touches the single row matching the unguessable uuid,
// same trust model as /api/track/open/<id>.
//
// What it does:
//   1. Stamps clicked_at (first click only) + bumps click_count on
//      woocommerce_campaign_sends -- this is what promotes a recipient
//      from "cold" to "warm" in the admin's audience segmentation.
//   2. Drops a short-lived, non-httpOnly `wc_sid` cookie so the storefront
//      (lib/track-api.ts) can tag this visitor's later page views /
//      purchases with the same send id -- that's how "warm" gets promoted
//      further to "hot" (2+ pages visited, or an eventual purchase).
//   3. Redirects to the real destination.
//
// The target url is restricted to this site's own origin so the endpoint
// can never be abused as an open redirector.
export async function GET(req: NextRequest, { params }: { params: { sendId: string } }) {
  const sendId = params.sendId;
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/$/, '');
  const fallback = siteUrl || '/';

  const rawTarget = req.nextUrl.searchParams.get('u') || fallback;
  let target = fallback;
  try {
    const parsed = new URL(rawTarget, siteUrl || req.nextUrl.origin);
    const allowedOrigin = siteUrl ? new URL(siteUrl).origin : req.nextUrl.origin;
    target = parsed.origin === allowedOrigin ? parsed.toString() : fallback;
  } catch {
    target = fallback;
  }

  // Basic uuid shape check so we don't run a query for obviously bad ids,
  // and so we never set a bogus wc_sid cookie for a garbage id.
  const validId = /^[0-9a-f-]{36}$/i.test(sendId);

  if (validId) {
    try {
      const supabase = getSupabaseAdmin();
      const { data: existing } = await supabase
        .from('woocommerce_campaign_sends')
        .select('clicked_at, click_count')
        .eq('id', sendId)
        .maybeSingle();

      if (existing) {
        await supabase
          .from('woocommerce_campaign_sends')
          .update({
            clicked_at: existing.clicked_at ?? new Date().toISOString(),
            click_count: (existing.click_count ?? 0) + 1,
          })
          .eq('id', sendId);
      }
    } catch (err) {
      console.error('[track/click] failed to record click:', err);
    }
  }

  const res = NextResponse.redirect(target, { status: 302 });
  if (validId) {
    res.cookies.set('wc_sid', sendId, {
      maxAge: 60 * 60 * 24 * 30, // 30 days -- long enough to attribute a later purchase
      path: '/',
      sameSite: 'lax',
      httpOnly: false, // must be readable by lib/track-api.ts (client-side)
    });
  }
  return res;
}
