// Shimmer blur placeholder for <Image placeholder="blur" blurDataURL={...}>.
//
// WHY THIS INSTEAD OF A "REAL" BLUR-UP:
// A true per-image blur-up (à la Next.js/Gatsby "LQIP") needs a tiny
// pre-computed thumbnail of THAT EXACT photo, generated at upload time and
// stored in the DB. This product catalog has ~500+ existing images with no
// such column, so doing that properly means: a DB migration, backfilling
// every existing row, AND updating every upload path (product uploads,
// vendor uploads, WooCommerce import, AI listing tool, etc.) to generate
// one going forward — a much bigger, riskier change than the loading
// experience itself calls for.
//
// This generic shimmer instead gives every gallery image a soft,
// animated placeholder the INSTANT the component mounts (it's a tiny
// inline SVG, no network request at all) so shoppers see a polished
// "loading" state instead of a flash of blank/white space or a plain grey
// box — the same technique used in Next.js's own shimmer example. It's
// not a preview of the actual photo, just a tasteful stand-in while the
// real bytes are in flight. If per-image LQIP is ever wanted later, only
// the `blurDataURL` passed to each <Image> needs to change — every call
// site already wired up to accept one.
export function shimmer(w: number, h: number): string {
  return `
<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g">
      <stop stop-color="#f0ede8" offset="20%" />
      <stop stop-color="#e4dfd6" offset="50%" />
      <stop stop-color="#f0ede8" offset="70%" />
    </linearGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="#f0ede8" />
  <rect id="r" width="${w}" height="${h}" fill="url(#g)" />
  <animate xlink:href="#r" attributeName="x" from="-${w}" to="${w}" dur="1.2s" repeatCount="indefinite" />
</svg>`;
}

function toBase64(str: string): string {
  if (typeof window === 'undefined') return Buffer.from(str).toString('base64');
  return window.btoa(str);
}

/** Ready-to-use `blurDataURL` for the main gallery stage (portrait product photo). */
export const GALLERY_BLUR_DATA_URL = `data:image/svg+xml;base64,${toBase64(shimmer(700, 800))}`;

/** Ready-to-use `blurDataURL` for small square thumbnails (rail + strip). */
export const THUMB_BLUR_DATA_URL = `data:image/svg+xml;base64,${toBase64(shimmer(96, 96))}`;

/**
 * Reads the Admin > Settings > "Shimmer Placeholder" toggle. Set once per
 * request by app/layout.tsx (server global) or by the inline
 * `beforeInteractive` script in <head> (browser global) — see
 * lib/blur-placeholder-flag.ts. Fails open to `true` (shimmer shown) if
 * the flag hasn't been set yet for any reason, since a shimmer can never
 * break a page the way a bad image URL could.
 *
 * Controls the GENERIC fallback shimmer only. Independent from
 * isRealPreviewEnabled() below — see resolveBlurDataUrl() for how the two
 * combine.
 */
export function isShimmerEnabled(): boolean {
  try {
    if (typeof window !== 'undefined') {
      return (window as unknown as Record<string, unknown>).__BLUR_SHIMMER_ENABLED__ !== false;
    }
    if (typeof globalThis !== 'undefined') {
      return (globalThis as unknown as Record<string, unknown>).__BLUR_SHIMMER_ENABLED__ !== false;
    }
  } catch {
    // Fall through to the safe default below.
  }
  return true;
}

/**
 * Reads the Admin > Settings > "Real Photo Previews" toggle — whether an
 * already-generated real per-image preview (lib/blur-preview.ts) should
 * actually be used at display time. Independent from isShimmerEnabled():
 * turning this off does NOT delete or stop generating real previews (the
 * backfill button still works), it just means the storefront won't show
 * them, falling back to the generic shimmer (if that's on) or nothing.
 * Same fail-open-to-true default and same global-sync pattern as
 * isShimmerEnabled().
 */
export function isRealPreviewEnabled(): boolean {
  try {
    if (typeof window !== 'undefined') {
      return (window as unknown as Record<string, unknown>).__BLUR_REAL_PREVIEW_ENABLED__ !== false;
    }
    if (typeof globalThis !== 'undefined') {
      return (globalThis as unknown as Record<string, unknown>).__BLUR_REAL_PREVIEW_ENABLED__ !== false;
    }
  } catch {
    // Fall through to the safe default below.
  }
  return true;
}

/**
 * Single place every call site uses to pick a `blurDataURL` (or decide to
 * skip the placeholder altogether). Combines both independent toggles:
 *   - real preview available AND isRealPreviewEnabled() -> use it
 *   - otherwise, isShimmerEnabled() -> use the generic shimmer fallback
 *   - otherwise -> undefined (no placeholder — plain background colour
 *     until the photo arrives, same as before this feature existed)
 * Returns undefined rather than a fallback so callers can drive both
 * `blurDataURL` and `placeholder` off one value:
 *   const dataUrl = resolveBlurDataUrl(realPreview, GENERIC_FALLBACK);
 *   <Image placeholder={dataUrl ? 'blur' : undefined} blurDataURL={dataUrl} />
 */
export function resolveBlurDataUrl(
  realPreview: string | undefined,
  genericFallback: string
): string | undefined {
  if (realPreview && isRealPreviewEnabled()) return realPreview;
  return isShimmerEnabled() ? genericFallback : undefined;
}
