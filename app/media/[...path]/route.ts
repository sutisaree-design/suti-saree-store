import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase-server';

// Public media proxy: serves storage files under our own domain, so every
// place that surfaces a media URL externally — sitemap, Merchant Center /
// Pinterest feeds, JSON-LD video/image schema — shows aruhihandlooms.com
// instead of the storage provider's host.
//
// DUAL-WRITE UPDATE (feature/media-dual-write-toggle)
// Since every new upload goes to BOTH Supabase and R2, this route can now
// try either backend first (controlled by the admin toggle in DB setting
// media_storage_backend) and automatically fall back to the other if the
// preferred one 404s or errors. For the ~500 pre-existing Supabase-only
// files, R2 will 404 → fallback to Supabase succeeds. For new dual-written
// files, either backend works.

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_BACKEND_BASE = `${SUPABASE_URL}/storage/v1/object/public`;

const R2_CDN_BASE = (process.env.R2_PUBLIC_URL || '').replace(/\/$/, '');

// -----------------------------------------------------------------------
// Content-Type fallback by extension
//
// Supabase Storage (and some vendor upload flows) sometimes stores files
// with a generic/missing content-type — e.g. `application/octet-stream`
// — instead of `video/mp4`. Desktop browsers mostly ignore this and play
// the video anyway by sniffing the bytes, but mobile Safari and several
// Android WebViews refuse to play a <video src> whose Content-Type header
// isn't a real video/* type: it just sits there with no error, silently
// never starting. That's a second, independent cause of "plays on
// desktop, not on mobile" beyond the Range-request issue fixed earlier
// (see README-VIDEO-AUTOPLAY-MOBILE-FIX.md) — this covers the case where
// Range support is already fine but the upstream Content-Type is bad.
// -----------------------------------------------------------------------
const EXTENSION_MIME: Record<string, string> = {
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  ogv: 'video/ogg',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  avif: 'image/avif',
};

const GENERIC_CONTENT_TYPES = new Set(['application/octet-stream', 'binary/octet-stream', '']);

// -----------------------------------------------------------------------
// AVIF content negotiation — bot/crawler exclusion
//
// Google Merchant Center's image_link requirements do NOT include AVIF
// (only JPEG/PNG/WebP/GIF/BMP/TIFF) — if a feed-fetcher happened to
// advertise `Accept: image/avif` and got served AVIF bytes for a
// `.webp`-extensioned image_link URL, that product image could be
// disapproved as "unsupported image format" even though the URL itself
// never changed. Several social/link-preview crawlers (Pinterest,
// WhatsApp, etc.) have similarly inconsistent AVIF support. Since AVIF
// negotiation exists purely as a bandwidth optimization for real human
// visitors, the safe/conservative choice is to skip negotiation entirely
// for anything that looks like a bot/crawler/feed-fetcher — those always
// get the canonical WebP response, exactly as before this feature
// shipped, regardless of what their Accept header claims. This has no
// downside: Google Search/Google Images already indexes WebP fine, and
// Merchant Center/Pinterest/etc. only ever see the one format they
// already expect.
// -----------------------------------------------------------------------
const BOT_USER_AGENT_RE =
  /bot|crawl|spider|slurp|facebookexternalhit|pinterest|whatsapp|telegrambot|discordbot|linkedinbot|embedly|quora link preview|outbrain|skypeuripreview|w3c_validator|adsbot|mediapartners|feedfetcher|googleweblight|storebot|google-shopping/i;

function isBotOrFeedFetcher(userAgent: string | null): boolean {
  // No User-Agent at all (many server-side feed fetchers, some link
  // preview bots) — treat conservatively as non-browser, so it never
  // gets AVIF negotiation either. Real browsers always send a UA.
  if (!userAgent) return true;
  return BOT_USER_AGENT_RE.test(userAgent);
}

function resolveContentType(upstreamContentType: string | null, pathSegments: string[]): string {
  const ext = (pathSegments[pathSegments.length - 1] ?? '').split('.').pop()?.toLowerCase() ?? '';
  const guessed = EXTENSION_MIME[ext];

  if (!upstreamContentType || GENERIC_CONTENT_TYPES.has(upstreamContentType.toLowerCase())) {
    return guessed || upstreamContentType || 'application/octet-stream';
  }
  return upstreamContentType;
}

