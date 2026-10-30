import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-fulfillment-shared';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { ListObjectsV2Command, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { canonicalMediaUrl, deleteFromStorage, getR2Client, r2EnvPresent, type StorageBucket } from '@/lib/storage';

// ---------------------------------------------------------------------
// Admin Media Library (WordPress / WooCommerce style)
//
// GET    /api/admin/media-library
//          ?bucket=all|product-images|product-videos|review-images|support-attachments
//          &type=all|image|video|other
//          &q=<search text>            (matches file name / folder / path)
//          &sort=newest|oldest|name|size
//          &page=1&perPage=48
//          &derived=1                  (also show -sm/-md/.avif resized copies)
//          &refresh=1                  (bypass the 60s listing cache)
//
// DELETE /api/admin/media-library  { bucket, path }
//          Removes the file AND its resized copies (-sm / -md / .avif)
//          from Supabase + R2.
//
// Read-only on storage for GET. Nothing here changes any DB row.
// ---------------------------------------------------------------------

export const dynamic = 'force-dynamic';
// Listing a large R2 bucket (WordPress uploads) on a cold start can take a few seconds.
export const maxDuration = 60;

const BUCKETS: StorageBucket[] = ['product-images', 'product-videos', 'review-images', 'support-attachments'];

const BUCKET_NAMES: Record<StorageBucket, string> = {
  'product-images': 'Product images',
  'product-videos': 'Product videos',
  'review-images': 'Review photos',
  'support-attachments': 'Support attachments',
};

const IMAGE_EXT = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif', 'heic', 'heif', 'svg']);
const VIDEO_EXT = new Set(['mp4', 'm4v', 'mov', 'webm', 'ogv']);

const MAX_FILES_PER_BUCKET = 20000;
const CACHE_TTL_MS = 60_000;

// "r2" = everything in the Cloudflare R2 bucket EXCEPT the four folders above
// (those are just mirrors of the Supabase buckets and are already listed
// through Supabase). This is where the old WordPress library lives
// (wp-content/uploads/2018 … 2026, elementor/, etc.).
type MediaBucket = StorageBucket | 'r2';
const R2_MIRROR_PREFIXES = new Set<string>(BUCKETS.map((b) => `${b}/`));
const MAX_FILES_R2 = 150000;
const R2_CACHE_TTL_MS = 5 * 60_000;
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.sutisaree.com').replace(/\/$/, '');

export interface MediaItem {
  bucket: MediaBucket;
  path: string;
  name: string;
  folder: string;
  url: string;
  type: 'image' | 'video' | 'other';
  size: number;
  mime: string;
  createdAt: string | null;
  derived: boolean;
  /** Smaller preview URL when one exists (WordPress -300x300 style copies). */
  thumb?: string;
}

type CacheEntry = { at: number; items: MediaItem[]; truncated: boolean };
const cache = new Map<MediaBucket, CacheEntry>();

function extOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i === -1 ? '' : name.slice(i + 1).toLowerCase();
}

function typeOf(name: string, mime: string): MediaItem['type'] {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  const ext = extOf(name);
  if (IMAGE_EXT.has(ext)) return 'image';
  if (VIDEO_EXT.has(ext)) return 'video';
  return 'other';
}

// Uploads create <base>.webp + <base>-sm.webp + <base>-md.webp + <base>.avif etc.
// Those extra copies are "derived" — hidden by default so the library shows
// one tile per real upload, exactly like WordPress hides thumbnails.
function isDerived(name: string): boolean {
  const ext = extOf(name);
  if (ext === 'avif') return true;
  // -sm / -md (our own uploads) and WordPress's -300x300 / -150x150 / -1024x683 copies.
  return /-(sm|md)\.[a-z0-9]+$/i.test(name) || /-\d{2,4}x\d{2,4}\.[a-z0-9]+$/i.test(name);
}

function baseOf(path: string): string {
  return path.replace(/\.[a-z0-9]+$/i, '').replace(/-(sm|md)$/i, '');
}

