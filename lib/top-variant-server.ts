/**
 * Server-only helper: for every product that has more than one colour with
 * recorded shopper activity, work out which colour is actually performing
 * best -- ranked exactly like Admin > Analytics > Product Performance:
 * Purchase > Begin checkout > Add to cart > Impressions (strict priority,
 * not a weighted score).
 *
 * Used to swap a product card's default photo/link for its best-performing
 * colour's photo/link on:
 *  - /shop and /category/[slug] (server-rendered initial data)
 *  - "You may also like" / "Recently viewed" (via /api/top-variants, since
 *    those render client-side)
 *
 * Reads `orders` with the service-role client because anon/RLS cannot read
 * `orders` at all (see supabase/migrations/20260827000000_lock_orders_order_items_pii.sql)
 * -- this file must stay server-only and must never be imported from a
 * Client Component. Only aggregated, non-PII data (productId, colour,
 * image, slug) ever leaves this function.
 */

import { getSupabaseAdmin } from './supabase-admin';

export interface TopVariantInfo {
  color: string;
  image: string | null;
  slug: string | null;
}

const EXCLUDED_ORDER_STATUSES = ['cancelled', 'failed'];

export async function fetchTopVariantMapServer(days = 30): Promise<Map<string, TopVariantInfo>> {
  try {
    const supabase = getSupabaseAdmin();
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const [eventsRes, ordersRes, variantsRes, productsRes] = await Promise.all([
      supabase
        .from('activity_events')
        .select('product_id, event_type, metadata')
        .in('event_type', ['product_view', 'add_to_cart', 'checkout_start'])
        .gte('created_at', since)
        .not('product_id', 'is', null),
      supabase
        .from('orders')
        .select('items, status, created_at')
        .gte('created_at', since),
      supabase.from('product_variants').select('product_id, color, images, slug'),
      supabase.from('products').select('id, slug, images, colors'),
    ]);

    if (eventsRes.error) throw eventsRes.error;
    if (ordersRes.error) throw ordersRes.error;
    if (variantsRes.error) throw variantsRes.error;
    if (productsRes.error) throw productsRes.error;

    type ColorStats = { color: string; impressions: number; addToCart: number; beginCheckout: number; purchases: number };
    const byProduct = new Map<string, Map<string, ColorStats>>();

    const bump = (
      productId: string | null | undefined,
      color: string | null | undefined,
      field: 'impressions' | 'addToCart' | 'beginCheckout' | 'purchases'
    ) => {
      if (!productId || !color) return;
      const byColor = byProduct.get(productId) ?? new Map<string, ColorStats>();
      const entry = byColor.get(color) ?? { color, impressions: 0, addToCart: 0, beginCheckout: 0, purchases: 0 };
      entry[field] += 1;
      byColor.set(color, entry);
      byProduct.set(productId, byColor);
    };

    for (const ev of eventsRes.data ?? []) {
      const color = typeof (ev as any).metadata?.color === 'string' ? (ev as any).metadata.color : null;
      if (ev.event_type === 'product_view') bump(ev.product_id, color, 'impressions');
      else if (ev.event_type === 'add_to_cart') bump(ev.product_id, color, 'addToCart');
      else if (ev.event_type === 'checkout_start') bump(ev.product_id, color, 'beginCheckout');
    }

    for (const o of ordersRes.data ?? []) {
      if (EXCLUDED_ORDER_STATUSES.includes((o as any).status)) continue;
      const items = Array.isArray((o as any).items) ? (o as any).items : [];
      const seen = new Set<string>();
      for (const it of items) {
        if (!it.product_id || seen.has(it.product_id)) continue;
        seen.add(it.product_id);
        bump(it.product_id, it.color ?? null, 'purchases');
      }
    }

    const variantLookup = new Map<string, Map<string, { image: string | null; slug: string }>>();
    for (const v of variantsRes.data ?? []) {
      if (!v.product_id || !v.color) continue;
      const byColor = variantLookup.get(v.product_id) ?? new Map();
      byColor.set(v.color, { image: v.images?.[0] ?? null, slug: v.slug });
      variantLookup.set(v.product_id, byColor);
    }
    const productLookup = new Map((productsRes.data ?? []).map((p) => [p.id, p]));

    const result = new Map<string, TopVariantInfo>();
    for (const [productId, byColor] of Array.from(byProduct.entries())) {
      if (byColor.size < 2) continue; // nothing to override on a single-colour product
      const ranked = Array.from(byColor.values()).sort(
        (a, b) =>
          b.purchases - a.purchases ||
          b.beginCheckout - a.beginCheckout ||
          b.addToCart - a.addToCart ||
          b.impressions - a.impressions
      );
      const best = ranked[0];
      const product = productLookup.get(productId);
      const isBaseColor = (product?.colors ?? [])[0] === best.color;
      const variantMatch = variantLookup.get(productId)?.get(best.color) ?? null;
      const image = variantMatch?.image ?? (isBaseColor ? product?.images?.[0] ?? null : null);
      const slug = variantMatch?.slug ?? (isBaseColor ? product?.slug ?? null : null);
      // Only worth overriding the card if we can actually resolve a
      // different photo/link for that colour.
      if (!slug) continue;
      result.set(productId, { color: best.color, image, slug });
    }

    return result;
  } catch (err) {
    console.error('[fetchTopVariantMapServer] error', err);
    return new Map();
  }
}

/** JSON-friendly shape for the /api/top-variants route and client fetches. */
export type TopVariantMapJSON = Record<string, TopVariantInfo>;

export function toJSON(map: Map<string, TopVariantInfo>): TopVariantMapJSON {
  return Object.fromEntries(map.entries());
}
