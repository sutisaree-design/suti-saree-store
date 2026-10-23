import { supabase } from './supabase';
import { pickBestCampaignCoupon } from './campaign-templates';

export interface Coupon {
  id: string;
  code: string;
  discount_type: 'percentage' | 'flat';
  discount_value: number;
  min_order_value: number;
  usage_limit: number | null;
  times_used: number;
  expires_at: string | null;
  is_active: boolean;
  show_on_product_page: boolean;
  show_in_google_promotions: boolean;
  created_at?: string;
}

export interface CouponResult {
  ok: boolean;
  error?: string;
  coupon?: Coupon;
  discount?: number;
}

// ---------------------------------------------------------------------
// Admin management (Admin > Coupons tab)
// ---------------------------------------------------------------------

export async function fetchCoupons(): Promise<Coupon[]> {
  const res = await fetch('/api/admin/coupons');
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'Failed to load coupons');
  return (body.coupons ?? []) as Coupon[];
}

export interface CouponInput {
  code: string;
  discount_type: 'percentage' | 'flat';
  discount_value: number;
  min_order_value: number;
  usage_limit: number | null;
  expires_at: string | null;
  is_active: boolean;
  show_on_product_page: boolean;
  show_in_google_promotions: boolean;
}

async function adminCouponRequest(url: string, options: RequestInit) {
  const res = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'Request failed');
  return body;
}

export async function createCoupon(input: CouponInput) {
  await adminCouponRequest('/api/admin/coupons', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function updateCoupon(id: string, input: CouponInput) {
  await adminCouponRequest(`/api/admin/coupons/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export async function deleteCoupon(id: string) {
  await adminCouponRequest(`/api/admin/coupons/${id}`, { method: 'DELETE' });
}

export async function setCouponActive(id: string, is_active: boolean) {
  await adminCouponRequest(`/api/admin/coupons/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ is_active }),
  });
}

export async function setCouponShowOnProductPage(id: string, show_on_product_page: boolean) {
  await adminCouponRequest(`/api/admin/coupons/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ show_on_product_page }),
  });
}

export async function setCouponShowInGooglePromotions(id: string, show_in_google_promotions: boolean) {
  await adminCouponRequest(`/api/admin/coupons/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ show_in_google_promotions }),
  });
}

// ---------------------------------------------------------------------
// Storefront display (homepage promo strip)
// ---------------------------------------------------------------------

/**
 * Shared "which coupon wins" ranking — see pickBestCampaignCoupon in
 * campaign-templates.ts for the actual rule (percentage preferred, then
 * highest value). Re-exported under this name for existing callers.
 */
export function pickBestCoupon(coupons: Coupon[]): Coupon | null {
  return pickBestCampaignCoupon(coupons);
}

/**
 * Picks one coupon to headline on the homepage: must be active, not
 * expired, and not past its usage limit. Percentage coupons are preferred
 * (they read as a bigger, more attention-grabbing offer), then the highest
 * value. Returns null when nothing qualifies, so the homepage section can
 * simply not render rather than show a stale offer.
 */
export async function fetchHomepageCoupon(): Promise<Coupon | null> {
  const { data, error } = await supabase
    .from('coupons')
    .select('*')
    .eq('is_active', true);
  if (error) throw error;

  const now = Date.now();
  const eligible = ((data ?? []) as Coupon[]).filter(
    (c) =>
      (!c.expires_at || new Date(c.expires_at).getTime() > now) &&
      (c.usage_limit === null || c.times_used < c.usage_limit)
  );
  return pickBestCoupon(eligible);
}

/**
 * Every coupon currently eligible to be shown to shoppers (active, not
 * expired, under its usage limit) — used by the homepage coupon strip so
 * ALL live offers show up, not just one. Sorted highest-value first.
 */
export async function fetchAllActiveCoupons(): Promise<Coupon[]> {
  const { data, error } = await supabase
    .from('coupons')
    .select('*')
    .eq('is_active', true);
  if (error) throw error;

  const now = Date.now();
  const eligible = ((data ?? []) as Coupon[]).filter(
    (c) =>
      (!c.expires_at || new Date(c.expires_at).getTime() > now) &&
      (c.usage_limit === null || c.times_used < c.usage_limit)
  );
  eligible.sort((a, b) => {
    if (a.discount_type !== b.discount_type) {
      return a.discount_type === 'percentage' ? -1 : 1;
    }
    return b.discount_value - a.discount_value;
  });
  return eligible;
}

