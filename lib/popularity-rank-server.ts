/**
 * Server-side utility to fetch popularity rankings
 * This allows us to pass the initial popularity data from the server
 * to the client, so the first page paint shows products in the right order.
 *
 * Ranking rule (strict priority, not a weighted score): a product with more
 * Impressions (product_view) always outranks a product with fewer
 * impressions, no matter how many purchases/checkouts/add-to-carts the other
 * one has -- i.e. the shop page's default "Popularity" order mirrors the
 * Impressions column in Admin > Analytics > Product Performance. Ties within
 * the same impression count are broken by Purchase, then Begin checkout,
 * then Add to cart.
 */

import { getSupabaseAdmin } from '@/lib/supabase-admin';

interface ProductActivityCounts {
  purchase: number;
  checkout_start: number;
  add_to_cart: number;
  product_view: number;
}

export async function fetchPopularityRankServer(): Promise<Map<string, number>> {
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

    // Tally each funnel stage separately per product instead of collapsing
    // them into one weighted number.
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

    // Sort by strict priority: Impressions (product_view) first, then
    // Purchase, then Begin checkout, then Add to cart -- each tier only ever
    // breaks ties in the tier above it, it never outweighs it.
    const ranked = Array.from(counts.entries())
      .sort(
        ([, a], [, b]) =>
          b.product_view - a.product_view ||
          b.purchase - a.purchase ||
          b.checkout_start - a.checkout_start ||
          b.add_to_cart - a.add_to_cart
      )
      .map(([id]) => id);

    // Return as Map<productId, rankIndex>
    return new Map(ranked.map((id, i) => [id, i]));
  } catch (err) {
    console.error('[fetchPopularityRankServer] error', err);
    return new Map();
  }
}
