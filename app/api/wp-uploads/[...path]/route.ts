import { NextRequest, NextResponse } from 'next/server';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getR2Client } from '@/lib/storage';

// ---------------------------------------------------------------------
// Serves the old WordPress media library at its ORIGINAL URLs:
//
//   https://www.sutisaree.com/wp-content/uploads/2024/05/photo.jpg
//
// next.config.js rewrites /wp-content/uploads/* to this route, which reads
// the file straight from the Cloudflare R2 bucket (key
// "wp-content/uploads/2024/05/photo.jpg") with the same R2_* credentials the
// rest of the app already uses. No custom domain / public bucket URL needed,
// and every old link (blog posts, product descriptions, Google, backups)
// keeps working unchanged.
//
// Only media-type files are served (never .php etc). Responses are cacheable
// for a long time so Cloudflare / the browser absorb nearly all traffic.
// ---------------------------------------------------------------------

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CONTENT_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  svg: 'image/svg+xml',
  ico: 'image/x-icon',
  bmp: 'image/bmp',
  heic: 'image/heic',
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  mp3: 'audio/mpeg',
  pdf: 'application/pdf',
  xml: 'application/xml',
  txt: 'text/plain; charset=utf-8',
  csv: 'text/csv; charset=utf-8',
};

function decodeSegment(seg: string): string {
  if (!seg.includes('%')) return seg;
  try {
    return decodeURIComponent(seg);
  } catch {
    return seg;
  }
}

export async function GET(req: NextRequest, { params }: { params: { path: string[] } }) {
  const segments = (params.path || []).map(decodeSegment);
  if (segments.length === 0 || segments.some((s) => !s || s === '.' || s === '..' || s.includes('\\'))) {
    return new NextResponse('Not found', { status: 404 });
  }

  const key = `wp-content/uploads/${segments.join('/')}`;
  const ext = (segments[segments.length - 1].split('.').pop() || '').toLowerCase();
  const contentType = CONTENT_TYPES[ext];
  if (!contentType) return new NextResponse('Not found', { status: 404 });

  const bucket = process.env.R2_BUCKET_NAME;
  if (!bucket || !process.env.R2_ACCOUNT_ID || !process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY) {
    return new NextResponse('Storage not configured', { status: 503 });
  }

  try {
    const res = await getR2Client().send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
        Range: req.headers.get('range') || undefined,
        IfNoneMatch: req.headers.get('if-none-match') || undefined,
      })
    );

    const headers = new Headers({
      'Content-Type': res.ContentType && !/octet-stream/i.test(res.ContentType) ? res.ContentType : contentType,
      // Old uploads never change in place, so cache hard (browser 30d, CDN 1y).
      'Cache-Control': 'public, max-age=2592000, s-maxage=31536000, stale-while-revalidate=86400',
      'Accept-Ranges': 'bytes',
    });
    if (res.ETag) headers.set('ETag', res.ETag);
    if (res.LastModified) headers.set('Last-Modified', res.LastModified.toUTCString());
    if (typeof res.ContentLength === 'number') headers.set('Content-Length', String(res.ContentLength));
    if (res.ContentRange) headers.set('Content-Range', res.ContentRange);
    if (ext === 'svg') headers.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'");

    const body = res.Body as unknown as { transformToWebStream?: () => ReadableStream } | undefined;
    if (!body?.transformToWebStream) return new NextResponse('Not found', { status: 404 });

    return new NextResponse(body.transformToWebStream(), { status: res.ContentRange ? 206 : 200, headers });
  } catch (err) {
    const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
    const status = e?.$metadata?.httpStatusCode;
    if (status === 304) return new NextResponse(null, { status: 304 });
    if (status === 404 || e?.name === 'NoSuchKey' || e?.name === 'NotFound') {
      return new NextResponse('Not found', { status: 404, headers: { 'Cache-Control': 'public, max-age=300' } });
    }
    console.error('[wp-uploads] R2 read failed:', key, err);
    return new NextResponse('Could not load file', { status: 502 });
  }
}
