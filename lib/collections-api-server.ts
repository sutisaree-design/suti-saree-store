import { getSupabaseAdmin } from './supabase-admin';

/** A collection tile for the public storefront (homepage "Shop by
 *  Collection" row) — only ever contains active collections that have
 *  at least one live product in them, each with a thumbnail pulled from
 *  that product. */
export interface PublicCollectionRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  product_count: number;
  thumbnail: string | null;
}

/**
 * Server-only version of the query behind GET /api/collections — pulled out
 * so it can be reused directly from a server component (e.g. the homepage's
 * combined data fetch in lib/home-data-server.ts) without going through an
 * extra internal HTTP round-trip. The route itself now just calls this too,
 * so any existing client-side caller of /api/collections keeps working
 * unchanged.
 *
 * Public, unauthenticated — every active collection with ≥1 live product.
 * Safe to call from the homepage for any visitor.
 */
export async function fetchPublicCollectionsServer(): Promise<PublicCollectionRow[]> {
  const admin = getSupabaseAdmin();

  const { data: collections, error } = await admin
    .from('collections')
    .select('id, name, slug, description, is_active, created_at')
    .eq('is_active', true)
    .eq('show_on_homepage', true)
    .order('created_at', { ascending: false });
  if (error) throw error;

  if (!collections || collections.length === 0) {
    return [];
  }

  const { data: links, error: linksErr } = await admin
    .from('collection_products')
    .select('collection_id, product_id, position')
    .in('collection_id', collections.map((c) => c.id))
    .order('position', { ascending: true });
  if (linksErr) throw linksErr;

  const productIdsByCollection = new Map<string, string[]>();
  const allProductIds = new Set<string>();
  for (const link of links ?? []) {
    const list = productIdsByCollection.get(link.collection_id) ?? [];
    list.push(link.product_id);
    productIdsByCollection.set(link.collection_id, list);
    allProductIds.add(link.product_id);
  }

  // Only keep products that are actually live — a collection whose
  // products have all since been unpublished should behave the same
  // as an empty collection (i.e. hidden), not show a broken tile.
  const liveImageByProduct = new Map<string, string | undefined>();
  if (allProductIds.size > 0) {
    const { data: liveProducts, error: productsErr } = await admin
      .from('products')
      .select('id, images')
      .in('id', Array.from(allProductIds))
      .eq('approval_status', 'live');
    if (productsErr) throw productsErr;
    for (const p of liveProducts ?? []) {
      liveImageByProduct.set(p.id, (p.images ?? [])[0]);
    }
  }

  return collections
    .map((c) => {
      const productIds = productIdsByCollection.get(c.id) ?? [];
      const liveProductIds = productIds.filter((id) => liveImageByProduct.has(id));
      const thumbnail = liveProductIds.map((id) => liveImageByProduct.get(id)).find(Boolean);
      return {
        id: c.id,
        name: c.name,
        slug: c.slug,
        description: c.description,
        product_count: liveProductIds.length,
        thumbnail: thumbnail ?? null,
      };
    })
    // Never show a collection with zero live products on the storefront.
    .filter((c) => c.product_count > 0);
}
