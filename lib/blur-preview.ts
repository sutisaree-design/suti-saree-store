// ---------------------------------------------------------------------
// Real per-image LQIP blur previews.
//
// Unlike lib/image-placeholder.ts's generic shimmer (same SVG for every
// photo), this generates and stores an actual tiny blurred version of
// THAT SPECIFIC image — a proper "blur-up" placeholder, base64-encoded
// and small enough to inline directly in HTML with zero extra network
// request.
//
// Storage: the independent `image_blur_previews` table (see
// supabase/migrations/20260930020000_image_blur_previews.sql) — never
// products.images / product_variants.images.
//
// FAIL-SAFE: generation failures never block an upload, and lookup
// failures (Supabase unreachable, etc.) fail open to an empty Map — in
// both cases callers simply fall back to the generic shimmer for the
// affected image(s). See lib/blur-placeholder-flag.ts / Part 2 for how
// the fallback is applied.
// ---------------------------------------------------------------------

import sharp from 'sharp';
import { getServerSupabase } from '@/lib/supabase-server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

/**
 * Generates a tiny (~20px-wide), blurred, base64-encoded JPEG data URL
 * from a source image buffer — a true per-image LQIP placeholder, small
 * enough to inline directly in HTML with zero extra network request.
 * Typically well under ~2KB.
 */
export async function generateBlurDataUrl(sourceBuffer: Buffer): Promise<string> {
  const buffer = await sharp(sourceBuffer, { failOn: 'none' })
    .rotate()
    .resize({ width: 20, height: 20, fit: 'inside', withoutEnlargement: true })
    .blur(2)
    .jpeg({ quality: 40 })
    .toBuffer();
  return `data:image/jpeg;base64,${buffer.toString('base64')}`;
}

/**
 * Generates + stores a real blur preview for one freshly-uploaded image,
 * keyed by its final canonical URL. Used by every upload/import path
 * (see app/api/upload-image, app/api/admin/import-image,
 * app/api/upload-review-photo). Never throws — same "fail safe, never
 * break the upload" philosophy as the rest of the codebase; callers can
 * fire-and-forget this without wrapping it themselves, though they may
 * still choose to await it.
 */
export async function storeBlurPreview(imageUrl: string, sourceBuffer: Buffer): Promise<void> {
  try {
    const blurDataUrl = await generateBlurDataUrl(sourceBuffer);
    const admin = getSupabaseAdmin();
    await admin.from('image_blur_previews').upsert(
      { image_url: imageUrl, blur_data_url: blurDataUrl },
      { onConflict: 'image_url' }
    );
  } catch (err) {
    // Never let a blur-preview failure affect the upload it's attached to.
    console.error('[blur-preview] failed to generate/store preview for', imageUrl, err);
  }
}

/**
 * Batched lookup: given a list of image URLs, returns a Map of only the
 * ones that have a real blur preview stored. Missing entries simply
 * aren't in the returned Map — callers fall back to the generic shimmer
 * for those (not backfilled yet, generation failed, or a brand-new
 * upload still mid-flight).
 */
export async function getBlurPreviews(imageUrls: string[]): Promise<Map<string, string>> {
  if (imageUrls.length === 0) return new Map();
  try {
    const supabase = getServerSupabase();
    const { data } = await supabase
      .from('image_blur_previews')
      .select('image_url, blur_data_url')
      .in('image_url', imageUrls);
    return new Map((data ?? []).map((row) => [row.image_url as string, row.blur_data_url as string]));
  } catch {
    return new Map(); // fail open — callers fall back to generic shimmer
  }
}
