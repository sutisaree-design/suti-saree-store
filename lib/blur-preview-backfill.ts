// ---------------------------------------------------------------------
// Backfill: generates real per-image blur previews for product/variant
// images uploaded BEFORE this feature shipped. New uploads already get
// one automatically (see app/api/upload-image/route.ts,
// app/api/admin/import-image/route.ts, and
// app/api/upload-review-photo/route.ts).
//
// SAFETY GUARANTEES
//   - 100% additive. This only ever adds rows to the independent
//     `image_blur_previews` table. products.images / product_variants
//     .images are never read for writing and never modified.
//   - Idempotent: builds one queue per run and skips any image URL that
//     already has a row (from a previous run, or because it was
//     uploaded after the feature shipped and got one automatically).
//     Safe to start/reset/re-run any time.
//   - Even if this backfill is NEVER run, nothing breaks: any image
//     without a row here simply keeps showing the generic shimmer
//     placeholder (see lib/image-placeholder.ts) — never a blank/broken
//     state. See Part 2 for how the fallback is applied.
// ---------------------------------------------------------------------

import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { generateBlurDataUrl } from '@/lib/blur-preview';
import { toPublicMediaUrl } from '@/lib/media-url';

const BATCH_SIZE = 8; // sharp resizing is CPU-heavy — keep batches small, same as image-resize-backfill

export interface BlurBackfillProgress {
  status: 'idle' | 'running' | 'done' | 'error';
  total: number;
  processed: number;
  generated: number; // preview rows newly created this run
  alreadyDone: number; // URLs that already had a preview (found during "start")
  failed: number;
  queue: string[]; // remaining image URLs to process
  recentErrors: { url: string; error: string }[];
  startedAt: string | null;
  updatedAt: string | null;
  finishedAt: string | null;
}

const DEFAULT_PROGRESS: BlurBackfillProgress = {
  status: 'idle',
  total: 0,
  processed: 0,
  generated: 0,
  alreadyDone: 0,
  failed: 0,
  queue: [],
  recentErrors: [],
  startedAt: null,
  updatedAt: null,
  finishedAt: null,
};

const SETTINGS_KEY = 'image_blur_backfill_progress';

export async function fetchBlurBackfillProgress(): Promise<BlurBackfillProgress> {
  const admin = getSupabaseAdmin();
  const { data } = await admin.from('settings').select('value').eq('key', SETTINGS_KEY).maybeSingle();
  if (!data?.value) return DEFAULT_PROGRESS;
  return { ...DEFAULT_PROGRESS, ...(data.value as Partial<BlurBackfillProgress>) };
}

async function saveProgress(progress: BlurBackfillProgress): Promise<void> {
  const admin = getSupabaseAdmin();
  await admin
    .from('settings')
    .upsert({ key: SETTINGS_KEY, value: { ...progress, updatedAt: new Date().toISOString() } }, { onConflict: 'key' });
}

/**
 * Every distinct image URL currently referenced by a product or a
 * variant — the same "unique image URLs actually in use" list the
 * media/responsive-images backfills conceptually work from.
 */
async function listAllReferencedImageUrls(): Promise<string[]> {
  const admin = getSupabaseAdmin();
  const urls = new Set<string>();

  const [{ data: products }, { data: variants }] = await Promise.all([
    admin.from('products').select('images'),
    admin.from('product_variants').select('images'),
  ]);

  for (const row of products ?? []) {
    for (const url of (row.images as string[] | null) ?? []) {
      if (url) urls.add(url);
    }
  }
  for (const row of variants ?? []) {
    for (const url of (row.images as string[] | null) ?? []) {
      if (url) urls.add(url);
    }
  }

  return Array.from(urls);
}

/**
 * Step 1: list every distinct product/variant image URL (source of
 * truth), and build a queue of the ones missing a real blur preview.
 * Resets any previous run's progress.
 */
