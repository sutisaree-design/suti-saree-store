import { NextResponse } from 'next/server';
import sharp from 'sharp';
import { uploadToStorage } from '@/lib/storage';
import { generateResponsiveSizes } from '@/lib/image-sizes';
import { storeBlurPreview } from '@/lib/blur-preview';

const MAX_BYTES = 15 * 1024 * 1024;
const WEBP_QUALITY = 82;
const MAX_DIMENSION = 1600;
const ALLOWED_TYPES = new Set([
  'image/jpeg', 'image/jpg', 'image/png', 'image/webp',
  'image/gif', 'image/avif', 'image/heic', 'image/heif',
]);

export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Expected multipart/form-data with a file field.' }, { status: 400 });
  }

  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file provided.' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'Image is too large (max 15MB).' }, { status: 400 });
  }
  if (file.type && !ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json({ error: 'Unsupported image type.' }, { status: 400 });
  }

  const ALLOWED_FOLDERS = new Set(['products', 'variants', 'hero-banners', 'tiles']);
  const rawFolder = (form.get('folder') as string | null) ?? 'products';
  const folder = ALLOWED_FOLDERS.has(rawFolder) ? rawFolder : 'products';
  const seoName = ((form.get('seoName') ?? form.get('slug')) as string | null) ?? '';
  const slug = seoName
    .trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

  try {
    const arrayBuffer = await file.arrayBuffer();
    let sourceBuffer = Buffer.from(arrayBuffer);

    // Convert source to a clean buffer first (handle HEIC, rotation, etc.)
    try {
      sourceBuffer = await sharp(sourceBuffer, { failOn: 'none' })
        .rotate()
        .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: WEBP_QUALITY })
        .toBuffer();
    } catch (convErr) {
      console.error('[upload-image] initial conversion error:', convErr);
      // Continue with original buffer — generateResponsiveSizes will try again
    }

    // Generate 3 responsive sizes
    const basePath = `${folder}/${slug ? `${slug}-` : ''}${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const sizes = await generateResponsiveSizes(sourceBuffer);

    if (sizes.length === 0) {
      return NextResponse.json({ error: 'Could not process that image. Please try again.' }, { status: 500 });
    }

    // Upload all sizes in parallel
    let mainUrl = '';
    await Promise.all(
      sizes.map(async ({ suffix, buffer, contentType, ext }) => {
        const path = `${basePath}${suffix}.${ext}`;
        const { url } = await uploadToStorage({
          bucket: 'product-images',
          path,
          buffer,
          contentType,
        });
        // generateResponsiveSizes() now returns BOTH a WebP and an AVIF
        // entry for suffix === '' (the "original" size) — the WebP one
        // stays the canonical URL stored in the DB/products.images[],
        // exactly as before this AVIF change. The AVIF file still gets
        // uploaded above; it just isn't the URL we hand back here. AVIF
        // is served transparently later via content negotiation in
        // app/media/[...path]/route.ts, never referenced directly.
        if (suffix === '' && contentType === 'image/webp') mainUrl = url;
      })
    );

    // Real per-image blur preview (LQIP), keyed by the same canonical
    // URL just stored. storeBlurPreview never throws (it swallows its
    // own errors), so this can never fail or block the upload response
    // — it's awaited only so the work reliably finishes before this
    // serverless invocation ends, not to gate success on it.
    if (mainUrl) await storeBlurPreview(mainUrl, sourceBuffer);

    return NextResponse.json({ url: mainUrl });
  } catch (err) {
    console.error('[upload-image] error:', err);
    return NextResponse.json({ error: 'Could not upload that image. Please try again.' }, { status: 500 });
  }
}
