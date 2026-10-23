// ---------------------------------------------------------------------
// R2 backfill for pre-existing (pre-dual-write) media files.
//
// WHAT THIS DOES
//   New uploads already dual-write to both Supabase and R2 (see
//   uploadToStorage() in lib/storage.ts). This file handles the ~500
//   files that were uploaded BEFORE dual-write shipped and only exist
//   in Supabase — it copies (mirrors) them into R2 too, batch by batch,
//   so the admin can watch live progress instead of running a one-shot
//   script blind.
//
// SAFETY GUARANTEES
//   - Supabase is READ-ONLY in this whole process: files are downloaded
//     from Supabase and uploaded to R2. The Supabase original is never
//     modified, overwritten, or deleted by anything here.
//   - No database row is touched. No stored URL changes. Every URL stays
//     aruhihandlooms.com/media/... exactly as before.
//   - Idempotent: before copying, each file is HEAD-checked in R2 first.
//     If it already exists there (e.g. it was already dual-written, or a
//     previous backfill run already copied it), it's counted as
//     "already mirrored" and skipped — safe to re-run any time.
//   - If R2 becomes fully unavailable later (bucket deleted, credentials
//     revoked, Cloudflare outage), nothing here is affected — Supabase
//     still holds every original file and the /media/ proxy automatically
//     falls back to Supabase. Backfilled or not, the live site never
//     depends on R2 being present.
//
// PROGRESS TRACKING
//   Progress is stored in the existing `settings` table under key
//   'media_r2_backfill_progress' (no new table needed) so the admin
//   panel can poll it and render a live progress bar.
// ---------------------------------------------------------------------

import { HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { r2EnvPresent, type StorageBucket } from '@/lib/storage';

const BUCKETS: StorageBucket[] = ['product-images', 'product-videos', 'review-images'];
const BATCH_SIZE = 15; // small enough to comfortably finish inside a serverless function timeout

export interface BackfillQueueItem {
  bucket: StorageBucket;
  path: string;
}

export interface BackfillProgress {
  status: 'idle' | 'running' | 'done' | 'error';
  total: number;
  processed: number; // total + skipped-because-already-mirrored, cumulative
  mirrored: number; // newly copied to R2 this run (across all batches)
  alreadyMirrored: number; // found already in R2, skipped
  failed: number;
  queue: BackfillQueueItem[]; // remaining work, popped from the front each batch
  recentErrors: { bucket: string; path: string; error: string }[]; // last 20
  startedAt: string | null;
  updatedAt: string | null;
  finishedAt: string | null;
}

const DEFAULT_PROGRESS: BackfillProgress = {
  status: 'idle',
  total: 0,
  processed: 0,
  mirrored: 0,
  alreadyMirrored: 0,
  failed: 0,
  queue: [],
  recentErrors: [],
  startedAt: null,
  updatedAt: null,
  finishedAt: null,
};

const SETTINGS_KEY = 'media_r2_backfill_progress';

let r2Client: S3Client | null = null;
function getR2Client(): S3Client {
  const accountId = process.env.R2_ACCOUNT_ID as string;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID as string;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY as string;
  if (!r2Client) {
    r2Client = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
    });
  }
  return r2Client;
}

export async function fetchBackfillProgress(): Promise<BackfillProgress> {
  const admin = getSupabaseAdmin();
  const { data } = await admin.from('settings').select('value').eq('key', SETTINGS_KEY).maybeSingle();
  if (!data?.value) return DEFAULT_PROGRESS;
  return { ...DEFAULT_PROGRESS, ...(data.value as Partial<BackfillProgress>) };
}

async function saveBackfillProgress(progress: BackfillProgress): Promise<void> {
  const admin = getSupabaseAdmin();
  await admin
    .from('settings')
    .upsert({ key: SETTINGS_KEY, value: { ...progress, updatedAt: new Date().toISOString() } }, { onConflict: 'key' });
}

/**
 * Recursively lists every file (not folder) in a Supabase storage bucket,
 * read-only. Supabase Storage's `.list()` mixes files and "folders" in
 * one flat call per level, so folders (entries with no `id`/metadata) are
 * recursed into.
 */
