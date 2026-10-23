import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

/**
 * GET /api/products/popularity
 *
 * Returns product IDs ranked by strict funnel-stage priority over the last
 * 30 days -- NOT a weighted score. A product with more Impressions always
 * outranks a product with fewer impressions, no matter how many
 * purchases/checkouts/add-to-carts the other one has:
 *
 *   1. Impressions       (product_view — most views always wins)
 *   2. Purchase          (tie-break within the same impression count)
 *   3. Begin checkout    (tie-break within the same impression+purchase count)
 *   4. Add to cart       (final tie-break)
 *
 * Response: { ranked: string[] }  — product_id strings, highest priority first.
 * Products with zero events are not included; callers append them at the end.
 *
 * Cached for 10 minutes so the aggregation query doesn't run on every
 * page load. Mirrors lib/popularity-rank-server.ts (used for the initial
 * server-rendered order) -- this route exists so the client can silently
 * refresh that order every 10 minutes without a full page reload.
 */
export const revalidate = 600; // 10 minutes

interface ProductActivityCounts {
  purchase: number;
  checkout_start: number;
  add_to_cart: number;
  product_view: number;
}

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();

    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    // Fetch all relevant events in one query
    const { data, error } = await supabase
      .from('activity_events')
      .select('product_id, event_type')
      .in('event_type', ['purchase', 'checkout_start', 'add_to_cart', 'product_view'])
      .gte('created_at', since)
      .not('product_id', 'is', null);

    if (error) throw error;

    const counts = new Map<string, ProductActivityCounts>();
    for (const row of data ?? []) {
      if (!row.product_id) continue;
      const entry = counts.get(row.product_id) ?? {
        purchase: 0,
        checkout_start: 0,
        add_to_cart: 0,
        product_view: 0,
      };
      if (row.event_type in entry) {
        entry[row.event_type as keyof ProductActivityCounts] += 1;
      }
      counts.set(row.product_id, entry);
    }

    const ranked = Array.from(counts.entries())
      .sort(
        ([, a], [, b]) =>
          b.product_view - a.product_view ||
          b.purchase - a.purchase ||
          b.checkout_start - a.checkout_start ||
          b.add_to_cart - a.add_to_cart
      )
      .map(([id]) => id);

    return NextResponse.json({ ranked });
  } catch (err) {
    console.error('[popularity] error', err);
    return NextResponse.json({ ranked: [] });
  }
}
