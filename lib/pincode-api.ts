import { getServerSupabase } from './supabase-server';
import { purgeSiteLayoutCache } from './purge-site-cache';

export interface PincodeResult {
  serviceable: boolean;
  pincode: string;
  city?: string;
  state?: string;
  etaDays: number;
  codAvailable: boolean;
  message: string;
  /**
   * Whether this pincode's EXISTENCE (not just serviceability) was
   * actually confirmed against India Post's real pincode database:
   *  - 'yes'     -> India Post found a matching post office; this is a
   *                 genuine, real Indian pincode.
   *  - 'no'      -> India Post responded successfully but found NO match
   *                 for this pincode -- it does not exist / is a typo.
   *  - 'unknown' -> the India Post API itself was unreachable, so we
   *                 couldn't check either way (checkout should NOT be
   *                 blocked in this case -- don't punish real customers
   *                 for a third-party API being briefly down).
   */
  verified: 'yes' | 'no' | 'unknown';
}

// Rough zone model by the first digit of an Indian PIN code. Used only to
// estimate delivery time when no courier account is wired up yet — swap
// this out for real courier serviceability once Shiprocket/Delhivery etc.
// is integrated.
const ZONE_ETA: Record<string, number> = {
  '1': 3, // Delhi, Haryana, Punjab, HP, J&K
  '2': 4, // UP, Uttarakhand
  '3': 4, // Rajasthan, Gujarat
  '4': 3, // Maharashtra, MP, Chhattisgarh, Goa
  '5': 4, // AP, Telangana, Karnataka
  '6': 4, // Tamil Nadu, Kerala, Puducherry
  '7': 3, // West Bengal, Odisha, NE states
  '8': 5, // Bihar, Jharkhand
  '9': 6, // Army post offices / remote
};

// A handful of known non-serviceable / restricted pincode prefixes
// (remote or COD-restricted areas). Extend as needed from settings.
const COD_RESTRICTED_PREFIXES = ['79', '80'];

export function isValidPincode(pincode: string): boolean {
  return /^[1-9][0-9]{5}$/.test(pincode.trim());
}

/**
 * Checks whether a pincode is serviceable and estimates delivery time.
 * Looks up the city/state from India Post's public pincode API for a
 * friendly confirmation message, then applies a zone-based ETA heuristic.
 */
