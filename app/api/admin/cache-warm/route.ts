import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-fulfillment-shared';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

// -----------------------------------------------------------------------
// Cloudflare cache warmer — CLIENT-DRIVEN BATCH DESIGN
//
// Why not a single "start and forget" background job: Vercel serverless
// functions are NOT guaranteed to keep running after the HTTP response is
// sent (no `waitUntil`/background-task support assumed here, since this
// needs to work reliably on the Hobby/free plan too). A fire-and-forget
// async call after `return` can get frozen or killed mid-run with no
// error, silently warming only part of the catalog.
//
// Instead: the browser calls `?action=step` repeatedly (every ~250ms)
// and each call processes one small batch (BATCH_SIZE URLs) and returns
// immediately. Each request is short (well under any function duration
// limit) and only consumes CPU while the admin is actively watching the
// progress bar — nothing runs unattended, so there's no surprise CPU
// usage on the Vercel bill.
//
// State is stored in the `settings` table so progress survives page
// refreshes and multiple admins don't stomp on each other's runs.
// -----------------------------------------------------------------------

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.aruhihandlooms.com').replace(/\/$/, '');
const BATCH_SIZE = 8; // small on purpose — keeps each request fast & safe under free-tier duration limits

type WarmStatus = {
  state: 'idle' | 'running' | 'done' | 'error';
  total: number;
  offset: number;
  cached: number;
  failed: number;
  cf_hit: number;
  cf_miss: number;
  cf_other: number;
  cf_unknown: number;
  sample_non_hit_urls: string[];
  failed_urls: string[]; // every URL that failed (up to a cap), with reason
  started_at: string | null;
  finished_at: string | null;
  error?: string;
};

type VerifyStatus = {
  state: 'idle' | 'running' | 'done' | 'error';
  total: number;
  offset: number;
  cf_hit: number;
  cf_miss: number;
  cf_other: number;
  cf_unknown: number;
  sample_non_hit_urls: string[];
  started_at: string | null;
  finished_at: string | null;
  error?: string;
};

type StoredUrlList = { urls: string[]; collected_at: string };

function emptyWarmStatus(): WarmStatus {
  return {
    state: 'idle', total: 0, offset: 0, cached: 0, failed: 0,
    cf_hit: 0, cf_miss: 0, cf_other: 0, cf_unknown: 0,
    sample_non_hit_urls: [], failed_urls: [], started_at: null, finished_at: null,
  };
}

function emptyVerifyStatus(): VerifyStatus {
  return {
    state: 'idle', total: 0, offset: 0,
    cf_hit: 0, cf_miss: 0, cf_other: 0, cf_unknown: 0,
    sample_non_hit_urls: [], started_at: null, finished_at: null,
  };
}

async function getSetting<T>(admin: ReturnType<typeof getSupabaseAdmin>, key: string, fallback: T): Promise<T> {
  const { data } = await admin.from('settings').select('value').eq('key', key).single();
  if (!data?.value) return fallback;
  return { ...fallback, ...(data.value as object) } as T;
}

async function saveSetting(admin: ReturnType<typeof getSupabaseAdmin>, key: string, value: unknown) {
  await admin.from('settings').upsert({ key, value }, { onConflict: 'key' });
}

const getWarmStatus = (admin: ReturnType<typeof getSupabaseAdmin>) =>
  getSetting(admin, 'cache_warm_status', emptyWarmStatus());
const saveWarmStatus = (admin: ReturnType<typeof getSupabaseAdmin>, s: WarmStatus) =>
  saveSetting(admin, 'cache_warm_status', s);

const getVerifyStatus = (admin: ReturnType<typeof getSupabaseAdmin>) =>
  getSetting(admin, 'cache_verify_status', emptyVerifyStatus());
const saveVerifyStatus = (admin: ReturnType<typeof getSupabaseAdmin>, s: VerifyStatus) =>
  saveSetting(admin, 'cache_verify_status', s);

async function getUrlList(admin: ReturnType<typeof getSupabaseAdmin>): Promise<StoredUrlList | null> {
  const { data } = await admin.from('settings').select('value').eq('key', 'cache_warm_url_list').single();
  return (data?.value as StoredUrlList) ?? null;
}
const saveUrlList = (admin: ReturnType<typeof getSupabaseAdmin>, urls: string[]) =>
  saveSetting(admin, 'cache_warm_url_list', { urls, collected_at: new Date().toISOString() } as StoredUrlList);