async function listFolder(bucket: StorageBucket, prefix: string, out: MediaItem[], state: { truncated: boolean }) {
  const admin = getSupabaseAdmin();
  const pageSize = 1000;
  let offset = 0;
  const subfolders: string[] = [];

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
        subfolders.push(fullPath);
        continue;
      }
      if (entry.name === '.emptyFolderPlaceholder') continue;
      if (out.length >= MAX_FILES_PER_BUCKET) {
        state.truncated = true;
        break;
      }
      const meta = (entry.metadata || {}) as { size?: number; mimetype?: string };
      const mime = meta.mimetype || '';
      out.push({
        bucket,
        path: fullPath,
        name: entry.name,
        folder: prefix,
        url: canonicalMediaUrl(bucket, fullPath),
        type: typeOf(entry.name, mime),
        size: Number(meta.size) || 0,
        mime,
        createdAt: entry.created_at || entry.updated_at || null,
        derived: isDerived(entry.name),
      });
    }

    if (data.length < pageSize || out.length >= MAX_FILES_PER_BUCKET) break;
    offset += pageSize;
  }

  // Walk sub-folders a few at a time to keep it fast without hammering Supabase.
  const CONCURRENCY = 6;
  for (let i = 0; i < subfolders.length; i += CONCURRENCY) {
    if (out.length >= MAX_FILES_PER_BUCKET) {
      state.truncated = true;
      break;
    }
    await Promise.all(subfolders.slice(i, i + CONCURRENCY).map((f) => listFolder(bucket, f, out, state)));
  }
}

async function loadBucket(bucket: StorageBucket, refresh: boolean): Promise<CacheEntry> {
  const hit = cache.get(bucket);
  if (!refresh && hit && Date.now() - hit.at < CACHE_TTL_MS) return hit;
  const items: MediaItem[] = [];
  const state = { truncated: false };
  await listFolder(bucket, '', items, state);
  const entry = { at: Date.now(), items, truncated: state.truncated };
  cache.set(bucket, entry);
  return entry;
}

// ---------------------------------------------------------------------
// Cloudflare R2 listing (WordPress uploads etc.)
//
// A big bucket (tens of thousands of keys) is listed fast by splitting the
// key space into folders (wp-content/uploads/<year>/<month>/ …) and listing
// those in parallel instead of paging through one giant flat listing.
// ---------------------------------------------------------------------
function escapeRegExp(v: string): string {
  return v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function runPool<T>(tasks: (() => Promise<T>)[], concurrency: number): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, async () => {
    while (next < tasks.length) {
      const idx = next++;
      await tasks[idx]();
    }
  });
  await Promise.all(workers);
}

function r2UrlFor(key: string): string {
  return `${SITE_URL}/media/${key.split('/').map(encodeURIComponent).join('/')}`;
}

async function listR2(): Promise<CacheEntry> {
  const client = getR2Client();
  const Bucket = process.env.R2_BUCKET_NAME as string;
  const items: MediaItem[] = [];
  let truncated = false;

  const pushObject = (key: string, size: number, modified: Date | undefined) => {
    if (!key || key.endsWith('/')) return;
    const name = key.slice(key.lastIndexOf('/') + 1);
    const slash = key.lastIndexOf('/');
    items.push({
      bucket: 'r2',
      path: key,
      name,
      folder: slash === -1 ? '' : key.slice(0, slash),
      url: r2UrlFor(key),
      type: typeOf(name, ''),
      size,
      mime: '',
      createdAt: modified ? modified.toISOString() : null,
      derived: isDerived(name),
    });
  };

  // Flat listing (no delimiter) of everything under a prefix.
  const flat = async (prefix: string) => {
    let token: string | undefined;
    do {
      if (items.length >= MAX_FILES_R2) {
        truncated = true;
        return;
      }
      const res = await client.send(
        new ListObjectsV2Command({ Bucket, Prefix: prefix, ContinuationToken: token, MaxKeys: 1000 })
      );
      for (const o of res.Contents || []) pushObject(o.Key || '', o.Size || 0, o.LastModified);
      token = res.IsTruncated ? res.NextContinuationToken : undefined;
    } while (token);
  };

  // Folder-by-folder listing for the first levels, flat below that.
  const walk = async (prefix: string, depth: number): Promise<void> => {
    if (depth >= 4) return flat(prefix);
    const subfolders: string[] = [];
    let token: string | undefined;
    do {
      const res = await client.send(
        new ListObjectsV2Command({ Bucket, Prefix: prefix, Delimiter: '/', ContinuationToken: token, MaxKeys: 1000 })
      );
      for (const o of res.Contents || []) pushObject(o.Key || '', o.Size || 0, o.LastModified);
      for (const cp of res.CommonPrefixes || []) {
        const p = cp.Prefix || '';
        // Skip folders that only mirror the Supabase buckets (already listed above).
        if (depth === 0 && R2_MIRROR_PREFIXES.has(p)) continue;
        if (p) subfolders.push(p);
      }
      token = res.IsTruncated ? res.NextContinuationToken : undefined;
    } while (token);
    await runPool(
      subfolders.map((f) => () => walk(f, depth + 1)),
      8
    );
  };

  await walk('', 0);
  if (items.length >= MAX_FILES_R2) truncated = true;

  // WordPress keeps small copies next to every original (photo-300x300.jpg).
  // Use the closest-to-300px one as the grid preview so the library doesn't
  // download multi-MB originals just to draw thumbnails.
  const thumbs = new Map<string, { w: number; url: string }>();
  for (const it of items) {
    const m = it.path.match(/^(.*)-(\d{2,4})x(\d{2,4})(\.[a-z0-9]+)$/i);
    if (!m || it.type !== 'image') continue;
    const base = `${m[1]}${m[4]}`;
    const w = parseInt(m[2], 10);
    const cur = thumbs.get(base);
    const score = (x: number) => Math.abs(x - 300);
    if (!cur || score(w) < score(cur.w)) thumbs.set(base, { w, url: it.url });
  }
  for (const it of items) {
    if (!it.derived) {
      const t = thumbs.get(it.path);
      if (t) it.thumb = t.url;
    }
  }

  return { at: Date.now(), items, truncated };
}

