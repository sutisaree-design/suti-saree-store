import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAdminToken, ADMIN_SESSION_COOKIE } from '@/lib/admin-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { publishVideoToSocial, type SocialPlatform } from '@/lib/social-publish-api';

const VALID_PLATFORMS: SocialPlatform[] = ['facebook', 'instagram', 'threads'];

/**
 * POST /api/social/publish-video  { productId: string, platform: 'facebook' | 'instagram' | 'threads' }
 *
 * Posts the product's already-generated slideshow video (products.video_url)
 * to one platform. Called by the per-platform "Post Video" buttons shown
 * in Admin > Products once a video has been generated (see
 * lib/slideshow-video-generator.ts + /api/admin/product-video/upload).
 */
export async function POST(req: Request) {
  const cookie = cookies().get(ADMIN_SESSION_COOKIE)?.value ?? null;
  const verified = await verifyAdminToken(cookie);
  if (!verified.valid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { productId, platform } = await req.json().catch(() => ({ productId: null, platform: null }));
  if (!productId) {
    return NextResponse.json({ error: 'productId required' }, { status: 400 });
  }
  if (!VALID_PLATFORMS.includes(platform)) {
    return NextResponse.json({ error: 'platform must be facebook, instagram, or threads' }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  const { data: product, error } = await admin
    .from('products')
    .select('id, name, slug, description, price, video_url, social_post_ids')
    .eq('id', productId)
    .maybeSingle();

  if (error || !product) {
    return NextResponse.json({ error: 'Product not found' }, { status: 404 });
  }

  try {
    const result = await publishVideoToSocial(admin, product, platform as SocialPlatform);
    if (!result.posted) {
      return NextResponse.json(
        { ok: false, error: result.reason ?? 'Video post failed — check Marketing > Social Auto-Post settings.' },
        { status: 200 }
      );
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[api/social/publish-video] failed for', productId, err);
    return NextResponse.json({ ok: false, error: 'Video post failed, see server logs' }, { status: 200 });
  }
}
