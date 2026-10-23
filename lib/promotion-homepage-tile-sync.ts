import { SupabaseClient } from '@supabase/supabase-js';

// Server-only helper (uses the service-role client) shared by
// app/api/admin/promotions/route.ts (POST) and
// app/api/admin/promotions/[id]/route.ts (PATCH) to keep a promotion's
// auto-linked homepage_tiles row (Part 4a) in sync.

export interface PromotionForTileSync {
  id: string;
  buy_qty: number;
  get_qty: number;
  free_item_discount_percent: number;
  scope: 'all' | 'collection';
  is_active: boolean;
}

function deriveTileFields(promotion: PromotionForTileSync) {
  const isFree = promotion.free_item_discount_percent === 100;
  return {
    title: `Buy ${promotion.buy_qty}`,
    subtitle: isFree
      ? `Get ${promotion.get_qty} Free`
      : `Get ${promotion.get_qty} ${promotion.free_item_discount_percent}% Off`,
    badge_text: isFree ? 'FREE' : `${promotion.free_item_discount_percent}% OFF`,
  };
}

/**
 * Creates, updates, or removes the homepage_tiles row auto-linked to a
 * promotion via source_promotion_id, based on `shouldShow`.
 *
 * - shouldShow=true and no linked tile yet → insert one (title/subtitle/
 *   badge_text derived from the promotion; image/price_label/cta_label
 *   are left for the admin to fill in on the Homepage Tiles panel).
 * - shouldShow=true and a linked tile exists → refresh its derived
 *   fields and is_active, so editing buy_qty/get_qty/discount later
 *   keeps the tile text correct without the admin re-checking the box.
 * - shouldShow=false → delete the linked tile, if any.
 *
 * Only scope='collection' promotions may be shown as a tile (Part 4b
 * routes the tile to that collection), so callers should not pass
 * shouldShow=true for scope='all' promotions.
 */
export async function syncHomepageTileForPromotion(
  supabase: SupabaseClient,
  promotion: PromotionForTileSync,
  shouldShow: boolean
): Promise<void> {
  const { data: existing } = await supabase
    .from('homepage_tiles')
    .select('id')
    .eq('source_promotion_id', promotion.id)
    .maybeSingle();

  if (!shouldShow || promotion.scope !== 'collection') {
    if (existing) {
      await supabase.from('homepage_tiles').delete().eq('id', existing.id);
    }
    return;
  }

  const fields = deriveTileFields(promotion);

  if (existing) {
    await supabase
      .from('homepage_tiles')
      .update({
        ...fields,
        link_type: 'promotion',
        link_value: promotion.id,
        is_active: promotion.is_active,
      })
      .eq('id', existing.id);
    return;
  }

  const { data: maxRow } = await supabase
    .from('homepage_tiles')
    .select('position')
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextPosition = (maxRow?.position ?? -1) + 1;

  await supabase.from('homepage_tiles').insert({
    position: nextPosition,
    ...fields,
    cta_label: 'Shop Now',
    link_type: 'promotion',
    link_value: promotion.id,
    source_promotion_id: promotion.id,
    is_active: promotion.is_active,
  });
}

/** True if a promotion currently has an auto-linked homepage tile. */
export async function promotionHasLinkedTile(
  supabase: SupabaseClient,
  promotionId: string
): Promise<boolean> {
  const { data } = await supabase
    .from('homepage_tiles')
    .select('id')
    .eq('source_promotion_id', promotionId)
    .maybeSingle();
  return !!data;
}

/** Batch version of promotionHasLinkedTile for the promotions list (GET). */
export async function fetchLinkedTilePromotionIds(
  supabase: SupabaseClient
): Promise<Set<string>> {
  const { data } = await supabase
    .from('homepage_tiles')
    .select('source_promotion_id')
    .not('source_promotion_id', 'is', null);
  return new Set((data ?? []).map((row: { source_promotion_id: string }) => row.source_promotion_id));
}
