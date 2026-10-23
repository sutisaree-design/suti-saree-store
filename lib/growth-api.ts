import { supabase } from './supabase';
import { purgeSiteLayoutCache } from './purge-site-cache';

// ---------------------------------------------------------------------
// Phase 13 — Growth Marketing Toolkit
// Conversion-focused, admin-toggleable features: urgency banner, low
// stock badges, exit-intent discount popup, live social proof toasts,
// and a sale countdown bar. All settings live in one row so the admin
// can flip any of them on/off from Admin > Marketing > Growth Tools
// without a redeploy.
// ---------------------------------------------------------------------

export interface GrowthSettings {
  urgency_banner_enabled: boolean;
  urgency_banner_text: string;

  low_stock_enabled: boolean;
  low_stock_threshold: number;

  exit_intent_enabled: boolean;
  exit_intent_headline: string;
  exit_intent_message: string;
  exit_intent_coupon_code: string;
  // Drives the auto-shown "10% OFF" / "₹200 OFF" badge on the popup, kept
  // separate from the freeform headline/message so the number displayed
  // is never accidentally out of sync with what the admin actually typed.
  // Still has to match a real coupon created under Admin > Coupons for the
  // code to work at checkout — this only controls what the popup shows.
  exit_intent_discount_type: 'percentage' | 'flat';
  exit_intent_discount_value: number;

  social_proof_enabled: boolean;

  // "X people are viewing this right now" badge on the product page.
  // Real count — distinct sessions that fired a product_view event for
  // this exact product within live_viewers_window_minutes. Never
  // fabricated. Hidden below live_viewers_min_to_show so a lone visitor
  // never sees "1 person viewing this", which looks worse than nothing.
  live_viewers_enabled: boolean;
  live_viewers_window_minutes: number;
  live_viewers_min_to_show: number;

  bundles_enabled: boolean;

  sale_countdown_enabled: boolean;
  sale_countdown_text: string;
  sale_countdown_end_at: string | null; // ISO timestamp

  // Feature icons strip — the 3-column row right below the header
  // (Easy returns / Fast delivery / Free shipping). Icons stay fixed in
  // code, but the title/subtitle text and the on/off switch are editable
  // from Admin > Marketing > Growth Tools. Leave the free-shipping
  // subtitle blank to keep it auto-synced with Settings > Shipping.
  feature_strip_enabled: boolean;
  feature_strip_returns_title: string;
  feature_strip_returns_subtitle: string;
  feature_strip_delivery_title: string;
  feature_strip_delivery_subtitle: string;
  feature_strip_shipping_title: string;
  feature_strip_shipping_subtitle: string; // blank => auto "For orders ₹X+" / "On every order"
}

export const DEFAULT_GROWTH_SETTINGS: GrowthSettings = {
  urgency_banner_enabled: false,
  urgency_banner_text: 'Free shipping on orders above ₹1999 — today only!',
  low_stock_enabled: true,
  low_stock_threshold: 5,
  exit_intent_enabled: false,
  exit_intent_headline: "Wait! Don't leave empty-handed",
  exit_intent_message: "Here's 10% off your first order, just for you.",
  exit_intent_coupon_code: 'WELCOME10',
  exit_intent_discount_type: 'percentage',
  exit_intent_discount_value: 10,
  social_proof_enabled: false,
  live_viewers_enabled: false,
  live_viewers_window_minutes: 15,
  live_viewers_min_to_show: 2,
  bundles_enabled: true,
  sale_countdown_enabled: false,
  sale_countdown_text: 'Festive Sale ends in',
  sale_countdown_end_at: null,

  feature_strip_enabled: true,
  feature_strip_returns_title: 'Easy returns',
  feature_strip_returns_subtitle: 'Free pick up',
  feature_strip_delivery_title: 'Fast delivery',
  feature_strip_delivery_subtitle: '10000+ styles',
  feature_strip_shipping_title: 'Free shipping',
  feature_strip_shipping_subtitle: '',
};

export async function fetchGrowthSettings(): Promise<GrowthSettings> {
  const { data, error } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'growth_settings')
    .maybeSingle();
  if (error || !data) return DEFAULT_GROWTH_SETTINGS;
  return { ...DEFAULT_GROWTH_SETTINGS, ...(data.value as Partial<GrowthSettings>) };
}

export async function saveGrowthSettings(settings: GrowthSettings) {
  const { error } = await supabase
    .from('settings')
    .upsert({ key: 'growth_settings', value: settings }, { onConflict: 'key' });
  if (error) throw error;
  await purgeSiteLayoutCache();
}

// ---------------------------------------------------------------------
// Social proof feed — "Someone in Jaipur just bought X, 8 minutes ago"
// Reads straight off recent order_items, no new table needed.
// ---------------------------------------------------------------------

export interface SocialProofEvent {
  product_name: string;
  city: string | null;
  minutes_ago: number;
}

export async function fetchSocialProofFeed(): Promise<SocialProofEvent[]> {
  const res = await fetch('/api/social-proof');
  if (!res.ok) return [];
  const body = await res.json().catch(() => ({ events: [] }));
  return (body.events ?? []) as SocialProofEvent[];
}

// ---------------------------------------------------------------------
// Live viewers — "12 people are viewing this right now" on the product
// page. Real count only: distinct sessions with a product_view event for
// this product in the last N minutes (see app/api/live-viewers/route.ts).
// ---------------------------------------------------------------------

export async function fetchLiveViewerCount(productId: string): Promise<number> {
  try {
    const res = await fetch(`/api/live-viewers?product_id=${encodeURIComponent(productId)}`);
    if (!res.ok) return 0;
    const body = await res.json().catch(() => ({ count: 0 }));
    return typeof body.count === 'number' ? body.count : 0;
  } catch {
    return 0;
  }
}
