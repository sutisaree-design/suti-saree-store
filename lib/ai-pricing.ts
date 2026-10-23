// ---------------------------------------------------------------------
// Phase 2, Part 3 — AI price suggestion (rule-based).
//
// Called right after a vendor submits a product (see
// app/api/vendor/products/route.ts, POST). Looks at currently "live"
// products in the same category + fabric, averages their `price`, and
// — if the vendor flagged the item as dead/slow-moving stock — knocks
// a configurable percentage off that average so it prices to move.
//
// Deliberately simple/rule-based for now, per the Phase 2 spec. A real
// AI/LLM call can later replace the body of suggestVendorProductPrice()
// without touching its signature or any caller.
//
// Must always be run with the SERVICE ROLE client (getSupabaseAdmin()),
// never the RLS-authenticated per-request client — see the guard
// trigger (trg_guard_vendor_product_fields) in the Phase 2 migration,
// which blocks any non-service-role write to ai_suggested_price.
// ---------------------------------------------------------------------

import { SupabaseClient } from '@supabase/supabase-js';

// Single place to tune the dead-stock discount. Per the Phase 2 spec
// this should sit in the 15-25% range; 20 is the midpoint. Change this
// one number to retune every future suggestion — nothing else needs
// editing.
export const AI_PRICING_CONFIG = {
  DEAD_STOCK_DISCOUNT_PERCENT: 20,
};

export interface PriceSuggestionInput {
  category_name: string;
  fabric: string;
  vendor_expected_price: number | null;
  is_dead_stock: boolean;
}

export interface PriceSuggestionResult {
  suggested_price: number | null;
  /** Human-readable explanation, shown to the admin in Part 5 so a
   *  suggestion is never a black box. */
  basis: string;
  /** How many live listings the average was computed from (0 if a
   *  fallback path was used). */
  sample_size: number;
}

/**
 * Computes an AI-suggested price for a newly submitted vendor product.
 *
 * Resolution order:
 *   1. Average `price` of live products with the same category AND
 *      same fabric.
 *   2. Fallback — average `price` of live products in the same
 *      category, any fabric (covers a brand-new fabric in a known
 *      category).
 *   3. Fallback — the vendor's own `vendor_expected_price`, if given,
 *      so the admin still has a starting point.
 *   4. Otherwise `suggested_price: null` — the admin sets it manually.
 *
 * Never throws. A pricing miss should never block a product
 * submission, so any error resolves to `{ suggested_price: null }`.
 */
export async function suggestVendorProductPrice(
  supabaseAdmin: SupabaseClient,
  input: PriceSuggestionInput
): Promise<PriceSuggestionResult> {
  const { category_name, fabric, vendor_expected_price, is_dead_stock } = input;

  try {
    // 1) Same category + same fabric, live products only.
    const { data: exactMatches, error: exactErr } = await supabaseAdmin
      .from('products')
      .select('price')
      .eq('approval_status', 'live')
      .ilike('category_name', category_name)
      .ilike('fabric', fabric);
    if (exactErr) throw exactErr;

    let rows = exactMatches ?? [];
    let basis = `Average of ${rows.length} live "${category_name}" / "${fabric}" listing(s)`;

    // 2) Fallback — same category only, any fabric.
    if (rows.length === 0) {
      const { data: categoryMatches, error: catErr } = await supabaseAdmin
        .from('products')
        .select('price')
        .eq('approval_status', 'live')
        .ilike('category_name', category_name);
      if (catErr) throw catErr;

      rows = categoryMatches ?? [];
      basis = `Average of ${rows.length} live "${category_name}" listing(s) (no exact fabric match)`;
    }

    let basePrice: number | null = null;

    if (rows.length > 0) {
      const sum = rows.reduce((acc: number, r: { price: number | null }) => acc + Number(r.price || 0), 0);
      basePrice = sum / rows.length;
    } else if (vendor_expected_price != null) {
      // 3) No comparable live products at all.
      basePrice = vendor_expected_price;
      basis = 'No comparable live listings — vendor expected price used as starting point';
    }

    if (basePrice == null) {
      return {
        suggested_price: null,
        basis: 'No comparable live listings and no vendor expected price given',
        sample_size: rows.length,
      };
    }

    let suggested = basePrice;
    if (is_dead_stock) {
      const pct = AI_PRICING_CONFIG.DEAD_STOCK_DISCOUNT_PERCENT;
      suggested = basePrice * (1 - pct / 100);
      basis += ` — minus ${pct}% dead-stock discount`;
    }

    return {
      suggested_price: Math.round(suggested * 100) / 100,
      basis,
      sample_size: rows.length,
    };
  } catch (err) {
    console.error('[ai-pricing] suggestVendorProductPrice failed:', err);
    return { suggested_price: null, basis: 'Pricing lookup failed', sample_size: 0 };
  }
}
