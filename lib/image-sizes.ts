/**
 * lib/image-sizes.ts
 * 
 * Shared utility: generate 3 responsive sizes from a sharp buffer.
 * Used by upload-image and import-image routes.
 * 
 * Sizes:
 *   -sm  → 480px  (mobile product cards, thumbnails)
 *   -md  → 900px  (desktop product cards, category pages)
 *   original → 1600px (full product page zoom)
 * 
 * Existing images (no -sm/-md suffix) are untouched — loader falls back
 * to original URL for them.
 */

import sharp, { type Sharp } from 'sharp';

const WEBP_QUALITY = 82;
// AVIF's quality scale runs lower than WebP's for an equivalent visual
// result. 45-55 is a reasonable starting point — visually equivalent to
// the WebP output above, meaningfully smaller in bytes (typically 20-30%
// smaller than the WebP sibling at the same pixel size).
const AVIF_QUALITY = 50;

export const RESPONSIVE_SIZES = [
  { suffix: '-sm', width: 480 },
  { suffix: '-md', width: 900 },
  { suffix: '',    width: 1600 }, // original / full size
] as const;

/**
 * Generate WebP + AVIF buffers at 3 different sizes from a source buffer.
 * Returns array of { suffix, buffer, contentType, ext } — 2 entries per
 * size (one WebP, one AVIF), so 6 entries total when nothing fails.
 *
 * The resize step is only ever done ONCE per size — the resized pipeline
 * is branched into .webp({...}) and .avif({...}) so we don't pay for two
 * separate resizes of the same source.
 *
 * AVIF generation is wrapped in its own try/catch per entry: if AVIF
 * encoding fails for a given size, only that AVIF entry is skipped (and
 * logged) — the matching WebP entry for that size is completely
 * unaffected, so WebP output/upload always keeps working even if AVIF
 * has a problem for some source image.
 */
export async function generateResponsiveSizes(sourceBuffer: Buffer): Promise<
  Array<{ suffix: string; buffer: Buffer; contentType: string; ext: string }>
> {
  const results: Array<{ suffix: string; buffer: Buffer; contentType: string; ext: string }> = [];

  for (const { suffix, width } of RESPONSIVE_SIZES) {
    let resized: Sharp;
    try {
      resized = sharp(sourceBuffer, { failOn: 'none' })
        .rotate()
        .resize({ width, height: width, fit: 'inside', withoutEnlargement: true });
    } catch (err) {
      console.error(`[image-sizes] failed to set up resize for ${suffix || 'original'} size:`, err);
      continue; // can't do WebP or AVIF for this size — skip both
    }

    try {
      const buffer = await resized.clone().webp({ quality: WEBP_QUALITY }).toBuffer();
      results.push({ suffix, buffer, contentType: 'image/webp', ext: 'webp' });
    } catch (err) {
      console.error(`[image-sizes] failed to generate ${suffix || 'original'} WebP size:`, err);
      // Skip this size on error — caller handles missing sizes gracefully
    }

    try {
      const buffer = await resized.clone().avif({ quality: AVIF_QUALITY }).toBuffer();
      results.push({ suffix, buffer, contentType: 'image/avif', ext: 'avif' });
    } catch (err) {
      console.error(`[image-sizes] failed to generate ${suffix || 'original'} AVIF size:`, err);
      // AVIF is a bonus optimization, never a requirement — WebP above
      // already succeeded (or failed) independently of this.
    }
  }

  return results;
}
