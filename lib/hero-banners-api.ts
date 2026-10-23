import { supabase } from '@/lib/supabase';

export type HeroBannerMediaType = 'image' | 'video';

export interface HeroBanner {
  id: string;
  position: number;
  image_url: string;
  link_url: string | null;
  is_active: boolean;
  media_type: HeroBannerMediaType;
  poster_url: string | null;
  // Optional mobile-specific override. When null, the storefront falls
  // back to the desktop fields above for phone-sized screens too — so
  // adding mobile media is always optional, never required.
  mobile_image_url: string | null;
  mobile_media_type: HeroBannerMediaType | null;
  mobile_poster_url: string | null;
  created_at?: string;
}

export interface HeroBannerInput {
  image_url: string;
  link_url: string | null;
  is_active: boolean;
  media_type: HeroBannerMediaType;
  poster_url: string | null;
  mobile_image_url: string | null;
  mobile_media_type: HeroBannerMediaType | null;
  mobile_poster_url: string | null;
}

// ---------------------------------------------------------------------
// Admin management (Admin > Hero Banners tab)
// ---------------------------------------------------------------------

export async function fetchHeroBannersAdmin(): Promise<HeroBanner[]> {
  const res = await fetch('/api/admin/hero-banners');
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'Failed to load hero banners');
  return (body.banners ?? []) as HeroBanner[];
}

async function adminHeroBannerRequest(url: string, options: RequestInit) {
  const res = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'Request failed');
  return body;
}

export async function createHeroBanner(input: HeroBannerInput) {
  await adminHeroBannerRequest('/api/admin/hero-banners', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function updateHeroBanner(id: string, input: Partial<HeroBannerInput>) {
  await adminHeroBannerRequest(`/api/admin/hero-banners/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export async function deleteHeroBanner(id: string) {
  await adminHeroBannerRequest(`/api/admin/hero-banners/${id}`, { method: 'DELETE' });
}

export async function setHeroBannerActive(id: string, is_active: boolean) {
  await adminHeroBannerRequest(`/api/admin/hero-banners/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ is_active }),
  });
}

// Persists a new order for all (or a subset of) banners in one batch
// call — used by the up/down reorder buttons in the admin panel, same
// pattern as reorderHomepageTiles in lib/homepage-tiles-api.ts.
export async function reorderHeroBanners(orderedIds: string[]) {
  await adminHeroBannerRequest('/api/admin/hero-banners/reorder', {
    method: 'PATCH',
    body: JSON.stringify({ orderedIds }),
  });
}

// Converts any uploaded image (jpg/png/heic-from-browser/etc.) to WebP
// in the browser before it ever leaves the device — smaller files,
// faster homepage loads, no manual "save as webp" step for whoever is
// uploading. Skipped for formats where re-encoding would lose something
// a banner needs: GIF (would flatten an animation to one frame) and
// files already WebP (nothing to do).
export async function convertImageToWebp(file: File, quality = 0.85): Promise<File> {
  if (file.type === 'image/webp' || file.type === 'image/gif') return file;
  if (typeof document === 'undefined') return file; // SSR guard, never hit in practice (upload is browser-only)

  try {
    const dims = await readImageDimensions(file);
    const canvas = document.createElement('canvas');
    canvas.width = dims.width;
    canvas.height = dims.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;

    const objectUrl = URL.createObjectURL(file);
    const img = new window.Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Could not decode image'));
      img.src = objectUrl;
    });
    ctx.drawImage(img, 0, 0);
    URL.revokeObjectURL(objectUrl);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', quality));
    if (!blob) return file; // browser couldn't encode webp — fall back to the original file untouched

    const newName = file.name.replace(/\.[^./]+$/, '') + '.webp';
    return new File([blob], newName, { type: 'image/webp' });
  } catch {
    return file; // any decode/canvas failure -> upload the original rather than blocking the admin
  }
}

/**
 * Uploads a hero banner image via the server-side dual-write route
 * (/api/upload-image), which writes to BOTH Supabase and R2 and returns
 * a canonical aruhihandlooms.com/media/... URL.
 * Previously uploaded directly to Supabase from the browser — the server
 * route handles WebP conversion too (via sharp), so convertImageToWebp()
 * is no longer needed for this path (kept above for any other callers).
 */
export async function uploadHeroBannerImage(file: File): Promise<string> {
  const form = new FormData();
  form.append('file', file);
  form.append('folder', 'hero-banners');
  const res = await fetch('/api/upload-image', { method: 'POST', body: form });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.error || 'Could not upload banner image.');
  if (!json?.url) throw new Error('Upload succeeded but no URL returned.');
  return json.url as string;
}

// Uploads a hero banner VIDEO. Reuses the same signed-upload-URL flow as
// product videos (app/api/upload-video + the `product-videos` bucket) —
// the video bytes go straight from the browser to Supabase Storage, never
// through the Vercel function, since Vercel caps request bodies at
// ~4.5MB and a banner video easily exceeds that. See
// uploadProductVideo() in lib/products-api.ts for the original pattern
// and the reasoning behind it.
export async function uploadHeroBannerVideo(file: File): Promise<string> {
  const ALLOWED_TYPES = new Set(['video/mp4', 'video/webm']);
  const contentType = file.type || 'video/mp4';
  if (!ALLOWED_TYPES.has(contentType)) {
    throw new Error('Only .mp4 or .webm videos are supported.');
  }
  const MAX_BYTES = 45 * 1024 * 1024; // keep in sync with the product-videos bucket's 50MB cap
  if (file.size > MAX_BYTES) {
    throw new Error('Video is too large (max 45MB) — trim it or compress before uploading.');
  }

  const res = await fetch('/api/upload-video', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ seoName: 'hero-banner', contentType }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Video upload failed');

  const { path, token, url } = json as { path: string; token: string; url: string };
  const { error: uploadError } = await supabase.storage
    .from('product-videos')
    .uploadToSignedUrl(path, token, file);
  if (uploadError) throw new Error(uploadError.message || 'Video upload failed');

  return url;
}

// Reads an image file's natural pixel dimensions in the browser, used by
// the admin panel to warn when a newly-uploaded banner doesn't match the
// size of the banners already in the list — every slide should be the
// same size so the carousel doesn't jump/resize between slides.
export function readImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new window.Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read image dimensions'));
    };
    img.src = url;
  });
}

// Same helper as above, but for an already-uploaded banner's remote URL
// (used to get the "reference" size from the first existing banner in
// the list, so we don't have to re-fetch it on every subsequent upload).
export function readRemoteImageDimensions(
  imageUrl: string
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error('Could not read image dimensions'));
    img.src = imageUrl;
  });
}

// ---------------------------------------------------------------------
// Storefront (public) — used by the homepage hero carousel.
// ---------------------------------------------------------------------

export async function fetchActiveHeroBanners(): Promise<HeroBanner[]> {
  try {
    const { data, error } = await supabase
      .from('hero_banners')
      .select('*')
      .eq('is_active', true)
      .order('position', { ascending: true });
    if (error) throw error;
    return (data ?? []) as HeroBanner[];
  } catch {
    // A homepage render should never break because banners failed to
    // load — same "fail quiet" approach as fetchHomeBanner in
    // lib/home-data-server.ts.
    return [];
  }
}
