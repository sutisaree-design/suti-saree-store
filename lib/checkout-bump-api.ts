import { supabase } from './supabase';

// ---------------------------------------------------------------------
// Phase 15 — Checkout Order Bump
// A single admin-picked product shown at checkout as a one-click add-on
// ("Add X for ₹Y — Z% off"), regardless of what's already in the cart.
// This is the classic order-bump pattern used to lift AOV, kept
// independent of the free-shipping-threshold banner (Growth Tools).
// Settings live in one `settings` row, same pattern as growth_settings.
// ---------------------------------------------------------------------

export interface CheckoutBumpSettings {
  enabled: boolean;
  product_id: string | null;
  headline: string;
  subtext: string;
  discount_percent: number; // 0-90, applied on top of the product's normal price
}

export const DEFAULT_CHECKOUT_BUMP_SETTINGS: CheckoutBumpSettings = {
  enabled: false,
  product_id: null,
  headline: 'Add this to your order?',
  subtext: 'One-click add — checkout price only, not available after you place the order.',
  discount_percent: 20,
};

export async function fetchCheckoutBumpSettings(): Promise<CheckoutBumpSettings> {
  const { data, error } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'checkout_bump_settings')
    .maybeSingle();
  if (error || !data) return DEFAULT_CHECKOUT_BUMP_SETTINGS;
  return {
    ...DEFAULT_CHECKOUT_BUMP_SETTINGS,
    ...(data.value as Partial<CheckoutBumpSettings>),
  };
}

export async function saveCheckoutBumpSettings(settings: CheckoutBumpSettings) {
  const { error } = await supabase
    .from('settings')
    .upsert({ key: 'checkout_bump_settings', value: settings }, { onConflict: 'key' });
  if (error) throw error;
}
