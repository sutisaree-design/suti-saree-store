import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import sharp from 'sharp';
import { verifyAdminToken, ADMIN_SESSION_COOKIE } from '@/lib/admin-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { uploadToStorage } from '@/lib/storage';

// ---------------------------------------------------------------------
// One-click "Convert all images to WebP" tool for the admin Settings
// page. Older uploads (from before the sharp/Node-version fix) are
// sitting in Supabase Storage as .jpg/.jpeg/.png. This route re-encodes
// them to real WebP, gives them a descriptive SEO-friendly filename
// (product-name / variant-color slug instead of a bare random hash --
// this is the actual lever for image SEO; the on-page `alt` text is
// already generated dynamically per image from the product's name,
// fabric, category and angle at render time -- see
// components/product/product-gallery.tsx and components/product-card.tsx
// -- so there's no separate per-image alt text stored in the database
// to "fix"), updates the DB row, and deletes the old file.
//
// Called repeatedly by the admin UI (components/admin/settings-panel.tsx)
// in a client-side loop, one small batch per request, so:
//   1. it stays comfortably under the serverless function time limit, and
//   2. the UI can show a live "X converted / Y skipped / Z remaining"
//      counter instead of one opaque spinner.
//
// The client passes back the URLs it has already attempted (both
// converted and failed) via `excludeUrls` so a batch never re-picks an
// image that already failed in this run -- that's what guarantees the
// loop terminates instead of retrying a permanently-broken image forever.
// ---------------------------------------------------------------------

export const maxDuration = 60;

const BATCH_SIZE = 8;
const WEBP_QUALITY = 82;
// Same cap as app/api/upload-image/route.ts and app/api/admin/import-image
// /route.ts -- this tool re-processes images uploaded BEFORE that cap
// existed, which is exactly the batch that's still sitting at full
// phone-camera resolution (300-600kB+ each) despite already being .webp.
const MAX_DIMENSION = 1600;
const MAX_BYTES = 15 * 1024 * 1024;
const BUCKET = 'product-images';
const BUCKET_MARKER = `/storage/v1/object/public/${BUCKET}/`;

type Candidate = {
  table: 'products' | 'product_variants';
  id: string;
  index: number;
  url: string;
  path: string; // storage path within the bucket, e.g. "variants/167...-abc.jpg"
  slugSource: string; // for building the new SEO filename
};

function isWebp(url: string): boolean {
  return /\.webp(\?|$)/i.test(url);
}

function storagePathFromUrl(url: string): string | null {
  const at = url.indexOf(BUCKET_MARKER);
  if (at === -1) return null;
  const rawPath = url.slice(at + BUCKET_MARKER.length).split('?')[0];
  try {
    return decodeURIComponent(rawPath);
  } catch {
    return rawPath;
  }
}