export async function checkPincodeServiceability(pincode: string): Promise<PincodeResult> {
  const clean = pincode.trim();

  if (!isValidPincode(clean)) {
    return {
      serviceable: false,
      pincode: clean,
      etaDays: 0,
      codAvailable: false,
      message: 'Enter a valid 6-digit pincode',
      verified: 'no',
    };
  }

  const zoneDigit = clean[0];
  const etaDays = ZONE_ETA[zoneDigit] ?? 5;
  const codAvailable = !COD_RESTRICTED_PREFIXES.includes(clean.slice(0, 2));

  try {
    // India Post's public API has no SLA and is known to occasionally hang
    // rather than error out. Without a timeout, an unresponsive request
    // here would leave the caller's "verifying" state stuck forever (both
    // the checkout page's live pincode check AND the submit-time re-check
    // reuse this function) -- so give it a hard deadline and fall through
    // to the same "API unreachable" handling as a network error below.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    let res: Response;
    try {
      res = await fetch(`https://api.postalpincode.in/pincode/${clean}`, {
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
    const data = await res.json();
    const record = Array.isArray(data) ? data[0] : null;

    if (record?.Status === 'Success' && record.PostOffice?.length > 0) {
      const office = record.PostOffice[0];
      return {
        serviceable: true,
        pincode: clean,
        city: office.District,
        state: office.State,
        etaDays,
        codAvailable,
        message: `Delivers to ${office.District}, ${office.State} in ${etaDays}-${etaDays + 2} days`,
        verified: 'yes',
      };
    }

    return {
      serviceable: false,
      pincode: clean,
      etaDays: 0,
      codAvailable: false,
      message: 'This PIN code does not exist. Please double-check it.',
      verified: 'no',
    };
  } catch {
    // API unreachable — don't block checkout, fall back to the zone estimate.
    return {
      serviceable: true,
      pincode: clean,
      etaDays,
      codAvailable,
      message: `Estimated delivery in ${etaDays}-${etaDays + 2} days`,
      verified: 'unknown',
    };
  }
}

export interface ShippingSettings {
  /** Flat shipping fee in rupees, charged when subtotal is below the free-shipping threshold */
  flat_rate: number;
  /** Order subtotal (in rupees) at or above which shipping becomes free. Set to 0 to always charge. */
  free_shipping_threshold: number;
  /** GST / tax rate applied at checkout, as a percentage (e.g. 5 = 5%) */
  gst_rate_percent: number;
  /**
   * Razorpay (or other gateway) transaction fee, as a percentage of the
   * order value — used only to estimate the net settlement shown on the
   * Add/Edit Product form. Does not affect what the customer is charged.
   */
  payment_gateway_fee_percent: number;
  /**
   * Any other manual per-order deduction in rupees you want factored into
   * the estimated settlement preview (e.g. packaging, handling, average
   * logistics cost not already covered by the shipping fee above).
   */
  other_charges: number;
  /** Roughly what % of your orders are COD vs prepaid (0-100). Used only for the safe-profit estimate. */
  cod_order_percent: number;
  /** Roughly what % of orders come back as a return/RTO (0-100). Used only for the safe-profit estimate. */
  return_rate_percent: number;
  /**
   * Your ACTUAL courier/logistics cost per COD order, in rupees (e.g. Delhivery's
   * COD handling + forward freight). Used only for the Safe Profit estimate —
   * kept separate from `flat_rate` (what the customer is charged) so that
   * offering free shipping to customers doesn't zero out your real cost in
   * the profit math.
   */
  cod_logistics_cost: number;
  /**
   * Your ACTUAL courier/logistics cost per prepaid order, in rupees. COD
   * orders usually cost more than prepaid (COD handling fee + higher RTO
   * rate), so this is tracked separately from `cod_logistics_cost`.
   */
  prepaid_logistics_cost: number;
  /**
   * Your ACTUAL cost, in rupees, to get stock FROM a vendor TO your
   * warehouse (pickup courier / freight) — e.g. a Delhivery/Porter
   * pickup booked against the vendor's address. This is the "first leg"
   * shipping cost that only exists for vendor-sourced stock (admin's own
   * stock is already at the warehouse, so it doesn't apply there). Used
   * by lib/vendor-pricing.ts to mark up a vendor's asking price into the
   * real website price — see computeVendorPriceBreakdown(). Kept
   * separate from cod_logistics_cost/prepaid_logistics_cost above, which
   * are the "second leg" (warehouse -> customer) cost.
   */
  vendor_pickup_shipping_cost: number;
  /**
   * Average coupon usage rate across ALL orders, as a % (0-100) — e.g. if
   * roughly 3 out of 10 orders use a coupon, enter 30. Used with
   * `coupon_discount_type`/`coupon_discount_value` below to blend the
   * average coupon cost into the Safe Profit estimate.
   */
  coupon_usage_percent: number;
  /** Whether your typical/main coupon is a flat rupee amount off or a percentage off. */
  coupon_discount_type: 'flat' | 'percentage';
  /**
   * The discount value of your typical coupon — in rupees if
   * coupon_discount_type is 'flat' (e.g. 50 = ₹50 off), or in % if
   * 'percentage' (e.g. 10 = 10% off).
   */
  coupon_discount_value: number;
  /** Suggested markup % over cost price for everyday/entry-level products (used as a Product form quick-fill). */
  entry_markup_percent: number;
  /** Suggested markup % over cost price for mid-range/festive products. */
  mid_markup_percent: number;
  /** Suggested markup % over cost price for premium/designer products. */
  premium_markup_percent: number;
}

export const DEFAULT_SHIPPING_SETTINGS: ShippingSettings = {
  flat_rate: 99,
  free_shipping_threshold: 2000,
  gst_rate_percent: 5,
  payment_gateway_fee_percent: 2.36,
  other_charges: 0,
  cod_order_percent: 60,
  return_rate_percent: 15,
  cod_logistics_cost: 0,
  prepaid_logistics_cost: 0,
  vendor_pickup_shipping_cost: 60,
  coupon_usage_percent: 0,
  coupon_discount_type: 'flat',
  coupon_discount_value: 0,
  entry_markup_percent: 35,
  mid_markup_percent: 45,
  premium_markup_percent: 85,
};

export async function fetchShippingSettings(): Promise<ShippingSettings> {
  const supabase = getServerSupabase();
  const { data, error } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'shipping')
    .maybeSingle();
  if (error || !data) return DEFAULT_SHIPPING_SETTINGS;
  return { ...DEFAULT_SHIPPING_SETTINGS, ...(data.value as Partial<ShippingSettings>) };
}

export async function saveShippingSettings(settings: ShippingSettings): Promise<void> {
  const supabase = getServerSupabase();
  const { error } = await supabase
    .from('settings')
    .upsert({ key: 'shipping', value: settings }, { onConflict: 'key' });
  if (error) throw error;
  await purgeSiteLayoutCache();
}