// -----------------------------------------------------------------------
// Settings reads, cached in-memory for a short TTL.
//
// This route serves EVERY image/video on the site, so a per-request
// Supabase query here was burning Fluid Active CPU time (confirmed via
// Vercel Usage dashboard — Fluid Active CPU hit 100% of the Hobby plan's
// 4-hour/month included quota, triggering the "approaching your limits"
// email and risking an auto-pause). Both admin toggles this reads
// (media_delivery, media_storage_backend) are flipped rarely and
// deliberately, and both toggle routes already call Cloudflare's
// purge_cache on save — so a short TTL here is safe: within ~45s of an
// admin flipping a toggle, Vercel's own cached value also expires and
// picks up the new setting, on top of Cloudflare no longer serving old
// cached image responses.
// -----------------------------------------------------------------------

const SETTINGS_CACHE_TTL_MS = 45_000;
let settingsCache: {
  value: { proxyEnabled: boolean; preferredBackend: 'supabase' | 'r2'; avifEnabled: boolean };
  expiresAt: number;
} | null = null;

async function getSettings(): Promise<{ proxyEnabled: boolean; preferredBackend: 'supabase' | 'r2'; avifEnabled: boolean }> {
  const now = Date.now();
  if (settingsCache && settingsCache.expiresAt > now) {
    return settingsCache.value;
  }

  let proxyEnabled = true;
  let preferredBackend: 'supabase' | 'r2' = 'supabase';
  // Kill-switch for AVIF content negotiation — see
  // lib/settings-api.ts (AvifNegotiationSettings) / Admin > Settings.
  // Defaults ON; flipping it OFF reverts every image to plain WebP for
  // every requester, immediately (this route's settings read shares the
  // same short TTL cache as the other two toggles below, and the admin
  // save route purges Cloudflare on top of that).
  let avifEnabled = true;
  try {
    const supabase = getServerSupabase();
    const { data: rows } = await supabase
      .from('settings')
      .select('key, value')
      .in('key', ['media_delivery', 'media_storage_backend', 'avif_negotiation']);

    for (const row of rows ?? []) {
      if (row.key === 'media_delivery') {
        const v = row.value as { proxy_enabled?: boolean } | undefined;
        if (typeof v?.proxy_enabled === 'boolean') proxyEnabled = v.proxy_enabled;
      }
      if (row.key === 'media_storage_backend') {
        const v = row.value as { backend?: string } | undefined;
        if (v?.backend === 'r2' && R2_CDN_BASE) preferredBackend = 'r2';
      }
      if (row.key === 'avif_negotiation') {
        const v = row.value as { enabled?: boolean } | undefined;
        if (typeof v?.enabled === 'boolean') avifEnabled = v.enabled;
      }
    }
  } catch {
    // Supabase unreachable — use fail-open defaults (and don't cache a
    // failure, so the next request retries instead of being stuck for 45s)
    return { proxyEnabled, preferredBackend, avifEnabled };
  }

  const value = { proxyEnabled, preferredBackend, avifEnabled };
  settingsCache = { value, expiresAt: now + SETTINGS_CACHE_TTL_MS };
  return value;
}

// -----------------------------------------------------------------------
// Responsive-size suffix fallback
//
// When Admin > Settings > Responsive Images is ON, the custom image
// loader (lib/cloudflare-image-loader.js) requests -sm/-md suffixed
// variants for smaller widths. Not every image has those variants yet
// (only new uploads get them automatically; older images need the
// "Generate Responsive Image Sizes" backfill to reach them). Rather than
// relying on the backfill having run, or on the toggle being flipped in
// the right order, this route strips a -sm/-md suffix and retries the
// original file whenever the suffixed path isn't found — so a missing
// variant NEVER shows a broken/blank image, on any image, at any time,
// backfilled or not.
// -----------------------------------------------------------------------

const SIZE_SUFFIX_RE = /-(?:sm|md)(\.[a-zA-Z0-9]+)$/;

function stripSizeSuffix(pathSegments: string[]): string[] | null {
  if (pathSegments.length === 0) return null;
  const last = pathSegments[pathSegments.length - 1];
  const match = last.match(SIZE_SUFFIX_RE);
  if (!match) return null;
  const original = last.replace(SIZE_SUFFIX_RE, match[1]);
  return [...pathSegments.slice(0, -1), original];
}

