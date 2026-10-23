// ---------------------------------------------------------------------
// Responsive Images — feature flag (Admin > Settings > Responsive Images).
//
// WHAT THIS CONTROLS
//   OFF (default): every <Image> resolves to the exact original URL,
//     i.e. identical behaviour to `unoptimized: true` — nothing changes
//     from how the site worked before this feature existed.
//   ON: lib/cloudflare-image-loader.js starts requesting the -sm/-md
//     suffixed variants for smaller widths. Even then, the /media/
//     proxy (app/media/[...path]/route.ts) transparently falls back to
//     the original file if a variant doesn't exist yet — so turning
//     this on is safe to do at any time, backfilled or not. Images
//     without a variant yet simply keep serving at full size until the
//     "Generate Responsive Image Sizes" backfill reaches them; nothing
//     ever 404s.
//
// FAIL-SAFE DEFAULT
//   Any error reading the setting (Supabase unreachable, row missing,
//   etc.) resolves to `false` — the safe, original-behaviour state.
//   A failed read is never cached, so the next request retries.
// ---------------------------------------------------------------------

import { getServerSupabase } from '@/lib/supabase-server';

export interface ResponsiveImagesSettings {
  enabled: boolean;
}

export const DEFAULT_RESPONSIVE_IMAGES_SETTINGS: ResponsiveImagesSettings = {
  enabled: false,
};

const SETTINGS_KEY = 'responsive_images';
const CACHE_TTL_MS = 45_000;

let cache: { value: boolean; expiresAt: number } | null = null;

export async function getResponsiveImagesEnabledServer(): Promise<boolean> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) return cache.value;

  let enabled = false;
  try {
    const supabase = getServerSupabase();
    const { data } = await supabase
      .from('settings')
      .select('value')
      .eq('key', SETTINGS_KEY)
      .maybeSingle();
    const v = data?.value as Partial<ResponsiveImagesSettings> | undefined;
    if (typeof v?.enabled === 'boolean') enabled = v.enabled;
  } catch {
    // Fail open to the SAFE (disabled) state; don't cache the failure so
    // the very next request tries Supabase again instead of being stuck.
    return false;
  }

  cache = { value: enabled, expiresAt: now + CACHE_TTL_MS };
  return enabled;
}

/**
 * Makes the current value available synchronously to the (isomorphic)
 * custom image loader, which cannot itself await a database call. Call
 * this once per request from the root layout — before children render —
 * so every <Image> rendered on the server during that request sees a
 * consistent value. This is a single app-wide switch (not per-user), so
 * a shared module-level global is safe, same pattern already used for
 * the media-delivery settings cache in app/media/[...path]/route.ts.
 */
export function syncResponsiveImagesServerGlobal(enabled: boolean): void {
  (globalThis as unknown as Record<string, unknown>).__RESPONSIVE_IMAGES_ENABLED__ = enabled;
}
