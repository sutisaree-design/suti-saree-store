import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import sharp from 'sharp';
import { requireAdmin } from '@/lib/admin-fulfillment-shared';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { uploadToStorage, type StorageBucket } from '@/lib/storage';
import { getBrandSettings, clearBrandMemo } from '@/lib/brand-server';

// ---------------------------------------------------------------------
// Admin > Media > Brand identity (logo + favicon)
//
// GET     -> { logo_url, favicon_url }
// POST    -> set one of them. Either
//              multipart/form-data { kind: 'logo'|'favicon', file }
//            or JSON { kind, url }   (an image already in the Media library)
//          The image is re-encoded as PNG (transparent background kept) so it
//          works everywhere: Gmail/Outlook emails, the invoice PDF, browser
//          tabs and Google search results (WebP/AVIF don't in several of those).
// DELETE  ?kind=logo|favicon -> back to the original text wordmark / monogram
//
// The favicon is stored in settings key `seo_settings` (field favicon_url),
// the same place Admin > Marketing > SEO already uses.
// ---------------------------------------------------------------------

export const dynamic = 'force-dynamic';

const MAX_BYTES = 4 * 1024 * 1024; // keeps us under Vercel's ~4.5MB body limit
const MEDIA_RE = /\/media\/(product-images|product-videos|review-images|support-attachments)\/(.+?)(?:\?.*)?$/;

type Kind = 'logo' | 'favicon';

async function loadSourceFromUrl(url: string): Promise<Buffer> {
  const m = url.match(MEDIA_RE);
  if (m) {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin.storage.from(m[1]).download(decodeURIComponent(m[2]));
    if (error || !data) throw new Error('Could not read that file from the media library.');
    return Buffer.from(await data.arrayBuffer());
  }
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:') throw new Error('Only https image URLs are allowed.');
  const res = await fetch(parsed.toString());
  if (!res.ok) throw new Error('Could not download that image.');
  return Buffer.from(await res.arrayBuffer());
}

async function toPng(kind: Kind, input: Buffer): Promise<Buffer> {
  const img = sharp(input, { failOn: 'none', density: 300 }).rotate();
  const meta = await img.metadata();
  if (!meta.width || !meta.height) throw new Error('That does not look like a valid image.');
  if (kind === 'favicon') {
    if (Math.min(meta.width, meta.height) < 48) {
      throw new Error('Favicon is too small — use an image that is at least 48×48 px (512×512 is ideal).');
    }
    return img
      .resize({ width: 512, height: 512, fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png({ compressionLevel: 9 })
      .toBuffer();
  }
  // Logo: 800px max width = sharp on retina screens, still tiny as a PNG.
  return img
    .resize({ width: 800, height: 400, fit: 'inside', withoutEnlargement: true })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

async function saveSetting(kind: Kind, url: string) {
  const admin = getSupabaseAdmin();
  const key = kind === 'logo' ? 'brand_settings' : 'seo_settings';
  const field = kind === 'logo' ? 'logo_url' : 'favicon_url';
  const { data } = await admin.from('settings').select('value').eq('key', key).maybeSingle();
  const current = (data?.value as Record<string, unknown>) || {};
  const { error } = await admin
    .from('settings')
    .upsert({ key, value: { ...current, [field]: url } }, { onConflict: 'key' });
  if (error) throw error;
  clearBrandMemo();
  // Same cache refresh the other admin settings forms trigger.
  revalidatePath('/', 'layout');
}

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json(await getBrandSettings({ fresh: true }));
}

export async function POST(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    let kind: string | null = null;
    let source: Buffer;

    if ((req.headers.get('content-type') || '').includes('multipart/form-data')) {
      const form = await req.formData();
      kind = form.get('kind') as string | null;
      const file = form.get('file');
      if (!(file instanceof File)) return NextResponse.json({ error: 'No file provided.' }, { status: 400 });
      if (file.size > MAX_BYTES) return NextResponse.json({ error: 'File is too large (max 4MB).' }, { status: 400 });
      source = Buffer.from(await file.arrayBuffer());
    } else {
      const body = await req.json().catch(() => ({}));
      kind = body?.kind;
      const url = typeof body?.url === 'string' ? body.url.trim() : '';
      if (!url) return NextResponse.json({ error: 'No image selected.' }, { status: 400 });
      source = await loadSourceFromUrl(url);
    }

    if (kind !== 'logo' && kind !== 'favicon') {
      return NextResponse.json({ error: 'kind must be "logo" or "favicon".' }, { status: 400 });
    }

    const png = await toPng(kind, source);
    const bucket: StorageBucket = 'product-images';
    const { url } = await uploadToStorage({
      bucket,
      path: `brand/${kind}-${Date.now()}.png`,
      buffer: png,
      contentType: 'image/png',
    });
    await saveSetting(kind, url);
    return NextResponse.json({ ok: true, kind, url, ...(await getBrandSettings({ fresh: true })) });
  } catch (err) {
    console.error('[brand] save error:', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Could not save.' }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const kind = new URL(req.url).searchParams.get('kind');
  if (kind !== 'logo' && kind !== 'favicon') {
    return NextResponse.json({ error: 'kind must be "logo" or "favicon".' }, { status: 400 });
  }
  try {
    await saveSetting(kind, '');
    return NextResponse.json({ ok: true, ...(await getBrandSettings({ fresh: true })) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Could not remove.' }, { status: 500 });
  }
}
