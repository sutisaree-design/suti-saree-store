import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

// This route has no cookies()/headers()/searchParams usage, so Next's App
// Router would otherwise treat it as a static route and cache its response
// in the full Route Cache (served from that cache indefinitely, not just
// briefly) -- meaning a shopper's browser keeps getting whatever the
// response was the first time this route was ever hit after a deploy,
// even after an admin removes a product from a promotion's collection or
// flips a promotion off. That's exactly backwards for something that (a)
// gates a live discount and (b) already has its own starts_at/ends_at
// time window logic below, which requires "now" to be genuinely live on
// every request. force-dynamic bypasses that cache so every request re-
// queries Supabase, same as the admin routes get automatically from their
// cookies() call in requireAdmin().
export const dynamic = 'force-dynamic';

// GET — public, unauthenticated. Returns every currently-active BOGO
// promotion (is_active = true and within its start/end window), each with
// a resolved `product_ids` array and `collection_slug` when scope = 'collection'.
//
// This has to go through the service-role client (not a direct client-side
// supabase.from() call) because `collection_products` has no RLS policy for
// `anon` — same reason /api/collection/[slug] resolves collection membership
// server-side instead of letting the browser query it directly. The cart
// (lib/cart-context.tsx) calls this route via fetchActivePromotions() in
// lib/promotions-api.ts so it never needs direct table access.
export async function GET() {
  const supabase = getSupabaseAdmin();

  try {
    const nowIso = new Date().toISOString();

    const { data: promotions, error } = await supabase
      .from('promotions')
      .select('*')
      .eq('is_active', true)
      .or(`starts_at.is.null,starts_at.lte.${nowIso}`)
      .or(`ends_at.is.null,ends_at.gte.${nowIso}`);
    if (error) throw error;

    const active = promotions ?? [];
    const collectionScoped = active.filter((p) => p.scope === 'collection' && p.collection_id);

    let productIdsByCollection = new Map<string, string[]>();
    let bogoBadgeByCollection = new Map<string, boolean>();
    let slugByCollection = new Map<string, string>();
    if (collectionScoped.length > 0) {
      const collectionIds = Array.from(new Set(collectionScoped.map((p) => p.collection_id)));
      const [{ data: links, error: linksErr }, { data: collectionRows, error: collectionsErr }] = await Promise.all([
        supabase.from('collection_products').select('collection_id, product_id').in('collection_id', collectionIds),
        supabase.from('collections').select('id, slug, show_bogo_badge').in('id', collectionIds),
      ]);
      if (linksErr) throw linksErr;
      if (collectionsErr) throw collectionsErr;

      for (const link of links ?? []) {
        const list = productIdsByCollection.get(link.collection_id) ?? [];
        list.push(link.product_id);
        productIdsByCollection.set(link.collection_id, list);
      }
      for (const row of collectionRows ?? []) {
        bogoBadgeByCollection.set(row.id, row.show_bogo_badge);
        slugByCollection.set(row.id, row.slug);
      }
    }

    const result = active.map((promo) => ({
      ...promo,
      product_ids:
        promo.scope === 'collection' && promo.collection_id
          ? productIdsByCollection.get(promo.collection_id) ?? []
          : null,
      collection_slug:
        promo.scope === 'collection' && promo.collection_id
          ? slugByCollection.get(promo.collection_id) ?? null
          : null,
      // Defaults to true for scope='all' (no collection to toggle it off
      // on) and for a collection row that's somehow missing.
      show_bogo_badge:
        promo.scope === 'collection' && promo.collection_id
          ? bogoBadgeByCollection.get(promo.collection_id) ?? true
          : true,
    }));

    return NextResponse.json(
      { promotions: result },
      { headers: { 'Cache-Control': 's-maxage=30, stale-while-revalidate=60' } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load active promotions';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
