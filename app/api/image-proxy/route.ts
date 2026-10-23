import { NextResponse } from 'next/server';

// ---------------------------------------------------------------------
// Same-origin image proxy — fixes "search by photo" silently matching
// nothing.
//
// lib/image-search.ts reads pixel data off a <canvas> to fingerprint each
// product photo. That only works if the image was loaded from the same
// origin OR from a host that sends proper CORS headers. Supabase Storage
// buckets don't always send those (depends on bucket/proxy config), so
// `ctx.getImageData()` was throwing a SecurityError ("tainted canvas") for
// every product, which lib/image-search.ts silently swallows — so instead
// of an error, shoppers just saw "Couldn't match that photo to any
// products" no matter what they uploaded.
//
// Fix: fetch the image bytes here on the server (no CORS restriction
// server-to-server) and stream them back to the browser from our own
// origin. The client then loads the photo from
// `/api/image-proxy?url=...` instead of the raw Supabase URL, so the
// canvas is never cross-origin and getImageData() always works.
// ---------------------------------------------------------------------

export const runtime = 'nodejs';

const FETCH_TIMEOUT_MS = 8000;

// Some CDNs / storage backends (Supabase's included) sit behind edge
// protection that quietly 403s or serves an HTML challenge page to
// requests that don't look like they came from a browser — Node's default
// fetch sends no User-Agent at all. That response then fails the
// `content-type startsWith('image/')` check below and every single
// product silently "can't be fingerprinted", which is exactly what makes
// search-by-photo return zero matches for every photo, not just bad ones.
// Sending a normal-looking browser UA/Accept avoids that class of block.
const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
};

async function fetchWithRetry(url: string, signal: AbortSignal): Promise<Response> {
  try {
    const res = await fetch(url, { signal, headers: BROWSER_HEADERS, redirect: 'follow' });
    if (res.ok) return res;
    // One retry on transient upstream hiccups (5xx / 429) — most product
    // photo hosts are reliable, but a single retry costs nothing and
    // avoids a whole product silently dropping out of the ranking over a
    // one-off blip.
    if (res.status >= 500 || res.status === 429) {
      return await fetch(url, { signal, headers: BROWSER_HEADERS, redirect: 'follow' });
    }
    return res;
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') throw err;
    return await fetch(url, { signal, headers: BROWSER_HEADERS, redirect: 'follow' });
  }
}

function isBlockedHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return (
    h === 'localhost' ||
    h === '127.0.0.1' ||
    h === '0.0.0.0' ||
    h === '::1' ||
    h.endsWith('.local') ||
    h.startsWith('10.') ||
    h.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(h)
  );
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const src = searchParams.get('url') || '';

  let parsed: URL;
  try {
    parsed = new URL(src);
  } catch {
    return NextResponse.json({ error: 'invalid url' }, { status: 400 });
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return NextResponse.json({ error: 'invalid protocol' }, { status: 400 });
  }
  if (isBlockedHost(parsed.hostname)) {
    return NextResponse.json({ error: 'blocked host' }, { status: 400 });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const upstream = await fetchWithRetry(parsed.toString(), controller.signal);
    if (!upstream.ok || !upstream.body) {
      return NextResponse.json({ error: 'fetch failed' }, { status: 502 });
    }

    const contentType = upstream.headers.get('content-type') || '';
    const buf = await upstream.arrayBuffer();

    // Some storage/CDN configs omit Content-Type or send a generic
    // 'application/octet-stream' for perfectly valid image files instead
    // of e.g. 'image/jpeg'. Rejecting on the header alone used to throw
    // those product photos out even though the bytes were fine, which —
    // across the whole catalog — is enough by itself to make "search by
    // photo" come back empty every time. Check actual file signature
    // (magic bytes) instead of trusting the header; only reject things
    // that are clearly *not* image data (e.g. an HTML error/login page).
    const bytes = new Uint8Array(buf.slice(0, 12));
    const looksLikeImage =
      contentType.startsWith('image/') ||
      (bytes[0] === 0xff && bytes[1] === 0xd8) || // JPEG
      (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) || // PNG
      (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) || // GIF
      (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) || // WEBP (RIFF....WEBP)
      (bytes[8] === 0x66 && bytes[9] === 0x74 && bytes[10] === 0x79 && bytes[11] === 0x70); // AVIF/HEIC (ftyp box)

    if (!looksLikeImage) {
      return NextResponse.json({ error: 'not an image' }, { status: 415 });
    }

    return new NextResponse(buf, {
      status: 200,
      headers: {
        'Content-Type': contentType.startsWith('image/') ? contentType : 'image/jpeg',
        // Cacheable — product photos rarely change and this avoids
        // re-proxying the same image on every search.
        'Cache-Control': 'public, max-age=3600, s-maxage=86400',
      },
    });
  } catch (err) {
    const timedOut = err instanceof Error && err.name === 'AbortError';
    return NextResponse.json({ error: timedOut ? 'timeout' : 'error' }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
}
