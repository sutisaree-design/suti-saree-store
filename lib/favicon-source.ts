// Fetches the favicon the admin set in Admin > Media > Brand identity.
//
// WHY THIS EXISTS: the saved favicon URL is a /media/... URL on our own domain
// (https://sutisaree.com/media/product-images/brand/favicon-123.png). The icon
// routes used to fetch that URL over HTTP *from the server to itself*, going
// back out through Cloudflare / the /media proxy. If that self-request fails
// for any reason (bot protection, redirect, timeout) the route silently fell
// back to the generated "A" monogram -- which is exactly the "favicon not
// showing" symptom, even though the favicon was saved correctly.
//
// Fix: fetch the file straight from Supabase public storage (no self-loop, no
// Cloudflare in between) and only use the original URL as a second attempt.
// Pure fetch + string code, so it also works on the edge runtime.

const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
const MEDIA_RE = /\/media\/(product-images|product-videos|review-images|support-attachments)\/(.+?)(?:\?.*)?$/;

/** Candidate URLs to try, best first. */
export function faviconFetchCandidates(url: string): string[] {
  const out: string[] = [];
  const m = url.match(MEDIA_RE);
  if (m && SUPABASE_URL) {
    out.push(`${SUPABASE_URL}/storage/v1/object/public/${m[1]}/${m[2]}`);
  }
  if (/^https?:\/\//i.test(url)) out.push(url);
  return out;
}

/** Returns the favicon bytes + content type, or null if none could be loaded. */
export async function loadFavicon(url: string): Promise<{ body: ArrayBuffer; contentType: string } | null> {
  if (!url) return null;
  for (const candidate of faviconFetchCandidates(url)) {
    try {
      const res = await fetch(candidate, {
        cache: 'no-store',
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SutisareeIconFetcher/1.0)', Accept: 'image/*' },
      });
      if (!res.ok) continue;
      const contentType = res.headers.get('content-type') || 'image/png';
      if (!contentType.startsWith('image/')) continue;
      return { body: await res.arrayBuffer(), contentType };
    } catch {
      // try the next candidate
    }
  }
  return null;
}