async function listAllFiles(bucket: StorageBucket, prefix = ''): Promise<string[]> {
  const admin = getSupabaseAdmin();
  const paths: string[] = [];
  let offset = 0;
  const pageSize = 100;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await admin.storage
      .from(bucket)
      .list(prefix, { limit: pageSize, offset, sortBy: { column: 'name', order: 'asc' } });
    if (error || !data) break;

    for (const entry of data) {
      const fullPath = prefix ? `${prefix}/${entry.name}` : entry.name;
      // Supabase returns folders as entries with id === null and no metadata.
      if (entry.id === null && !entry.metadata) {
        const nested = await listAllFiles(bucket, fullPath);
        paths.push(...nested);
      } else {
        paths.push(fullPath);
      }
    }

    if (data.length < pageSize) break;
    offset += pageSize;
  }

  return paths;
}

/**
 * Step 1: build the full work queue by listing every file currently in
 * Supabase across all buckets. Resets any previous run's progress.
 */
export async function startBackfill(): Promise<BackfillProgress> {
  if (!r2EnvPresent()) {
    throw new Error('R2 environment variables are not configured — cannot start backfill.');
  }

  const queue: BackfillQueueItem[] = [];
  for (const bucket of BUCKETS) {
    const paths = await listAllFiles(bucket);
    for (const path of paths) queue.push({ bucket, path });
  }

  const progress: BackfillProgress = {
    ...DEFAULT_PROGRESS,
    status: queue.length === 0 ? 'done' : 'running',
    total: queue.length,
    queue,
    startedAt: new Date().toISOString(),
    finishedAt: queue.length === 0 ? new Date().toISOString() : null,
  };
  await saveBackfillProgress(progress);
  return progress;
}

/**
 * Step 2: process the next batch of queued files. Call repeatedly (the
 * admin panel polls this) until status becomes 'done'.
 *
 * For each file: HEAD-check R2 first (skip if already there — idempotent),
 * otherwise download the bytes from Supabase (read-only) and PUT them to
 * R2. Supabase is never written to or deleted from.
 */
export async function runBackfillBatch(): Promise<BackfillProgress> {
  const progress = await fetchBackfillProgress();
  if (progress.status !== 'running' || progress.queue.length === 0) {
    return progress; // nothing to do — idle, done, or already errored out
  }

  const client = getR2Client();
  const admin = getSupabaseAdmin();
  const bucketName = process.env.R2_BUCKET_NAME as string;

  const batch = progress.queue.slice(0, BATCH_SIZE);
  const remaining = progress.queue.slice(BATCH_SIZE);

  for (const item of batch) {
    const key = `${item.bucket}/${item.path}`;
    try {
      // Idempotent check — if it's already in R2 (e.g. dual-written after
      // Part 2 shipped, or a previous backfill run), skip it entirely.
      let alreadyExists = false;
      try {
        await client.send(new HeadObjectCommand({ Bucket: bucketName, Key: key }));
        alreadyExists = true;
      } catch {
        alreadyExists = false;
      }

      if (alreadyExists) {
        progress.alreadyMirrored += 1;
      } else {
        // Read-only download from Supabase (source of truth, never modified).
        const { data: blob, error: downloadError } = await admin.storage.from(item.bucket).download(item.path);
        if (downloadError || !blob) throw downloadError || new Error('Empty download from Supabase');

        const arrayBuffer = await blob.arrayBuffer();
        await client.send(
          new PutObjectCommand({
            Bucket: bucketName,
            Key: key,
            Body: Buffer.from(arrayBuffer),
            ContentType: blob.type || 'application/octet-stream',
            CacheControl: 'public, max-age=31536000, immutable',
          })
        );
        progress.mirrored += 1;
      }
    } catch (err) {
      progress.failed += 1;
      progress.recentErrors = [
        { bucket: item.bucket, path: item.path, error: err instanceof Error ? err.message : 'Unknown error' },
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

  await saveBackfillProgress(progress);
  return progress;
}

export async function resetBackfillProgress(): Promise<BackfillProgress> {
  await saveBackfillProgress(DEFAULT_PROGRESS);
  return DEFAULT_PROGRESS;
}
