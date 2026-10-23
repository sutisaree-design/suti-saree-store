// ---------------------------------------------------------------------
// Settings for the cart-recovery email SEQUENCE (up to 3 emails per
// abandoned cart instead of the old single one-off email). Stored in
// the `settings` table under key 'cart_recovery_sequence_settings',
// locked to service_role only (see migration
// 20260928010000_cart_recovery_sequence.sql) -- so unlike
// email-automation-api.ts this is read/written exclusively through
// app/api/admin/cart-recovery-settings (admin-token gated), never
// directly from a client component with the anon key.
//
// delay_hours meaning per step:
//   step 1: hours since the cart's last_activity_at (same trigger the
//           single-email version always used)
//   step 2 & 3: hours since the PREVIOUS email in the sequence was sent
// ---------------------------------------------------------------------

import type { SupabaseClient } from '@supabase/supabase-js';

export interface CartRecoveryEmailStep {
  enabled: boolean;
  delay_hours: number;
  // Leave subject/html blank to use the built-in template for that
  // step (with escalating copy — soft nudge, reminder, last chance).
  // See renderCartRecoveryEmail() in lib/email-templates.ts for the
  // {{merge_fields}} available when writing a custom one.
  subject: string;
  html: string;
  coupon_code: string;
  // Optional — leave discount_value at 0 to just quote the coupon code
  // with generic "special discount" wording, same as before. Set it above
  // 0 to also show the exact rupee amount the customer will pay after the
  // discount (see computeDiscountedPrice / {{final_price}} in
  // lib/email-templates.ts) — showing a concrete price instead of just a
  // code tends to convert better.
  discount_type: 'percentage' | 'flat';
  discount_value: number;
}

// A single, later-stage WhatsApp nudge for carts that are still not
// recovered after `delay_hours` (default 3 days / 72h) since
// last_activity_at. Unlike the email steps above, this isn't sent
// automatically — the admin taps a button in the Carts tab that appears
// once the cart is old enough — but the wording, timing, and discount are
// all configurable here so the admin doesn't have to hand-edit the
// message every time.
export interface CartRecoveryUrgencyWhatsappSettings {
  enabled: boolean;
  // How many hours of inactivity before the "urgency" WhatsApp button
  // appears in the admin panel. Defaults to 72 (3 days).
  delay_hours: number;
  discount_type: 'percentage' | 'flat';
  // Percentage points (e.g. 5 for 5%) or a flat rupee amount (e.g. 100),
  // depending on discount_type.
  discount_value: number;
  // Optional coupon code to quote in the message. Create the matching
  // coupon under Admin > Coupons so it actually applies at checkout.
  coupon_code: string;
}

export interface CartRecoverySequenceSettings {
  enabled: boolean;
  steps: [CartRecoveryEmailStep, CartRecoveryEmailStep, CartRecoveryEmailStep];
  urgency_whatsapp: CartRecoveryUrgencyWhatsappSettings;
}

const emptyStep = (delay_hours: number): CartRecoveryEmailStep => ({
  enabled: true,
  delay_hours,
  subject: '',
  html: '',
  coupon_code: '',
  discount_type: 'percentage',
  discount_value: 0,
});

// Shared by the email templates and the WhatsApp message builders so the
// rupee amount shown to the customer is always computed the same way.
// discount_value of 0 or less means "no discount configured" — callers
// should treat that as "don't show a final price".
export function computeDiscountedPrice(
  cartValue: number,
  discountType: 'percentage' | 'flat',
  discountValue: number
): number {
  if (!discountValue || discountValue <= 0) return cartValue;
  const raw =
    discountType === 'percentage' ? cartValue - (cartValue * discountValue) / 100 : cartValue - discountValue;
  return Math.max(0, Math.round(raw));
}

const DEFAULT_URGENCY_WHATSAPP_SETTINGS: CartRecoveryUrgencyWhatsappSettings = {
  enabled: true,
  delay_hours: 72,
  discount_type: 'percentage',
  discount_value: 5,
  coupon_code: '',
};

export const DEFAULT_CART_RECOVERY_SEQUENCE_SETTINGS: CartRecoverySequenceSettings = {
  enabled: true,
  steps: [emptyStep(1), emptyStep(24), emptyStep(72)],
  urgency_whatsapp: DEFAULT_URGENCY_WHATSAPP_SETTINGS,
};

export function mergeCartRecoverySequenceSettings(
  value: Partial<CartRecoverySequenceSettings> | null | undefined
): CartRecoverySequenceSettings {
  const steps = [0, 1, 2].map((i) => ({
    ...DEFAULT_CART_RECOVERY_SEQUENCE_SETTINGS.steps[i],
    ...(value?.steps?.[i] || {}),
  })) as CartRecoverySequenceSettings['steps'];
  const urgency_whatsapp: CartRecoveryUrgencyWhatsappSettings = {
    ...DEFAULT_URGENCY_WHATSAPP_SETTINGS,
    ...(value?.urgency_whatsapp || {}),
  };
  return { enabled: value?.enabled ?? true, steps, urgency_whatsapp };
}

export async function getCartRecoverySequenceSettings(
  supabase: SupabaseClient
): Promise<CartRecoverySequenceSettings> {
  const { data } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'cart_recovery_sequence_settings')
    .maybeSingle();
  return mergeCartRecoverySequenceSettings(data?.value as Partial<CartRecoverySequenceSettings> | undefined);
}
