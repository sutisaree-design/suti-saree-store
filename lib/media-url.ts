// Rewrites storage URLs into our own domain via the /media proxy
// (see app/media/[...path]/route.ts), so every place a media URL gets
// published externally — sitemap, Merchant Center/Pinterest feed,
// JSON-LD video/image schema — shows aruhihandlooms.com instead of any
// storage provider's host.
//
// DUAL-WRITE UPDATE (feature/media-dual-write-toggle)
// New uploads return canonical aruhihandlooms.com/media/... URLs directly
// from uploadToStorage() — they pass through this function unchanged.
// This function still handles two legacy URL shapes that may appear in
// the ~500 existing DB rows:
//   1. Raw Supabase URLs (https://<project>.supabase.co/storage/v1/object/public/...)
//   2. Raw R2/CDN URLs  (https://cdn.aruhihandlooms.com/...) — the bug
//      confirmed in MIGRATION_AUDIT_V2.md where STORAGE_PROVIDER=r2
//      stored the cdn.* URL directly. These are rewritten to /media/ here
//      so existing rows keep resolving correctly.
// No existing DB row is modified — rewriting happens only at read time.

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.aruhihandlooms.com').replace(/\/$/, '');
const SUPABASE_PUBLIC_MARKER = '/storage/v1/object/public/';

// The R2 CDN domain used while STORAGE_PROVIDER=r2 was active (the bug).
// Any URL matching this is rewritten to /media/ so it resolves through
// the proxy with automatic Supabase fallback.
const R2_CDN_BASE = (process.env.R2_PUBLIC_URL || 'https://cdn.aruhihandlooms.com').replace(/\/$/, '');

/**
 * Converts any storage URL (Supabase raw, R2 CDN raw, or already-canonical
 * /media/ URL) into our own-domain proxy URL. Non-storage URLs (e.g.
 * Pexels/Unsplash placeholders) are returned unchanged.
 */
export function toPublicMediaUrl(url: string | null | undefined): string | null {
  if (!url) return null;

  // Already canonical — pass through unchanged
  if (url.startsWith(SITE_URL) || url.startsWith('/media/')) return url;

  // Legacy Supabase raw URL (the pre-existing ~500 rows)
  const supabaseIdx = url.indexOf(SUPABASE_PUBLIC_MARKER);
  if (supabaseIdx !== -1) {
    const path = url.slice(supabaseIdx + SUPABASE_PUBLIC_MARKER.length);
    return `${SITE_URL}/media/${path}`;
  }

  // Legacy R2 CDN URL (the confirmed bug from MIGRATION_AUDIT_V2.md —
  // any row stored as cdn.aruhihandlooms.com/... while STORAGE_PROVIDER=r2
  // was active). Rewrite to /media/ so the proxy handles it with fallback.
  if (R2_CDN_BASE && url.startsWith(R2_CDN_BASE + '/')) {
    const path = url.slice(R2_CDN_BASE.length + 1); // strip "https://cdn.../"
    return `${SITE_URL}/media/${path}`;
  }

  // Anything else (placeholder images, external URLs) — return as-is
  return url;
}

/** Same as toPublicMediaUrl, but for an array, dropping any null/empty entries. */
export function toPublicMediaUrls(urls: (string | null | undefined)[] | null | undefined): string[] {
  if (!urls) return [];
  return urls
    .map((u) => toPublicMediaUrl(u))
    .filter((u): u is string => !!u);
}