// -----------------------------------------------------------------------
// Collect every product/variant image + video URL, converted to the
// /media/ proxy path (which itself redirects or streams to Supabase/R2 —
// either way, fetch() follows redirects by default, so warming this URL
// warms whatever the real, final resource turns out to be).
// -----------------------------------------------------------------------
async function collectMediaUrls(admin: ReturnType<typeof getSupabaseAdmin>): Promise<string[]> {
  const urls = new Set<string>();
  const SUPABASE_PUBLIC_MARKER = '/storage/v1/object/public/';

  function toMediaPath(url: string | null | undefined): string | null {
    if (!url) return null;
    if (url.includes('/media/')) {
      const idx = url.indexOf('/media/');
      return `${SITE_URL}${url.slice(idx)}`;
    }
    const idx = url.indexOf(SUPABASE_PUBLIC_MARKER);
    if (idx !== -1) {
      const path = url.slice(idx + SUPABASE_PUBLIC_MARKER.length);
      return `${SITE_URL}/media/${path}`;
    }
    const r2Base = (process.env.R2_PUBLIC_URL || '').replace(/\/$/, '');
    if (r2Base && url.startsWith(r2Base + '/')) {
      const path = url.slice(r2Base.length + 1);
      return `${SITE_URL}/media/${path}`;
    }
    return null; // external placeholder (Pexels etc) — skip
  }

  let offset = 0;
  while (true) {
    const { data: products } = await admin.from('products').select('images, video_url').range(offset, offset + 199);
    if (!products || products.length === 0) break;
    for (const p of products) {
      for (const img of (p.images as string[] | null) ?? []) {
        const u = toMediaPath(img);
        if (u) urls.add(u);
      }
      const v = toMediaPath(p.video_url as string | null);
      if (v) urls.add(v);
    }
    offset += 200;
    if (products.length < 200) break;
  }

  offset = 0;
  while (true) {
    const { data: variants } = await admin.from('product_variants').select('images').range(offset, offset + 499);
    if (!variants || variants.length === 0) break;
    for (const v of variants) {
      for (const img of (v.images as string[] | null) ?? []) {
        const u = toMediaPath(img);
        if (u) urls.add(u);
      }
    }
    offset += 500;
    if (variants.length < 500) break;
  }

  return Array.from(urls);
}

// -----------------------------------------------------------------------
// Fetch one batch, reading the REAL CF-Cache-Status header off the final
// response (fetch follows redirects by default, so if /media/ 307s to
// cdn.aruhihandlooms.com, the header we read is from that final hop —
// exactly what a real browser would see).
// -----------------------------------------------------------------------
type UrlOutcome = { url: string; ok: boolean; cfStatus: string | null; reason: string };

async function fetchBatch(urls: string[]): Promise<UrlOutcome[]> {
  const results = await Promise.allSettled(
    urls.map(async (url) => {
      try {
        const res = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(12_000) });
        const ok = res.ok || res.status === 206;
        return {
          url,
          ok,
          cfStatus: res.headers.get('cf-cache-status'),
          reason: ok ? '' : `HTTP ${res.status}`,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'fetch failed';
        const reason = msg.toLowerCase().includes('timeout') || msg.toLowerCase().includes('abort')
          ? 'timeout (12s)'
          : msg;
        return { url, ok: false, cfStatus: null, reason };
      }
    })
  );
  return results.map((r, i) =>
    r.status === 'fulfilled' ? r.value : { url: urls[i], ok: false, cfStatus: null, reason: 'request rejected' }
  );
}

function classifyCfStatus(cfStatus: string | null): 'hit' | 'miss' | 'other' | 'unknown' {
  if (!cfStatus) return 'unknown';
  const s = cfStatus.toUpperCase();
  if (s === 'HIT') return 'hit';
  if (s === 'MISS' || s === 'EXPIRED' || s === 'UPDATING' || s === 'STALE') return 'miss';
  return 'other'; // DYNAMIC, BYPASS, NONE, REVALIDATED
}