// ---------------------------------------------------------------------
// Storefront display (product page "Available Coupons" list)
// ---------------------------------------------------------------------

/**
 * Coupons an admin has flagged to show on the product page. Only
 * returns ones that are active, flagged visible, not expired, and
 * (if they have a usage limit) not yet exhausted.
 */
export async function fetchProductPageCoupons(): Promise<Coupon[]> {
  const { data, error } = await supabase
    .from('coupons')
    .select('*')
    .eq('is_active', true)
    .eq('show_on_product_page', true)
    .order('discount_value', { ascending: false });
  if (error) throw error;

  const now = Date.now();
  return ((data ?? []) as Coupon[]).filter(
    (c) =>
      (!c.expires_at || new Date(c.expires_at).getTime() > now) &&
      (c.usage_limit === null || c.times_used < c.usage_limit)
  );
}

// ---------------------------------------------------------------------
// Storefront validation (checkout page)
// ---------------------------------------------------------------------

/**
 * Core discount formula. Shared by the coupon validator and the live cart
 * total so the two can never drift out of sync.
 *
 * - Flat coupons ("₹100 off") apply once PER DISTINCT PRODUCT in the cart,
 *   not once per order — so 2 different sarees with a flat ₹100 coupon
 *   give ₹200 off total, not ₹100.
 * - Percentage coupons don't need a multiplier: X% of the whole subtotal
 *   is already equal to X% off each product added together, so
 *   productCount is ignored for those.
 *
 * Result is always clamped so the discount can never exceed the subtotal.
 */
export function computeCouponDiscount(
  coupon: Pick<Coupon, 'discount_type' | 'discount_value'>,
  subtotal: number,
  productCount: number = 1
): number {
  if (subtotal <= 0) return 0;
  const raw =
    coupon.discount_type === 'percentage'
      ? Math.round((subtotal * coupon.discount_value) / 100)
      : Math.round(coupon.discount_value) * Math.max(1, productCount);
  return Math.min(raw, subtotal);
}

/**
 * Per-cart-line share of an applied coupon's discount, for showing each
 * product's own "after coupon" price in the cart drawer/page (not just the
 * order-wide total). Mirrors computeCouponDiscount's own rules so the sum
 * across every line always lines up with the whole-cart figure:
 *  - Percentage coupons: each line loses that same % of its own total.
 *  - Flat coupons: applied once per distinct product line (not per unit),
 *    same as computeCouponDiscount's `productCount` multiplier — so a flat
 *    ₹100 coupon knocks ₹100 off THIS line specifically, capped at the
 *    line's own total (never negative, never more than the line is worth).
 */
export function computeItemCouponDiscount(
  coupon: Pick<Coupon, 'discount_type' | 'discount_value'>,
  lineTotal: number
): number {
  if (lineTotal <= 0) return 0;
  const raw =
    coupon.discount_type === 'percentage'
      ? Math.round((lineTotal * coupon.discount_value) / 100)
      : Math.round(coupon.discount_value);
  return Math.min(raw, lineTotal);
}

/**
 * Looks up a coupon code and checks it against the current cart subtotal.
 * Returns the rupee discount to apply (already clamped to the subtotal so
 * a coupon can never take a total below zero). Pass productCount = number
 * of distinct products in the cart so flat coupons are priced correctly.
 */
export async function validateCoupon(
  code: string,
  subtotal: number,
  productCount: number = 1
): Promise<CouponResult> {
  const trimmed = code.trim().toUpperCase();
  if (!trimmed) return { ok: false, error: 'Enter a coupon code' };

  const { data, error } = await supabase
    .from('coupons')
    .select('*')
    .ilike('code', trimmed)
    .maybeSingle();

  if (error) return { ok: false, error: 'Could not validate coupon right now' };
  if (!data) return { ok: false, error: 'Invalid coupon code' };

  const coupon = data as Coupon;

  if (!coupon.is_active) return { ok: false, error: 'This coupon is no longer active' };
  if (coupon.expires_at && new Date(coupon.expires_at).getTime() < Date.now()) {
    return { ok: false, error: 'This coupon has expired' };
  }
  if (coupon.usage_limit !== null && coupon.times_used >= coupon.usage_limit) {
    return { ok: false, error: 'This coupon has reached its usage limit' };
  }
  if (subtotal < coupon.min_order_value) {
    return {
      ok: false,
      error: `Add items worth ${coupon.min_order_value - subtotal} more to use this coupon`,
    };
  }

  const discount = computeCouponDiscount(coupon, subtotal, productCount);

  return { ok: true, coupon, discount };
}
