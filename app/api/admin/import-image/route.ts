import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import sharp from 'sharp';
import { verifyAdminToken, ADMIN_SESSION_COOKIE } from '@/lib/admin-auth';
import { uploadToStorage } from '@/lib/storage';
import { storeBlurPreview } from '@/lib/blur-preview';

const MAX_BYTES = 15 * 1024 * 1024; // 15MB safety cap on the source image

// How much of the bottom of the image gets trimmed off, regardless of the
// source size/aspect ratio. 0.10 = keep the top 90% of the height, drop the
// bottom 10%. Width is never touched.
const BOTTOM_TRIM_FRACTION = 0.10;

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
};

// Quality passed to sharp's webp encoder. 82 is a good balance between file
// size and visual quality for product photography.
const WEBP_QUALITY = 82;

// Product/variant photos never need to display wider than this anywhere on
// the storefront -- the biggest use is the product page gallery/zoom, which
// tops out well under this. Phone-camera originals commonly come in at
// 3000-4000px wide; without capping here, WebP re-encoding alone still left
// files at 300-600kB+ each because the pixel dimensions never shrank, only
// the format did. `withoutEnlargement: true` means a source already
// narrower than this is left untouched instead of being upscaled.
const MAX_DIMENSION = 1600;

/**
 * Trims the bottom BOTTOM_TRIM_FRACTION of the image's height, no matter
 * what size or aspect ratio the source image is. Full width is always kept;
 * only the last slice of the height is cut off (top-aligned crop).
 * Uses sharp so JPEG, PNG, WebP, AVIF, GIF, and TIFF sources all work --
 * jimp (the previous implementation) silently failed on WebP/AVIF, which is
 * what most modern image CDNs (Pexels, Unsplash, etc.) serve by default.
 * Re-encodes as real WebP regardless of source format -- this is the actual
 * conversion the "converted to WebP" toast talks about, not just a label.
 */
async function cropToProductFrame(buffer: Buffer): Promise<{ buffer: Buffer; contentType: string; ext: string }> {
  // `failOn: 'none'` -- sharp's default hard-throws on non-fatal decode
  // warnings (e.g. the non-standard EXIF/APP metadata phone camera and
  // watermark apps commonly write), even though those files open fine in
  // every browser. Without this, a real-looking image can silently fail
  // conversion and fall back to being stored in its original format. See
  // the matching comment in app/api/upload-image/route.ts.
  const image = sharp(buffer, { failOn: 'none' }).rotate();
  const metadata = await image.metadata();
  const w = metadata.width;
  const h = metadata.height;
  if (!w || !h) {
    throw new Error('Could not read image dimensions.');
  }

  // Keep full width, keep only the top (1 - BOTTOM_TRIM_FRACTION) of the height.
  const cropHeight = Math.max(1, Math.round(h * (1 - BOTTOM_TRIM_FRACTION)));

  const out = await image
    .extract({ left: 0, top: 0, width: w, height: cropHeight })
    .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: WEBP_QUALITY })
    .toBuffer();
  return { buffer: out, contentType: 'image/webp', ext: 'webp' };
}

/**
 * Re-encodes any supported source format (JPEG, PNG, GIF, AVIF, and
 * already-WebP sources too) as WebP via sharp, with no crop/resize.
 * This is what actually makes the "Image imported and converted to WebP"
 * toast true -- previously the image was re-hosted byte-for-byte as
 * downloaded and only the crop path touched sharp at all.
 */
async function convertToWebp(buffer: Buffer): Promise<{ buffer: Buffer; contentType: string; ext: string }> {
  // Same failOn: 'none' + rotate() reasoning as cropToProductFrame() above.
  const out = await sharp(buffer, { failOn: 'none' })
    .rotate()
    .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: WEBP_QUALITY })
    .toBuffer();
  return { buffer: out, contentType: 'image/webp', ext: 'webp' };
}