export async function startBlurBackfill(): Promise<BlurBackfillProgress> {
  const admin = getSupabaseAdmin();
  const allUrls = await listAllReferencedImageUrls();

  // IMPORTANT: `image_blur_previews.image_url` is always keyed by the
  // CANONICAL (toPublicMediaUrl-transformed) URL — the same one every
  // read-side lookup uses (see getBlurPreviews callers). Legacy rows in
  // `products`/`product_variants` often store the raw pre-migration
  // Supabase/R2 URL though, so we dedupe/check "already done" by the
  // canonical form here, while still keeping the original raw URL around
  // to actually fetch the bytes from in runBlurBackfillBatch (both work
  // as a fetchable source, but the raw one is the one guaranteed to have
  // existed before the /media proxy did).
  const canonicalToRaw = new Map<string, string>();
  for (const raw of allUrls) {
    const canonical = toPublicMediaUrl(raw) || raw;
    if (!canonicalToRaw.has(canonical)) canonicalToRaw.set(canonical, raw);
  }
  const canonicalUrls = Array.from(canonicalToRaw.keys());

  const existing = new Set<string>();
  // Chunk the "already have a preview" lookup so a single .in() call
  // never gets an unbounded URL list.
  const CHUNK = 200;
  for (let i = 0; i < canonicalUrls.length; i += CHUNK) {
    const chunk = canonicalUrls.slice(i, i + CHUNK);
    const { data } = await admin.from('image_blur_previews').select('image_url').in('image_url', chunk);
    for (const row of data ?? []) existing.add(row.image_url as string);
  }

  const queue = canonicalUrls.filter((c) => !existing.has(c)).map((c) => canonicalToRaw.get(c)!);
  const alreadyDone = canonicalUrls.length - queue.length;

  const progress: BlurBackfillProgress = {
    ...DEFAULT_PROGRESS,
    status: queue.length === 0 ? 'done' : 'running',
    total: queue.length,
    alreadyDone,
    queue,
    startedAt: new Date().toISOString(),
    finishedAt: queue.length === 0 ? new Date().toISOString() : null,
  };
  await saveProgress(progress);
  return progress;
}

/**
 * Step 2: process the next batch. Call repeatedly (the admin panel
 * polls this) until status becomes 'done'. For each URL: download the
 * image bytes directly from its public /media/... URL (works
 * regardless of which backend — Supabase vs R2 — currently serves it),
 * generate the blur preview, and upsert it.
 */
export async function runBlurBackfillBatch(): Promise<BlurBackfillProgress> {
  const progress = await fetchBlurBackfillProgress();
  if (progress.status !== 'running' || progress.queue.length === 0) {
    return progress;
  }

  const admin = getSupabaseAdmin();
  const batch = progress.queue.slice(0, BATCH_SIZE);
  const remaining = progress.queue.slice(BATCH_SIZE);

  for (const url of batch) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Fetch failed with status ${res.status}`);
      const arrayBuffer = await res.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      const blurDataUrl = await generateBlurDataUrl(buffer);
      // Store under the CANONICAL URL (see startBlurBackfill's comment) so
      // this row is actually found by every real read-side lookup, which
      // always looks up by the canonical, toPublicMediaUrl-transformed URL.
      const canonicalUrl = toPublicMediaUrl(url) || url;
      await admin
        .from('image_blur_previews')
        .upsert({ image_url: canonicalUrl, blur_data_url: blurDataUrl }, { onConflict: 'image_url' });
      progress.generated += 1;
    } catch (err) {
      progress.failed += 1;
      progress.recentErrors = [
        { url, error: err instanceof Error ? err.message : 'Unknown error' },
        ...progress.recentErrors,
      ].slice(0, 20);
    }
    progress.processed += 1;
  }

  progress.queue = remaining;
  if (remaining.length === 0) {
    progress.status = 'done';
    progress.finishedAt = new Date().toISOString();
  }

  await saveProgress(progress);
  return progress;
}

export async function resetBlurBackfillProgress(): Promise<BlurBackfillProgress> {
  await saveProgress(DEFAULT_PROGRESS);
  return DEFAULT_PROGRESS;
}