function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export async function POST(req: Request) {
  const cookie = cookies().get(ADMIN_SESSION_COOKIE)?.value ?? null;
  const verified = await verifyAdminToken(cookie);
  if (!verified.valid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const excludeUrls = new Set<string>(Array.isArray(body?.excludeUrls) ? body.excludeUrls : []);

  const admin = getSupabaseAdmin();

  const [{ data: products, error: productsErr }, { data: variants, error: variantsErr }] = await Promise.all([
    admin.from('products').select('id, name, images'),
    admin.from('product_variants').select('id, color, images'),
  ]);

  if (productsErr || variantsErr) {
    return NextResponse.json(
      { error: (productsErr || variantsErr)?.message || 'Could not read products/variants.' },
      { status: 500 }
    );
  }

  // Build the full "still needs converting" candidate list, minus anything
  // this run has already attempted (success or failure).
  const candidates: Candidate[] = [];

  for (const row of products ?? []) {
    const images: string[] = row.images ?? [];
    images.forEach((url, index) => {
      // Previously this skipped any URL already ending in .webp -- but a
      // webp file uploaded before the MAX_DIMENSION resize existed can
      // still be 300-600kB+ at full phone-camera resolution. Every image
      // is now a candidate; the per-image dimension check inside the
      // processing loop below is what actually decides whether a webp
      // file needs re-encoding or is already small enough to leave alone.
      if (!url || excludeUrls.has(url)) return;
      const path = storagePathFromUrl(url);
      if (!path) return; // not one of our own storage files -- leave untouched
      candidates.push({ table: 'products', id: row.id, index, url, path, slugSource: row.name || 'product' });
    });
  }

  for (const row of variants ?? []) {
    const images: string[] = row.images ?? [];
    images.forEach((url, index) => {
      if (!url || excludeUrls.has(url)) return;
      const path = storagePathFromUrl(url);
      if (!path) return;
      candidates.push({
        table: 'product_variants',
        id: row.id,
        index,
        url,
        path,
        slugSource: row.color || 'variant',
      });
    });
  }

  const totalRemaining = candidates.length;
  const batch = candidates.slice(0, BATCH_SIZE);

  let converted = 0;
  let skipped = 0;
  let alreadyOptimal = 0;
  const attempted: string[] = [];

  // Group the batch by row so each row only gets ONE update() call even if
  // it has multiple images being converted in this batch.
  const byRow = new Map<string, { table: Candidate['table']; id: string; images: string[]; edits: Map<number, string> }>();

  for (const c of batch) {
    attempted.push(c.url);
    try {
      const sourceRes = await fetch(c.url);
      if (!sourceRes.ok) throw new Error(`source fetch ${sourceRes.status}`);
      const arrayBuffer = await sourceRes.arrayBuffer();
      if (arrayBuffer.byteLength > MAX_BYTES) throw new Error('source too large');

      const srcBuffer = Buffer.from(arrayBuffer);
      const probe = sharp(srcBuffer, { failOn: 'none' }).rotate();
      const meta = await probe.metadata();

      // Already a webp file, and already within the target dimensions --
      // nothing to gain from re-encoding it, so leave it (and its file
      // size) exactly as-is instead of doing pointless work every run.
      if (
        isWebp(c.url) &&
        meta.width && meta.width <= MAX_DIMENSION &&
        meta.height && meta.height <= MAX_DIMENSION
      ) {
        alreadyOptimal++;
        continue;
      }

      const webpBuffer = await probe
        .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: WEBP_QUALITY })
        .toBuffer();

      const folder = c.path.startsWith('variants/') ? 'variants' : 'products';
      const slug = slugify(c.slugSource);
      const newPath = `${folder}/${slug ? `${slug}-` : ''}${Date.now()}-${Math.random().toString(36).slice(2, 9)}.webp`;

      // Writes through the active storage provider (Supabase or R2, see
      // lib/storage.ts) -- the OLD file being cleaned up below is always
      // on Supabase (that's how it was found as a candidate), but the
      // freshly re-encoded replacement lands wherever new uploads go.
      const { url: newUrl } = await uploadToStorage({
        bucket: BUCKET,
        path: newPath,
        buffer: webpBuffer,
        contentType: 'image/webp',
      });

      const rowKey = `${c.table}:${c.id}`;
      if (!byRow.has(rowKey)) {
        const sourceRow =
          c.table === 'products'
            ? (products ?? []).find((r) => r.id === c.id)
            : (variants ?? []).find((r) => r.id === c.id);
        byRow.set(rowKey, {
          table: c.table,
          id: c.id,
          images: [...((sourceRow?.images as string[]) ?? [])],
          edits: new Map(),
        });
      }
      byRow.get(rowKey)!.edits.set(c.index, newUrl);

      // Best-effort cleanup of the old file. Never lets a delete failure
      // undo a successful conversion -- the row already points at the new
      // file either way.
      admin.storage
        .from(BUCKET)
        .remove([c.path])
        .catch((e) => console.error('[convert-images-webp] old file cleanup failed:', c.path, e));

      converted++;
    } catch (err) {
      console.error('[convert-images-webp] skipped', c.url, err);
      skipped++;
    }
  }

  const updateErrors: string[] = [];
  const rowUpdates = Array.from(byRow.values());
  for (const { table, id, images, edits } of rowUpdates) {
    edits.forEach((newUrl: string, idx: number) => {
      images[idx] = newUrl;
    });
    const { error } = await admin.from(table).update({ images }).eq('id', id);
    if (error) updateErrors.push(`${table}:${id} ${error.message}`);
  }

  return NextResponse.json({
    totalRemainingBeforeBatch: totalRemaining,
    batchSize: batch.length,
    converted,
    skipped,
    alreadyOptimal,
    attemptedUrls: attempted,
    remainingAfterBatch: Math.max(0, totalRemaining - batch.length),
    done: batch.length === 0,
    updateErrors: updateErrors.length ? updateErrors : undefined,
  });
}
