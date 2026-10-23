/**
 * cloudflare-avif-worker.js  (PATCHED v2 — R2-crash-safe)
 *
 * Cloudflare Worker: AVIF content negotiation + media serving for BOTH:
 *   - cdn.aruhihandlooms.com/<key>            (existing custom domain)
 *   - aruhihandlooms.com/media/<key>          (Route, replaces old Vercel 307)
 *
 * CHANGES IN THIS VERSION (v2):
 *   Every call that touches env.MEDIA_BUCKET (R2) is now wrapped in
 *   try/catch. Previously, if the R2 binding was ever removed/misconfigured
 *   (env.MEDIA_BUCKET undefined) or R2 itself had an outage, the bare
 *   bucket.get()/bucket.head() calls would throw and the Worker would
 *   return a 500 instead of falling back to Supabase. Now, ANY R2 failure
 *   (missing binding, R2 outage, or just a missing object) falls through
 *   to Supabase the same way a normal 404-from-R2 already did.
 *
 * Everything else (AVIF negotiation, bot/crawler exclusion, Range support,
 * -sm/-md suffix fallback, /media/ path normalization) is unchanged.
 *
 * SETUP REQUIRED BEFORE DEPLOYING:
 *   - Plain-text var SUPABASE_URL in Settings > Variables (same value as
 *     NEXT_PUBLIC_SUPABASE_URL in Vercel, e.g. https://xxxxx.supabase.co)
 *   - Routes: aruhihandlooms.com/media/* and www.aruhihandlooms.com/media/*
 *     plus the existing cdn.aruhihandlooms.com custom domain — all already
 *     set up, untouched by this change.
 */

const BOT_USER_AGENT_RE =
  /bot|crawl|spider|slurp|facebookexternalhit|pinterest|whatsapp|telegrambot|discordbot|linkedinbot|embedly|quora link preview|outbrain|skypeuripreview|w3c_validator|adsbot|mediapartners|feedfetcher|googleweblight|storebot|google-shopping/i;

function isBotOrFeedFetcher(userAgent) {
  if (!userAgent) return true;
  return BOT_USER_AGENT_RE.test(userAgent);
}

