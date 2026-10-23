/**
 * lib/cloudflare-image-loader.js
 *
 * Custom Next.js image loader that serves responsive sizes — GATED by
 * the "Responsive Images" admin toggle (Admin > Settings). This file
 * runs both on the server and in the browser bundle, so it can only
 * read a plain sync value, never call the database directly.
 *
 * OFF (default / fail-safe): returns the src UNCHANGED — i.e. exactly
 *   the same behaviour as `unoptimized: true`. This is what happens
 *   whenever the flag hasn't loaded yet, failed to load, or was
 *   deliberately switched off from Admin > Settings.
 *
 * ON: for our own /media/ URLs, picks a -sm (480px) / -md (900px) /
 *   original (1600px) variant based on the requested width:
 *     width <= 600  → -sm
 *     width <= 1000 → -md
 *     width > 1000  → original (no suffix)
 *
 *   Even when ON, this is safe for images that don't have a variant
 *   yet (backfill not run / not reached them): the -sm/-md URL is
 *   still requested, but the /media/ proxy (app/media/[...path]/
 *   route.ts) transparently falls back to serving the original file
 *   whenever the exact variant path doesn't exist. No broken images,
 *   backfilled or not.
 */

function isResponsiveImagesEnabled() {
  try {
    if (typeof window !== 'undefined') {
      // Set by an inline script in app/layout.tsx <head>, from the
      // server-rendered value of the same DB setting.
      return window.__RESPONSIVE_IMAGES_ENABLED__ === true;
    }
    if (typeof globalThis !== 'undefined') {
      // Set once per request by app/layout.tsx (server), before any
      // <Image> in the tree renders. See lib/responsive-images-flag.ts.
      return globalThis.__RESPONSIVE_IMAGES_ENABLED__ === true;
    }
  } catch {
    // Fall through to the safe default below.
  }
  return false; // fail-safe default: OFF = original URL, unchanged
}

export default function responsiveImageLoader({ src, width }) {
  // Pass-through: data URIs (blur placeholders)
  if (src.startsWith('data:')) return src;

  // Pass-through: external images (pexels, unsplash, placeholders, etc.)
  if (src.includes('placehold.co') || src.includes('placeholder')) return src;
  if (src.includes('pexels.com') || src.includes('unsplash.com')) return src;

  // Feature flag OFF → behave exactly like unoptimized: true.
  if (!isResponsiveImagesEnabled()) return src;

  // Only apply responsive sizing to our own /media/ URLs
  if (!src.includes('/media/')) return src;

  // Determine which size suffix to use
  let suffix = '';
  if (width <= 600) suffix = '-sm';
  else if (width <= 1000) suffix = '-md';
  // width > 1000 → original, no suffix

  if (!suffix) return src; // original — return as-is

  // Insert suffix before the file extension
  // e.g. /media/product-images/products/abc.webp
  //   → /media/product-images/products/abc-sm.webp
  const dotIndex = src.lastIndexOf('.');
  if (dotIndex === -1) return src; // no extension — return as-is

  const withSuffix = `${src.slice(0, dotIndex)}${suffix}${src.slice(dotIndex)}`;
  return withSuffix;
}
