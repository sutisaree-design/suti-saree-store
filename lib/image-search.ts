'use client';

/**
 * Lightweight "search by image" for the catalog.
 *
 * There's no ML backend for this app, so instead of a real vision model we
 * boil every photo down to a coarse 8x8 grid of average RGB values (192
 * numbers total). That's enough to capture dominant colour + rough layout,
 * which works surprisingly well for a saree/lehenga/kurti catalog where
 * shoppers are usually hunting for "something that looks like this" rather
 * than an exact pixel match.
 */

const GRID = 8;

// Product photos (Supabase Storage etc.) don't always send CORS headers,
// which taints the canvas and makes getImageData() throw for every single
// product — the whole reason "search by photo" was silently returning
// "couldn't match anything". Routing through our own /api/image-proxy
// makes every image same-origin from the browser's point of view, so the
// canvas read always works regardless of the upstream host's CORS config.
// Data URLs (the shopper's own uploaded photo) are already same-origin/
// inline, so those go straight through untouched.
function toSameOriginSrc(src: string): string {
  if (src.startsWith('data:')) return src;
  return `/api/image-proxy?url=${encodeURIComponent(src)}`;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // Kept as a defensive fallback — with the proxy in place this is no
    // longer load-bearing, but it's harmless to leave on.
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    img.src = toSameOriginSrc(src);
  });
}

/**
 * Shrinks the shopper's uploaded photo down to a small JPEG data URL, purely
 * so we have something cheap to stash in sessionStorage and show back to
 * them (in the search bar and the "showing pieces similar to..." banner) as
 * confirmation of what they searched with. The original photo can be
 * several MB as a base64 data URL — way too big to comfortably round-trip
 * through sessionStorage alongside the ranked ids — so this is capped to a
 * small square thumbnail instead.
 */
export function createSearchThumbnail(src: string, maxDim = 96): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(null);
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.72));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** Returns a 192-number colour/layout fingerprint, or null if it couldn't be read. */
export async function getImageSignature(src: string): Promise<number[] | null> {
  if (!src) return null;
  try {
    const img = await loadImage(src);
    const canvas = document.createElement('canvas');
    canvas.width = GRID;
    canvas.height = GRID;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, GRID, GRID);
    const { data } = ctx.getImageData(0, 0, GRID, GRID);
    const sig: number[] = [];
    for (let i = 0; i < data.length; i += 4) {
      sig.push(data[i] / 255, data[i + 1] / 255, data[i + 2] / 255);
    }
    return sig;
  } catch {
    return null;
  }
}

/** Lower = more visually similar. */
export function signatureDistance(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum);
}

/**
 * Ranks products by visual similarity to an uploaded query image (most
 * similar first). Products whose photo can't be fingerprinted — missing
 * image, CORS-blocked host, decode failure — are silently skipped instead
 * of breaking the whole search for everyone else.
 */
export interface ImageSearchResult {
  ids: string[];
  /**
   * Per-product id, the single photo (base product photo OR a colour
   * variant's photo — see the `work` array below) that was closest to the
   * shopper's uploaded photo. Lets the caller show that exact matched photo
   * (e.g. the "blue" variant shot) instead of always falling back to the
   * product's default/first image, which may be a totally different
   * colour/angle than what the shopper searched with.
   */
  bestImageByProductId: Record<string, string>;
  /**
   * True when we couldn't fingerprint ANY product photo at all (e.g. the
   * proxy/network is down), as opposed to fingerprinting them fine and
   * simply finding nothing visually close. The caller should show a very
   * different message for these two cases — "couldn't match your photo"
   * is misleading when the real problem is that no product photo could be
   * read at all.
   */
  systemicFailure: boolean;
}

export async function rankProductIdsByImage<
  T extends { id: string; images: string[] | null | undefined; all_images?: string[] | null }
>(products: T[], queryImageSrc: string): Promise<ImageSearchResult> {
  const querySigResult = await getImageSignature(queryImageSrc);
  if (!querySigResult) return { ids: [], bestImageByProductId: {}, systemicFailure: true };
  // Re-bind to a variable whose type TS keeps narrowed to `number[]` inside
  // the nested async worker below (closures over a reassignable outer
  // binding don't retain the null-check narrowing across function bounds).
  const querySig: number[] = querySigResult;

  // Flatten to (productId, imageUrl) pairs across ALL of a product's photos
  // -- base product photos AND every colour variant's photos (all_images,
  // see lib/products-api.ts) -- instead of just each product's first photo.
  // That way a shopper's photo of, say, the "blue" variant of a saree still
  // matches the product even if its base/default photo is a different
  // colour entirely.
  const work: { id: string; src: string }[] = [];
  const productIds = new Set<string>();
  for (const p of products) {
    const candidates = p.all_images && p.all_images.length > 0 ? p.all_images : p.images;
    if (!candidates || candidates.length === 0) continue;
    productIds.add(p.id);
    // De-dupe per-product in case all_images ever contains repeats.
    const seen = new Set<string>();
    for (const src of candidates) {
      if (!src || seen.has(src)) continue;
      seen.add(src);
      work.push({ id: p.id, src });
    }
  }

  const bestDist = new Map<string, number>();
  const bestImage = new Map<string, string>();
  const fingerprintedProductIds = new Set<string>();
  const CONCURRENCY = 6;
  let cursor = 0;

  async function worker() {
    while (cursor < work.length) {
      const item = work[cursor++];
      const sig = await getImageSignature(item.src);
      if (!sig) continue;
      fingerprintedProductIds.add(item.id);
      const dist = signatureDistance(querySig, sig);
      const prev = bestDist.get(item.id);
      // Whichever single photo (default OR any colour variant's) comes out
      // closest for this product is the one we'll want to show back to the
      // shopper — so bestImage is updated in lockstep with bestDist.
      if (prev === undefined || dist < prev) {
        bestDist.set(item.id, dist);
        bestImage.set(item.id, item.src);
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const scored = Array.from(bestDist.entries()).map(([id, dist]) => ({ id, dist }));
  scored.sort((a, b) => a.dist - b.dist);

  // If there were photos to check but literally none of them could be
  // read, that's a proxy/network problem, not "no similar products" —
  // e.g. every product photo host is unreachable or being blocked.
  const withPhoto = productIds.size;
  const fingerprinted = fingerprintedProductIds.size;
  const systemicFailure = withPhoto > 0 && fingerprinted === 0;
  if (systemicFailure) {
    console.error(
      `[image-search] fingerprinted 0/${withPhoto} products' photos — likely /api/image-proxy or network issue, not a genuine "no match".`
    );
  }

  return {
    ids: scored.map((s) => s.id),
    bestImageByProductId: Object.fromEntries(bestImage),
    systemicFailure,
  };
}