async function loadR2(refresh: boolean): Promise<CacheEntry> {
  const hit = cache.get('r2');
  if (!refresh && hit && Date.now() - hit.at < R2_CACHE_TTL_MS) return hit;
  const entry = await listR2();
  cache.set('r2', entry);
  return entry;
}

export async function GET(req: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sp = new URL(req.url).searchParams;
  const bucketParam = sp.get('bucket') || 'all';
  const typeParam = sp.get('type') || 'all';
  const q = (sp.get('q') || '').trim().toLowerCase();
  const sort = sp.get('sort') || 'newest';
  const showDerived = sp.get('derived') === '1';
  const refresh = sp.get('refresh') === '1';
  const perPage = Math.min(200, Math.max(12, parseInt(sp.get('perPage') || '48', 10) || 48));
  const page = Math.max(1, parseInt(sp.get('page') || '1', 10) || 1);

  const wantR2 = (bucketParam === 'all' || bucketParam === 'r2') && r2EnvPresent();
  const buckets = bucketParam === 'all' ? BUCKETS : BUCKETS.filter((b) => b === bucketParam);
  if (buckets.length === 0 && bucketParam !== 'r2') {
    return NextResponse.json({ error: 'Unknown bucket.' }, { status: 400 });
  }
  if (bucketParam === 'r2' && !wantR2) {
    return NextResponse.json(
      { error: 'Cloudflare R2 is not configured (R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET_NAME / R2_PUBLIC_URL).' },
      { status: 400 }
    );
  }

  try {
    // One source failing (e.g. R2 hiccup) must not blank the whole library.
    const sources: { label: string; run: () => Promise<CacheEntry> }[] = [
      ...buckets.map((b) => ({ label: BUCKET_NAMES[b], run: () => loadBucket(b, refresh) })),
      ...(wantR2 ? [{ label: 'WordPress uploads (R2)', run: () => loadR2(refresh) }] : []),
    ];
    const settled = await Promise.allSettled(sources.map((src) => src.run()));
    const warnings: string[] = [];
    const loaded: CacheEntry[] = [];
    settled.forEach((r, i) => {
      if (r.status === 'fulfilled') loaded.push(r.value);
      else {
        console.error(`[media-library] ${sources[i].label} failed:`, r.reason);
        warnings.push(`${sources[i].label}: ${r.reason instanceof Error ? r.reason.message : 'could not be loaded'}`);
      }
    });
    if (loaded.length === 0) {
      return NextResponse.json({ error: warnings.join(' · ') || 'Could not load media.' }, { status: 500 });
    }
    const truncated = loaded.some((l) => l.truncated);
    let items = loaded.flatMap((l) => l.items);

    if (!showDerived) items = items.filter((i) => !i.derived);

    // Counts reflect the bucket + search scope, before the type filter, so the
    // "All / Images / Videos" tabs can show live numbers.
    const searchTerms = q.split(/\s+/).filter(Boolean);
    const scoped = searchTerms.length
      ? items.filter((i) => {
          const hay = `${i.name} ${i.path} ${i.bucket}`.toLowerCase();
          return searchTerms.every((t) => hay.includes(t));
        })
      : items;

    const counts = {
      all: scoped.length,
      image: scoped.filter((i) => i.type === 'image').length,
      video: scoped.filter((i) => i.type === 'video').length,
      other: scoped.filter((i) => i.type === 'other').length,
      totalBytes: scoped.reduce((s, i) => s + i.size, 0),
    };

    let filtered = typeParam === 'all' ? scoped : scoped.filter((i) => i.type === typeParam);

    filtered = [...filtered].sort((a, b) => {
      switch (sort) {
        case 'oldest':
          return (a.createdAt || '').localeCompare(b.createdAt || '');
        case 'name':
          return a.name.localeCompare(b.name);
        case 'size':
          return b.size - a.size;
        default:
          return (b.createdAt || '').localeCompare(a.createdAt || '');
      }
    });

    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / perPage));
    const safePage = Math.min(page, totalPages);
    const pageItems = filtered.slice((safePage - 1) * perPage, safePage * perPage);

    return NextResponse.json({
      items: pageItems,
      total,
      page: safePage,
      perPage,
      totalPages,
      counts,
      truncated,
      warnings,
    });
  } catch (err) {
    console.error('[media-library] list error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Could not load media.' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { bucket?: string; path?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // WordPress library files live only in R2: delete the file plus its
  // WordPress-generated copies (photo-300x300.jpg …) from R2 only.
  if (body.bucket === 'r2') {
    const key = (body.path || '').trim();
    if (!r2EnvPresent() || !key || key.includes('..') || R2_MIRROR_PREFIXES.has(key.split('/')[0] + '/')) {
      return NextResponse.json({ error: 'Invalid path.' }, { status: 400 });
    }
    try {
      const client = getR2Client();
      const Bucket = process.env.R2_BUCKET_NAME as string;
      const keys = new Set<string>([key]);
      const m = key.match(/^(.*)(\.[a-z0-9]+)$/i);
      if (m) {
        const sizeRe = new RegExp('^' + escapeRegExp(m[1]) + '-\\d{2,4}x\\d{2,4}' + escapeRegExp(m[2]) + '$', 'i');
        let token: string | undefined;
        do {
          const res = await client.send(
            new ListObjectsV2Command({ Bucket, Prefix: `${m[1]}-`, ContinuationToken: token, MaxKeys: 1000 })
          );
          for (const o of res.Contents || []) if (o.Key && sizeRe.test(o.Key)) keys.add(o.Key);
          token = res.IsTruncated ? res.NextContinuationToken : undefined;
        } while (token);
      }
      await Promise.all(Array.from(keys).map((k) => client.send(new DeleteObjectCommand({ Bucket, Key: k }))));
      cache.delete('r2');
      return NextResponse.json({ ok: true, removed: keys.size });
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : 'Delete failed.' }, { status: 500 });
    }
  }

  const bucket = body.bucket as StorageBucket;
  const path = (body.path || '').trim();
  if (!BUCKETS.includes(bucket) || !path || path.includes('..')) {
    return NextResponse.json({ error: 'Invalid bucket or path.' }, { status: 400 });
  }

  // Build the list of files to remove: the file itself + its resized siblings.
  const targets = new Set<string>([path]);
  if (/\.(webp|avif|jpe?g|png)$/i.test(path)) {
    const base = baseOf(path);
    for (const suffix of ['', '-sm', '-md']) {
      for (const ext of ['webp', 'avif']) targets.add(`${base}${suffix}.${ext}`);
    }
  }

  try {
    await Promise.all(Array.from(targets).map((p) => deleteFromStorage({ bucket, path: p })));
    cache.delete(bucket);
    return NextResponse.json({ ok: true, removed: targets.size });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Delete failed.' },
      { status: 500 }
    );
  }
}