function applyOutcomes(
  outcomes: UrlOutcome[],
  bucket: { cf_hit: number; cf_miss: number; cf_other: number; cf_unknown: number; sample_non_hit_urls: string[] }
) {
  for (const o of outcomes) {
    const kind = classifyCfStatus(o.cfStatus);
    if (kind === 'hit') bucket.cf_hit++;
    else if (kind === 'miss') bucket.cf_miss++;
    else if (kind === 'other') bucket.cf_other++;
    else bucket.cf_unknown++;
    if (kind !== 'hit' && bucket.sample_non_hit_urls.length < 8) {
      bucket.sample_non_hit_urls.push(`${o.url} [${o.cfStatus ?? 'no-header'}]`);
    }
  }
}

// -----------------------------------------------------------------------
// Route handler
// -----------------------------------------------------------------------
export async function GET(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const action = req.nextUrl.searchParams.get('action') ?? 'status';
  const admin = getSupabaseAdmin();

  if (action === 'status') {
    const [warm, verify] = await Promise.all([getWarmStatus(admin), getVerifyStatus(admin)]);
    return NextResponse.json({ warm, verify });
  }

  if (action === 'reset') {
    await Promise.all([saveWarmStatus(admin, emptyWarmStatus()), saveVerifyStatus(admin, emptyVerifyStatus())]);
    return NextResponse.json({ reset: true });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}

export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const action = req.nextUrl.searchParams.get('action');
  const admin = getSupabaseAdmin();

  // --- Warm: collect URL list + reset progress, one shot (fast: just DB reads) ---
  if (action === 'start') {
    const current = await getWarmStatus(admin);
    if (current.state === 'running') {
      return NextResponse.json({ error: 'Already running', status: current }, { status: 409 });
    }
    const urls = await collectMediaUrls(admin);
    await saveUrlList(admin, urls);
    const status: WarmStatus = {
      ...emptyWarmStatus(),
      state: urls.length > 0 ? 'running' : 'done',
      total: urls.length,
      started_at: new Date().toISOString(),
      finished_at: urls.length > 0 ? null : new Date().toISOString(),
    };
    await saveWarmStatus(admin, status);
    return NextResponse.json(status);
  }

  // --- Warm: process next BATCH_SIZE urls. Client calls this in a loop. ---
  if (action === 'step') {
    const [status, list] = await Promise.all([getWarmStatus(admin), getUrlList(admin)]);
    if (status.state !== 'running' || !list) {
      return NextResponse.json(status);
    }
    const batch = list.urls.slice(status.offset, status.offset + BATCH_SIZE);
    if (batch.length === 0) {
      status.state = 'done';
      status.finished_at = new Date().toISOString();
      await saveWarmStatus(admin, status);
      return NextResponse.json(status);
    }

    const outcomes = await fetchBatch(batch);
    for (const o of outcomes) {
      if (o.ok) {
        status.cached++;
      } else {
        status.failed++;
        if (status.failed_urls.length < 50) {
          status.failed_urls.push(`${o.url} — ${o.reason}`);
        }
      }
    }
    applyOutcomes(outcomes, status);
    status.offset += batch.length;

    if (status.offset >= status.total) {
      status.state = 'done';
      status.finished_at = new Date().toISOString();
    }

    await saveWarmStatus(admin, status);
    return NextResponse.json(status);
  }

  // --- Verify: reset verify progress, reusing the last-collected URL list ---
  if (action === 'verify-start') {
    const list = await getUrlList(admin);
    if (!list || list.urls.length === 0) {
      return NextResponse.json({ error: 'No URL list found — run a cache warm first.' }, { status: 400 });
    }
    const status: VerifyStatus = {
      ...emptyVerifyStatus(),
      state: 'running',
      total: list.urls.length,
      started_at: new Date().toISOString(),
    };
    await saveVerifyStatus(admin, status);
    return NextResponse.json(status);
  }

  // --- Verify: process next batch ---
  if (action === 'verify-step') {
    const [status, list] = await Promise.all([getVerifyStatus(admin), getUrlList(admin)]);
    if (status.state !== 'running' || !list) {
      return NextResponse.json(status);
    }
    const batch = list.urls.slice(status.offset, status.offset + BATCH_SIZE);
    if (batch.length === 0) {
      status.state = 'done';
      status.finished_at = new Date().toISOString();
      await saveVerifyStatus(admin, status);
      return NextResponse.json(status);
    }

    const outcomes = await fetchBatch(batch);
    applyOutcomes(outcomes, status);
    status.offset += batch.length;

    if (status.offset >= status.total) {
      status.state = 'done';
      status.finished_at = new Date().toISOString();
    }

    await saveVerifyStatus(admin, status);
    return NextResponse.json(status);
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