const EXTENSION_MIME = {
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

function guessContentType(key) {
  const ext = key.split('.').pop()?.toLowerCase() || '';
  return EXTENSION_MIME[ext] || 'application/octet-stream';
}

function toAvifKey(key) {
  if (!key.toLowerCase().endsWith('.webp')) return null;
  return key.slice(0, -'.webp'.length) + '.avif';
}

const SIZE_SUFFIX_RE = /-(?:sm|md)(\.[a-zA-Z0-9]+)$/;
function stripSizeSuffix(key) {
  const match = key.match(SIZE_SUFFIX_RE);
  if (!match) return null;
  return key.replace(SIZE_SUFFIX_RE, match[1]);
}

function objectResponse(object, contentType, extraHeaders, rangeHeaders, status) {
  const headers = new Headers();
  headers.set('Content-Type', contentType);
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  headers.set('Accept-Ranges', 'bytes');
  if (object.httpEtag) headers.set('ETag', object.httpEtag);
  for (const [k, v] of Object.entries(extraHeaders || {})) headers.set(k, v);
  for (const [k, v] of Object.entries(rangeHeaders || {})) headers.set(k, v);
  return new Response(object.body, { status: status || 200, headers });
}

// NEW: every R2 access goes through here now. Returns null on ANY failure
// (missing binding, R2 outage, object not found) instead of throwing —
// callers treat null exactly like "not found in R2, try Supabase next".
async function getWithRange(bucket, key, rangeHeader) {
  if (!bucket) return { object: null, status: 404, rangeHeaders: {} }; // binding missing entirely

  try {
    if (!rangeHeader) {
      const object = await bucket.get(key);
      return { object, status: 200, rangeHeaders: {} };
    }

    const match = /^bytes=(\d+)-(\d*)$/.exec(rangeHeader);
    if (!match) {
      const object = await bucket.get(key);
      return { object, status: 200, rangeHeaders: {} };
    }

    const head = await bucket.head(key);
    if (!head) return { object: null, status: 404, rangeHeaders: {} };

    const size = head.size;
    const start = parseInt(match[1], 10);
    const end = match[2] ? parseInt(match[2], 10) : size - 1;

    const object = await bucket.get(key, { range: { offset: start, length: end - start + 1 } });
    if (!object) return { object: null, status: 404, rangeHeaders: {} };

    return {
      object,
      status: 206,
      rangeHeaders: {
        'Content-Range': `bytes ${start}-${end}/${size}`,
        'Content-Length': String(end - start + 1),
      },
    };
  } catch (err) {
    // R2 binding missing/misconfigured, or R2 itself erroring — treat
    // exactly like "not found", so the caller falls back to Supabase.
    return { object: null, status: 404, rangeHeaders: {} };
  }
}

// NEW: safe wrapper for the AVIF-sibling lookup too (previously a bare
// env.MEDIA_BUCKET.get(avifKey) with no try/catch at all).
async function safeGetAvif(bucket, avifKey) {
  if (!bucket) return null;
  try {
    return await bucket.get(avifKey);
  } catch {
    return null;
  }
}

async function fetchFromSupabase(key, rangeHeader, env) {
  if (!env.SUPABASE_URL) return null;
  const upstreamUrl = `${env.SUPABASE_URL.replace(/\/$/, '')}/storage/v1/object/public/${key
    .split('/')
    .map(encodeURIComponent)
    .join('/')}`;
  try {
    const res = await fetch(upstreamUrl, rangeHeader ? { headers: { Range: rangeHeader } } : undefined);
    if (!res.ok && res.status !== 206) return null;
    return res;
  } catch {
    return null;
  }
}

function supabaseToResponse(upstream, key) {
  const headers = new Headers();
  const ct = upstream.headers.get('content-type');
  headers.set('Content-Type', ct && ct !== 'application/octet-stream' ? ct : guessContentType(key));
  const cl = upstream.headers.get('content-length');
  if (cl) headers.set('Content-Length', cl);
  const cr = upstream.headers.get('content-range');
  if (cr) headers.set('Content-Range', cr);
  headers.set('Accept-Ranges', 'bytes');
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  return new Response(upstream.body, { status: upstream.status, headers });
}

// Resolves one key: tries R2 (now crash-safe), then falls back to Supabase.
async function resolveKey(env, key, rangeHeader) {
  const r2Result = await getWithRange(env.MEDIA_BUCKET, key, rangeHeader);
  if (r2Result.object) return { source: 'r2', ...r2Result };

  const supabaseRes = await fetchFromSupabase(key, rangeHeader, env);
  if (supabaseRes) return { source: 'supabase', response: supabaseRes };

  return null;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    let pathname = url.pathname;
    if (pathname.startsWith('/media/')) {
      pathname = pathname.slice('/media'.length);
    }
    const key = decodeURIComponent(pathname.replace(/^\/+/, ''));

    if (!key) {
      return new Response('Not found', { status: 404 });
    }

    const acceptHeader = request.headers.get('accept') || '';
    const userAgent = request.headers.get('user-agent');
    const rangeHeader = request.headers.get('range');
    const isImageWebp = key.toLowerCase().endsWith('.webp');

    const isNegotiable =
      isImageWebp && acceptHeader.includes('image/avif') && !isBotOrFeedFetcher(userAgent);

    if (isNegotiable) {
      const avifKey = toAvifKey(key);
      if (avifKey) {
        const avifObject = await safeGetAvif(env.MEDIA_BUCKET, avifKey);
        if (avifObject) {
          return objectResponse(avifObject, 'image/avif', { Vary: 'Accept' });
        }
        // No AVIF sibling (or R2 unavailable) — fall through to WebP path.
      }
    }

    let resolved = await resolveKey(env, key, rangeHeader);

    if (!resolved) {
      const fallbackKey = stripSizeSuffix(key);
      if (fallbackKey) {
        resolved = await resolveKey(env, fallbackKey, rangeHeader);
      }
    }

    if (!resolved) {
      return new Response('Not found', { status: 404 });
    }

    if (resolved.source === 'r2') {
      const contentType = guessContentType(key);
      const extraHeaders = contentType.startsWith('image/') ? { Vary: 'Accept' } : {};
      return objectResponse(resolved.object, contentType, extraHeaders, resolved.rangeHeaders, resolved.status);
    }

    return supabaseToResponse(resolved.response, key);
  },
};
