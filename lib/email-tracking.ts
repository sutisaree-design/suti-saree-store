// ---------------------------------------------------------------------
// Open + click tracking for the cart-recovery email sequence.
//
// One row is written to `abandoned_cart_emails` per send (see migration
// 20260928010000_cart_recovery_sequence.sql). Its `tracking_token` is
// embedded in:
//   - a 1x1 pixel   -> GET /api/track/cart-open/[token]  (marks opened_at)
//   - every outbound -> GET /api/track/cart-click/[token]?u=<encoded target>
//     link in the      (marks clicked_at, then 302s to the real link)
//     email body
//
// (Named cart-open/cart-click, not just open/click, because this app
// already has unrelated /api/track/open/[trackingId] and
// /api/track/click/[sendId] routes for WooCommerce campaign emails --
// Next.js requires siblings under the same folder to share one dynamic
// segment name, so this sequence gets its own subpath rather than
// trying to reuse that route/table shape.)
//
// Both routes are public/unauthenticated by nature (an email client
// fetching a pixel has no session), so click redirects are restricted
// to the store's own origin -- see isAllowedRedirectTarget() -- to
// avoid this becoming an open redirect.
// ---------------------------------------------------------------------

import { getSupabaseAdmin } from './supabase-admin';

export async function createEmailTrackingRecord(args: {
  cartId: string;
  sequenceNumber: number;
  subject: string;
  couponCode?: string | null;
}): Promise<string> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('abandoned_cart_emails')
    .insert({
      cart_id: args.cartId,
      sequence_number: args.sequenceNumber,
      subject: args.subject,
      coupon_code: args.couponCode || null,
    })
    .select('tracking_token')
    .single();
  if (error) throw error;
  return data.tracking_token as string;
}

function getSiteOrigin(): string {
  try {
    return new URL(process.env.NEXT_PUBLIC_SITE_URL || '').origin;
  } catch {
    return '';
  }
}

// Only ever redirect back into our own site -- never wherever the
// (in this case admin-controlled, but defense in depth costs nothing)
// email content happened to link to.
export function isAllowedRedirectTarget(url: string): boolean {
  const origin = getSiteOrigin();
  if (!origin) return url.startsWith('/');
  if (url.startsWith('/')) return true;
  try {
    return new URL(url).origin === origin;
  } catch {
    return false;
  }
}

// Rewrites every href="http(s)://..." / href="/..." link in the HTML to
// go through the click-tracking redirect, and appends an invisible open
// pixel just before </body>. mailto:/tel: links are left untouched.
export function instrumentEmailHtml(html: string, token: string): string {
  const trackBase = `${process.env.NEXT_PUBLIC_SITE_URL || ''}/api/track/cart-click/${token}`;

  const withTrackedLinks = html.replace(/href="([^"]+)"/g, (match, href: string) => {
    if (!href || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('#')) {
      return match;
    }
    if (!isAllowedRedirectTarget(href)) return match;
    const trackedUrl = `${trackBase}?u=${encodeURIComponent(href)}`;
    return `href="${trackedUrl}"`;
  });

  const pixel = `<img src="${process.env.NEXT_PUBLIC_SITE_URL || ''}/api/track/cart-open/${token}" width="1" height="1" alt="" style="display:block;border:0;" />`;

  if (withTrackedLinks.includes('</body>')) {
    return withTrackedLinks.replace('</body>', `${pixel}</body>`);
  }
  return `${withTrackedLinks}${pixel}`;
}