// Cheap existence check (no body downloaded) — used only in redirect
// mode, so the bandwidth-saving point of that mode is never undermined.
async function headExists(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: 'HEAD' });
    return res.ok;
  } catch {
    return false;
  }
}

// -----------------------------------------------------------------------
// Resolved-backend cache (per serverless instance, in-memory)
//
// The HEAD-check fallback below is only needed for the (small, shrinking)
// set of files whose R2 mirror is missing — every uploaded file is
// IMMUTABLE (re-uploads always get a new filename, see lib/storage.ts),
// so once we've determined which backend actually has a given path, that
// answer never changes. Without this cache, every single image request
// in redirect mode would pay for a HEAD round-trip to R2 before
// redirecting — including the ~99% of images that are already mirrored
// fine on both backends and never needed the check in the first place.
// Caching the resolved backend means that cost is paid at most ONCE per
// path per warm serverless instance; every subsequent request for that
// path (from any user, crawler, or device) redirects immediately with
// zero extra latency, same as before this fallback existed.
//
// Capped at a few thousand entries so a long-lived instance can't grow
// this unboundedly — oldest entries are evicted first (simple FIFO via
// Map insertion order) once the cap is hit.
// -----------------------------------------------------------------------
const RESOLVED_BACKEND_CACHE_MAX = 5000;
const resolvedBackendCache = new Map<string, 'supabase' | 'r2'>();

function cacheKey(pathSegments: string[]): string {
  return pathSegments.join('/');
}

function getCachedBackend(pathSegments: string[]): 'supabase' | 'r2' | null {
  return resolvedBackendCache.get(cacheKey(pathSegments)) ?? null;
}

function setCachedBackend(pathSegments: string[], backend: 'supabase' | 'r2'): void {
  const key = cacheKey(pathSegments);
  if (!resolvedBackendCache.has(key) && resolvedBackendCache.size >= RESOLVED_BACKEND_CACHE_MAX) {
    const oldestKey = resolvedBackendCache.keys().next().value;
    if (oldestKey !== undefined) resolvedBackendCache.delete(oldestKey);
  }
  resolvedBackendCache.set(key, backend);
}

// Separate small cache: -sm/-md paths confirmed to not exist on EITHER
// backend yet (responsive-size backfill hasn't reached them). Once known,
// future requests for that exact suffixed path skip straight to serving
// the original — no repeat HEAD checks.
const MISSING_SUFFIX_CACHE_MAX = 5000;
const missingSuffixCache = new Set<string>();

function markSuffixMissing(pathSegments: string[]): void {
  const key = cacheKey(pathSegments);
  if (!missingSuffixCache.has(key) && missingSuffixCache.size >= MISSING_SUFFIX_CACHE_MAX) {
    const oldestKey = missingSuffixCache.values().next().value;
    if (oldestKey !== undefined) missingSuffixCache.delete(oldestKey);
  }
  missingSuffixCache.add(key);
}

// -----------------------------------------------------------------------
// Upstream fetch with auto-fallback
// -----------------------------------------------------------------------

// Swaps a trailing `.webp` extension for `.avif`, keeping everything else
// (folder path, -sm/-md suffix) identical — this is the sibling AVIF file
// that lib/image-sizes.ts / lib/image-resize-backfill.ts upload right next
// to every WebP file it generates.
function toAvifPathSegments(pathSegments: string[]): string[] | null {
  if (pathSegments.length === 0) return null;
  const last = pathSegments[pathSegments.length - 1];
  if (!last.toLowerCase().endsWith('.webp')) return null;
  const swapped = last.slice(0, -'.webp'.length) + '.avif';
  return [...pathSegments.slice(0, -1), swapped];
}

function buildUpstreamUrl(backend: 'supabase' | 'r2', pathSegments: string[]): string | null {
  const encoded = pathSegments.map(encodeURIComponent).join('/');
  if (backend === 'r2') {
    if (!R2_CDN_BASE) return null;
    return `${R2_CDN_BASE}/${encoded}`;
  }
  if (!SUPABASE_URL) return null;
  return `${SUPABASE_BACKEND_BASE}/${encoded}`;
}

