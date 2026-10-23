import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAdminToken, ADMIN_SESSION_COOKIE } from '@/lib/admin-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { publishProductToSocial, type SocialPlatform } from '@/lib/social-publish-api';

const VALID_PLATFORMS: SocialPlatform[] = ['facebook', 'instagram', 'threads'];

/**
 * POST /api/social/publish  { productId: string, force?: boolean, platform?: 'facebook' | 'instagram' | 'threads' }
 *
 * Fire-and-forget endpoint called right after Admin > Products > "Add
 * Product" successfully inserts a new product, and by each of the three
 * separate Facebook / Instagram / Threads Share buttons in the Manage
 * Products catalog (see components/admin/products-panel.tsx). When
 * `platform` is omitted, posts to every platform enabled in Admin >
 * Marketing > Social Auto-Post settings (legacy/auto-post behaviour); when
 * given, only that one platform is attempted/gated.
 *
 * Kept as its own tiny route (rather than folding into the client-side
 * createProduct() insert) because the Meta access token must stay
 * server-only — it's never sent to the browser.
 *
 * The vendor-listing path does NOT use this route; it's handled inline in
 * app/api/vendor/ai-process/[id]/route.ts and lib/cron-jobs.ts, right
 * after AI processing finishes, using the same publishProductToSocial().
 */
export async function POST(req: Request) {
  const cookie = cookies().get(ADMIN_SESSION_COOKIE)?.value ?? null;
  const verified = await verifyAdminToken(cookie);
  if (!verified.valid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { productId, force, platform } = await req
    .json()
    .catch(() => ({ productId: null, force: false, platform: undefined }));
  if (!productId) {
    return NextResponse.json({ error: 'productId required' }, { status: 400 });
  }
  if (platform !== undefined && !VALID_PLATFORMS.includes(platform)) {
    return NextResponse.json({ error: 'platform must be facebook, instagram, or threads' }, { status: 400 });
  }

  const admin = getSupabaseAdmin();

  const { data: product, error } = await admin
    .from('products')
    .select('id, name, slug, description, price, mrp, images, social_posted_at, social_post_ids')
    .eq('id', productId)
    .maybeSingle();

  if (error || !product) {
    return NextResponse.json({ error: 'Product not found' }, { status: 404 });
  }

  try {
    const result = await publishProductToSocial(admin, product, { force: Boolean(force), platform });
    if (!result.posted) {
      // Previously this branch didn't exist — publishProductToSocial()
      // returned void, so any silent skip (auto-post disabled, missing
      // token/Page ID/Instagram Business Account ID, already-posted, or
      // a Graph API error) still came back here as `{ ok: true }`, and
      // the admin Share button showed a false "Shared!" toast even
      // though nothing was actually posted to Facebook/Instagram.
      return NextResponse.json(
        { ok: false, error: result.reason ?? 'Nothing was posted — check Marketing > Social Auto-Post settings.' },
        { status: 200 }
      );
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    // Non-fatal from the caller's point of view — the product is already
    // live either way. Log server-side for debugging.
    console.error('[api/social/publish] failed for', productId, err);
    return NextResponse.json({ ok: false, error: 'Social post failed, see server logs' }, { status: 200 });
  }
}
