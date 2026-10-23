import { getServerSupabase } from '@/lib/supabase-server';
import { DEFAULT_GROWTH_SETTINGS, type GrowthSettings } from '@/lib/growth-api';
import { DEFAULT_SHIPPING_SETTINGS } from '@/lib/pincode-api';
import type { SiteBanner } from '@/lib/settings-api';

/**
 * Settings that the storefront "chrome" (site banner, sale countdown bar,
 * urgency strip, feature strip) used to fetch from Supabase IN THE BROWSER
 * after the page had already painted. Each of those bars rendered nothing
 * until its fetch finished and then popped in, pushing the whole page down
 * (the big Cumulative Layout Shift) -- and cost every visitor 3 extra
 * Supabase requests per page load.
 *
 * This reads all three rows in ONE query on the server (the root layout is
 * cached with `revalidate`, so it runs rarely, not per visitor), and the
 * values are handed to the components as props so they are already in the
 * very first HTML.
 *
 * Only `free_shipping_threshold` is exposed from the shipping row -- the
 * rest of that row holds internal cost settings that must never be sent
 * to the browser.
 */
export interface StorefrontChromeSettings {
  siteBanner: SiteBanner;
  growth: GrowthSettings;
  freeShippingThreshold: number;
}

const DEFAULT_BANNER: SiteBanner = {
  image_url: '',
  link_url: '',
  show_on_home: false,
  show_on_product: false,
};

export async function getStorefrontChromeSettings(): Promise<StorefrontChromeSettings> {
  const fallback: StorefrontChromeSettings = {
    siteBanner: DEFAULT_BANNER,
    growth: DEFAULT_GROWTH_SETTINGS,
    freeShippingThreshold: DEFAULT_SHIPPING_SETTINGS.free_shipping_threshold,
  };
  try {
    const supabase = getServerSupabase();
    const { data, error } = await supabase
      .from('settings')
      .select('key, value')
      .in('key', ['site_banner', 'growth_settings', 'shipping']);
    if (error || !data) return fallback;

    const byKey = new Map<string, any>(data.map((r: any) => [r.key, r.value]));
    const shipping = (byKey.get('shipping') || {}) as { free_shipping_threshold?: number };

    return {
      siteBanner: { ...DEFAULT_BANNER, ...((byKey.get('site_banner') as Partial<SiteBanner>) || {}) },
      growth: { ...DEFAULT_GROWTH_SETTINGS, ...((byKey.get('growth_settings') as Partial<GrowthSettings>) || {}) },
      freeShippingThreshold:
        typeof shipping.free_shipping_threshold === 'number'
          ? shipping.free_shipping_threshold
          : DEFAULT_SHIPPING_SETTINGS.free_shipping_threshold,
    };
  } catch {
    return fallback;
  }
}
