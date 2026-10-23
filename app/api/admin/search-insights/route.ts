import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAdminToken, ADMIN_SESSION_COOKIE } from '@/lib/admin-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

const DEFAULT_RANGE_DAYS = 30;
const MAX_RANGE_DAYS = 365;
const MAX_EVENT_ROWS = 20000; // safety cap so one huge range can't blow up the function

/**
 * Admin > Analytics > Search. Reads the 'search' rows logged by
 * lib/track-api.ts (fired from app/shop/shop-content.tsx on every distinct
 * search a shopper runs, on both /search and /shop) and aggregates them in
 * memory -- same approach app/api/admin/analytics/route.ts already uses for
 * top products, rather than a SQL GROUP BY through PostgREST.
 *
 * Returns:
 *   topSearches   -- every distinct query, ranked by how often it was
 *                     searched, with how many times it returned zero
 *                     results.
 *   noResultSearches -- the subset of topSearches where EVERY occurrence
 *                     of that query returned 0 products, sorted by count.
 *                     This is the actionable list: things shoppers are
 *                     typing that the catalog currently can't answer --
 *                     usually fixed by tagging more products (colour,
 *                     occasion, fabric) or adding a missing product.
 *   totalSearches, totalNoResultSearches, rangeDays
 */
export async function GET(req: Request) {
  const cookie = cookies().get(ADMIN_SESSION_COOKIE)?.value ?? null;
  const verified = await verifyAdminToken(cookie);
  if (!verified.valid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const requestedDays = Number(url.searchParams.get('days'));
  const rangeDays =
    Number.isFinite(requestedDays) && requestedDays > 0
      ? Math.min(MAX_RANGE_DAYS, Math.round(requestedDays))
      : DEFAULT_RANGE_DAYS;

  const since = new Date();
  since.setUTCDate(since.getUTCDate() - rangeDays);

  try {
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from('activity_events')
      .select('metadata, page_path, created_at')
      .eq('event_type', 'search')
      .gte('created_at', since.toISOString())
      .order('created_at', { ascending: false })
      .limit(MAX_EVENT_ROWS);

    if (error) throw error;

    const events = data ?? [];

    const agg = new Map<
      string,
      { query: string; count: number; noResultCount: number; lastSearchedAt: string }
    >();

    for (const e of events) {
      const rawQuery = typeof e.metadata?.query === 'string' ? e.metadata.query.trim() : '';
      if (!rawQuery) continue;
      const key = rawQuery.toLowerCase();
      const resultsCount = Number(e.metadata?.resultsCount ?? 0);

      const existing = agg.get(key) || {
        query: rawQuery,
        count: 0,
        noResultCount: 0,
        lastSearchedAt: e.created_at,
      };
      existing.count += 1;
      if (resultsCount === 0) existing.noResultCount += 1;
      // Rows arrive newest-first (order above), so the first one seen per
      // key is already the most recent -- keep it instead of overwriting.
      agg.set(key, existing);
    }

    const all = Array.from(agg.values());
    const topSearches = [...all].sort((a, b) => b.count - a.count).slice(0, 100);
    const noResultSearches = all
      .filter((s) => s.noResultCount === s.count) // every time it was searched, it found nothing
      .sort((a, b) => b.noResultCount - a.noResultCount)
      .slice(0, 100);

    return NextResponse.json({
      topSearches,
      noResultSearches,
      totalSearches: events.length,
      totalDistinctQueries: all.length,
      rangeDays,
    });
  } catch (err) {
    console.error('[admin/search-insights] failed:', err);
    return NextResponse.json({ error: 'Failed to load search insights' }, { status: 500 });
  }
}