export async function POST(req: Request) {
  const cookie = cookies().get(ADMIN_SESSION_COOKIE)?.value ?? null;
  const verified = await verifyAdminToken(cookie);
  if (!verified.valid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const sourceUrl = (body?.url as string | undefined)?.trim();
  // "products" (default) or "variants" — just changes the storage sub-folder.
  const bucketFolder = body?.folder === 'variants' ? 'variants' : 'products';
  // Off by default -- when true, center-crop to the storefront's 4:5 frame
  // before saving. Everything else behaves exactly as before either way.
  const shouldCrop = body?.crop === true;

  if (!sourceUrl) {
    return NextResponse.json({ error: 'Give an image URL to import.' }, { status: 400 });
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(sourceUrl);
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      throw new Error('Only http(s) URLs are allowed.');
    }
  } catch {
    return NextResponse.json({ error: 'That does not look like a valid image URL.' }, { status: 400 });
  }

  try {
    const sourceRes = await fetch(parsedUrl.toString(), {
      // Some CDNs (e.g. Amazon) block requests with no browser-like UA.
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AruhiHandloomsBot/1.0)' },
    });

    if (!sourceRes.ok) {
      return NextResponse.json(
        { error: `Could not download that image (site returned ${sourceRes.status}).` },
        { status: 502 }
      );
    }

    const contentType = (sourceRes.headers.get('content-type') || '').split(';')[0].trim();
    if (!contentType.startsWith('image/')) {
      return NextResponse.json({ error: 'That URL does not point to an image.' }, { status: 400 });
    }

    const arrayBuffer = await sourceRes.arrayBuffer();
    if (arrayBuffer.byteLength > MAX_BYTES) {
      return NextResponse.json({ error: 'Image is too large (max 15MB).' }, { status: 400 });
    }

    // Every imported image is actually re-encoded to WebP via sharp before
    // it's stored -- this is real conversion, not just a filename/label
    // change. When the "Crop" toggle is on we additionally center-crop to
    // the storefront's 4:5 frame first (cropToProductFrame already returns
    // WebP too), otherwise we just re-encode the source as-is.
    let uploadBuffer = Buffer.from(arrayBuffer);
    let uploadContentType = contentType;
    let ext = EXT_BY_MIME[contentType] || 'jpg';

    if (shouldCrop) {
      try {
        const cropped = await cropToProductFrame(uploadBuffer);
        uploadBuffer = cropped.buffer;
        uploadContentType = cropped.contentType;
        ext = cropped.ext;
      } catch (cropErr) {
        console.error('[import-image] crop error, falling back to uncropped:', cropErr);
        // fall through and try a plain (uncropped) WebP conversion instead
      }
    }

    // If we didn't crop (either the toggle was off, or cropping failed
    // above and we're still holding the original bytes), convert to WebP
    // now. Falls back to uploading the original bytes/format untouched if
    // sharp can't decode the source for some reason, so the import never
    // hard-fails just because of the conversion step.
    if (uploadContentType !== 'image/webp') {
      try {
        const converted = await convertToWebp(uploadBuffer);
        uploadBuffer = converted.buffer;
        uploadContentType = converted.contentType;
        ext = converted.ext;
      } catch (convErr) {
        console.error('[import-image] webp conversion error, falling back to original format:', convErr);
        // fall through and upload the original bytes instead of failing the whole import
      }
    }

    // Generate 3 responsive sizes (-sm 480px, -md 900px, original 1600px)
    const { generateResponsiveSizes } = await import('@/lib/image-sizes');
    const basePath = `${bucketFolder}/${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const sizes = await generateResponsiveSizes(uploadBuffer);

    let mainUrl = '';
    if (sizes.length > 0) {
      await Promise.all(
        sizes.map(async ({ suffix, buffer, contentType: ct, ext: e }) => {
          const path = `${basePath}${suffix}.${e}`;
          const { url: u } = await uploadToStorage({
            bucket: 'product-images',
            path,
            buffer,
            contentType: ct,
          });
          // Same fix as app/api/upload-image/route.ts — generateResponsiveSizes()
          // now returns both a WebP and an AVIF entry for suffix === '', so
          // pick the WebP one specifically as the canonical DB URL.
          if (suffix === '' && ct === 'image/webp') mainUrl = u;
        })
      );
    } else {
      // Fallback: upload single file if size generation failed
      const path = `${basePath}.${ext}`;
      const { url: u } = await uploadToStorage({
        bucket: 'product-images',
        path,
        buffer: uploadBuffer,
        contentType: uploadContentType,
      });
      mainUrl = u;
    }

    // Real per-image blur preview (LQIP), keyed by the same canonical
    // URL just stored. storeBlurPreview never throws, so this can never
    // fail or block the import response.
    if (mainUrl) await storeBlurPreview(mainUrl, uploadBuffer);

    return NextResponse.json({ url: mainUrl });
  } catch (err) {
    console.error('[import-image] error:', err);
    return NextResponse.json(
      { error: 'Could not import that image. Check the URL and try again.' },
      { status: 500 }
    );
  }
}
