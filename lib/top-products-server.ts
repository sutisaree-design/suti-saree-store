import { getSupabaseAdmin } from '@/lib/supabase-admin';

/**
 * Slugs of the most-viewed LIVE products (last 30 days), most-viewed first.
 *
 * Used by app/product/[slug]/page.tsx -> generateStaticParams() so these
 * pages are pre-rendered at build time. Every deploy starts with an empty
 * ISR cache, so without this the first visitor to each hot product pays a
 * cold render (a Vercel function run + Supabase queries) right after every
 * push. With it, the busiest products are already cached the moment the
 * deploy goes live; everything else is still cached on its first visit.
 *
 * "Views" = `product_view` rows in activity_events (the same signal behind
 * Admin > Analytics > Impressions and the shop's Popularity sort).
 *
 * Never throws: on ANY failure it returns [] so a Supabase hiccup during a
 * build just means "pre-render nothing" instead of a failed deploy.
 */
const PAGE_SIZE = 1000; // Supabase/PostgREST returns at most 1000 rows per request
const MAX_PAGES = 20; // reads at most the 20k most recent view events

export async function fetchTopProductSlugsServer(limit: number): Promise<string[]> {
  if (!Number.isFinite(limit) || limit <= 0) return [];
  try {
    const supabase = getSupabaseAdmin();
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const views = new Map<string, number>();
    for (let page = 0; page < MAX_PAGES; page++) {
      const from = page * PAGE_SIZE;
      const { data, error } = await supabase
        .from('activity_events')
        .select('product_id')
        .eq('event_type', 'product_view')
        .gte('created_at', since)
        .not('product_id', 'is', null)
        .order('created_at', { ascending: false })
        .range(from, from + PAGE_SIZE - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;
      for (const row of data) {
        if (row.product_id) views.set(row.product_id, (views.get(row.product_id) ?? 0) + 1);
      }
      if (data.length < PAGE_SIZE) break;
    }
    if (views.size === 0) return [];

    // Take extra candidates: some may be deleted / not live any more.
    const rankedIds = Array.from(views.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit * 2)
      .map(([id]) => id);

    const { data: products, error: prodErr } = await supabase
      .from('products')
      .select('id, slug')
      .in('id', rankedIds)
      .eq('approval_status', 'live');
    if (prodErr || !products) return [];

    const slugById = new Map<string, string>(products.map((p: any) => [p.id, p.slug]));
    const slugs: string[] = [];
    for (const id of rankedIds) {
      const slug = slugById.get(id);
      if (slug) slugs.push(slug);
      if (slugs.length >= limit) break;
    }
    return slugs;
  } catch (err) {
    console.error('[fetchTopProductSlugsServer] failed, pre-rendering nothing:', err);
    return [];
  }
}
