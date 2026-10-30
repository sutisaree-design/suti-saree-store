import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-fulfillment-shared';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { canonicalMediaUrl, deleteFromStorage, type StorageBucket } from '@/lib/storage';

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

const BUCKETS: StorageBucket[] = ['product-images', 'product-videos', 'review-images', 'support-attachments'];

const IMAGE_EXT = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif', 'heic', 'heif', 'svg']);
const VIDEO_EXT = new Set(['mp4', 'm4v', 'mov', 'webm', 'ogv']);

const MAX_FILES_PER_BUCKET = 20000;
const CACHE_TTL_MS = 60_000;

export interface MediaItem {
  bucket: StorageBucket;
  path: string;
  name: string;
  folder: string;
  url: string;
  type: 'image' | 'video' | 'other';
  size: number;
  mime: string;
  createdAt: string | null;
  derived: boolean;
}

type CacheEntry = { at: number; items: MediaItem[]; truncated: boolean };
const cache = new Map<StorageBucket, CacheEntry>();

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
  return /-(sm|md)\.[a-z0-9]+$/i.test(name);
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

  const buckets = bucketParam === 'all' ? BUCKETS : BUCKETS.filter((b) => b === bucketParam);
  if (buckets.length === 0) {
    return NextResponse.json({ error: 'Unknown bucket.' }, { status: 400 });
  }

  try {
    const loaded = await Promise.all(buckets.map((b) => loadBucket(b, refresh)));
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