async function fetchFromUpstream(
  pathSegments: string[],
  preferredBackend: 'supabase' | 'r2',
  range: string | null
): Promise<{ response: Response; backend: string } | null> {
  const order: Array<'supabase' | 'r2'> =
    preferredBackend === 'r2' ? ['r2', 'supabase'] : ['supabase', 'r2'];

  for (const backend of order) {
    const url = buildUpstreamUrl(backend, pathSegments);
    if (!url) continue; // skip if env vars missing for this backend

    try {
      const upstream = await fetch(url, range ? { headers: { Range: range } } : undefined);
      if (upstream.ok || upstream.status === 206) {
        return { response: upstream, backend };
      }
      // 404 or other error from this backend → try the next one
    } catch {
      // Network error from this backend → try the next one
    }
  }
  return null; // both backends failed
}

// -----------------------------------------------------------------------
// Route handler
// -----------------------------------------------------------------------

export async function GET(req: NextRequest, { params }: { params: { path: string[] } }) {
  if (!params.path || params.path.length === 0) {
    return new NextResponse('Not found', { status: 404 });
  }

  const { proxyEnabled, preferredBackend, avifEnabled } = await getSettings();

  // Quota-saving redirect mode: hand browser/crawler off to the preferred
  // backend directly (R2's cdn.aruhihandlooms.com if that's selected in
  // Media Storage — Preferred Backend, otherwise Supabase). Falls back to
  // the other backend if the preferred one has no URL configured (e.g. R2
  // env vars missing), so this never redirects to a broken/empty URL.
  if (!proxyEnabled) {
    // NOTE: AVIF content negotiation (below) only applies in proxy mode.
    // In redirect mode the browser is handed off with a 307 straight to
    // the backend's own URL, which always serves whatever file exists at
    // that exact path (the WebP one) — there's no request left for this
    // route to inspect the Accept header on. This is a pre-existing
    // trade-off of quota-saving redirect mode, not a bug introduced here.
    //
    // Quota-saving redirect mode: hand off with a 307, never downloading
    // the bytes ourselves (that's the whole point of this mode).
    //
    // FIX: dual-write to R2 is best-effort (see lib/storage.ts), so a
    // transient R2 upload failure at write time can leave a file that
    // only ever exists on Supabase. Redirecting straight to the
    // preferred backend with no existence check sends those files to a
    // permanent 404. We verify which backend actually has the file
    // before redirecting — but ONLY pay for that check once per path
    // EVER (see resolvedBackendCache above): a file's contents and
    // location never change once uploaded, so every request after the
    // first for that exact path redirects immediately with zero extra
    // latency, same as before this fix existed.
    const otherBackendOf = (b: 'supabase' | 'r2'): 'supabase' | 'r2' => (b === 'r2' ? 'supabase' : 'r2');

    // Resolves which backend to redirect to for one exact path. Checks
    // the cache first (the common case, and the only thing that runs for
    // the ~99% of files mirrored fine on both backends after their first
    // request). Only reaches for the network on a true cache miss.
    const resolveBackendFor = async (pathSegments: string[]): Promise<'supabase' | 'r2' | null> => {
      const cached = getCachedBackend(pathSegments);
      if (cached) return cached;

      const preferredUrl = buildUpstreamUrl(preferredBackend, pathSegments);
      if (preferredUrl && (await headExists(preferredUrl))) {
        setCachedBackend(pathSegments, preferredBackend);
        return preferredBackend;
      }

      const fallbackBackend = otherBackendOf(preferredBackend);
      const fallbackUrl = buildUpstreamUrl(fallbackBackend, pathSegments);
      if (fallbackUrl && (await headExists(fallbackUrl))) {
        setCachedBackend(pathSegments, fallbackBackend);
        return fallbackBackend;
      }

      return null; // confirmed on neither backend
    };

    const last = params.path[params.path.length - 1] ?? '';
    const isSuffixed = SIZE_SUFFIX_RE.test(last);
    let targetPath = params.path;

    if (isSuffixed && !getCachedBackend(params.path) && !missingSuffixCache.has(cacheKey(params.path))) {
      // -sm/-md variants may not exist yet even when the original does
      // (responsive-size backfill runs separately from upload) — resolved
      // once per path, then cached either way (found, or known-missing)
      // so this check never repeats for the same path again.
      const suffixedBackend = await resolveBackendFor(params.path);
      if (!suffixedBackend) {
        markSuffixMissing(params.path);
        const fallbackPath = stripSizeSuffix(params.path);
        if (fallbackPath) targetPath = fallbackPath;
      }
    } else if (isSuffixed && missingSuffixCache.has(cacheKey(params.path))) {
      const fallbackPath = stripSizeSuffix(params.path);
      if (fallbackPath) targetPath = fallbackPath;
    }

    const resolvedBackend = (await resolveBackendFor(targetPath)) ?? preferredBackend;
    const redirectUrl = buildUpstreamUrl(resolvedBackend, targetPath) ?? buildUpstreamUrl(otherBackendOf(resolvedBackend), targetPath);

    if (!redirectUrl) return new NextResponse('Not found', { status: 404 });
    return NextResponse.redirect(redirectUrl, 307);
  }

  const range = req.headers.get('range');

  // -----------------------------------------------------------------
  // AVIF content negotiation
  //
  // Gated by THREE independent things, all of which must hold:
  //   1. avifEnabled — the Admin > Settings kill-switch (see getSettings
  //      above / lib/settings-api.ts AvifNegotiationSettings). Flip this
  //      off any time to revert to plain WebP for everyone, immediately
  //      — e.g. if a Merchant Center/Pinterest image gets disapproved
  //      for a reason that might be AVIF-related.
  //   2. The requester's Accept header explicitly advertises
  //      `image/avif` support.
  //   3. The requester isn't a bot/feed-fetcher (see isBotOrFeedFetcher
  //      above — this is what keeps Merchant Center / Pinterest /
  //      sitemap-driven crawlers always getting the plain WebP they
  //      expect, independently of the kill-switch above).
  // If the AVIF sibling doesn't exist yet on either backend (not
  // backfilled, generation failed, or this is a legacy pre-AVIF upload),
  // this falls straight through to the normal WebP flow below — same
  // fail-safe philosophy as the rest of this route, never a broken/blank
  // image.
  // -----------------------------------------------------------------
  const acceptHeader = req.headers.get('accept') || '';
  const userAgent = req.headers.get('user-agent');
  const isNegotiable = avifEnabled && acceptHeader.includes('image/avif') && !isBotOrFeedFetcher(userAgent);

  let result: { response: Response; backend: string } | null = null;
  let servedAvif = false;

  if (isNegotiable) {
    const avifPath = toAvifPathSegments(params.path);
    if (avifPath) {
      const avifResult = await fetchFromUpstream(avifPath, preferredBackend, range);
      if (avifResult && avifResult.response.body) {
        result = avifResult;
        servedAvif = true;
      }
    }
  }

  if (!result) {
    result = await fetchFromUpstream(params.path, preferredBackend, range);

    if (!result) {
      const fallbackPath = stripSizeSuffix(params.path);
      if (fallbackPath) {
        result = await fetchFromUpstream(fallbackPath, preferredBackend, range);
      }
    }
  }

  if (!result || !result.response.body) {
    return new NextResponse('Not found', { status: 404 });
  }

  const { response: upstream } = result;
  const contentType = servedAvif
    ? 'image/avif'
    : resolveContentType(upstream.headers.get('content-type'), params.path);
  const contentLength = upstream.headers.get('content-length');
  const contentRange = upstream.headers.get('content-range');
  const isPartial = upstream.status === 206;
  const isImageResponse = contentType.startsWith('image/');

  return new NextResponse(upstream.body, {
    status: isPartial ? 206 : 200,
    headers: {
      'Content-Type': contentType,
      ...(contentLength ? { 'Content-Length': contentLength } : {}),
      ...(contentRange ? { 'Content-Range': contentRange } : {}),
      'Accept-Ranges': 'bytes',
      // Uploaded files are never mutated in place (re-uploads get a new
      // filename), so it's safe for browsers/CDNs/crawlers to cache these
      // indefinitely.
      'Cache-Control': 'public, max-age=31536000, immutable',
      // Every image response this route serves — negotiated or not —
      // must declare Vary: Accept, since its bytes could differ based on
      // that header. Without this, a CDN/browser cache sitting in front
      // of this route could serve an AVIF response to a browser that
      // doesn't support AVIF, or vice versa, from a shared cache key.
      // NOTE: verify Cloudflare (sitting in front of this app — see the
      // purge_cache comments below) actually respects Vary on cached
      // responses; if not, its cache config needs an explicit "Cache by
      // Accept header" / Vary-aware caching rule for this route.
      ...(isImageResponse ? { Vary: 'Accept' } : {}),
    },
  });
}
