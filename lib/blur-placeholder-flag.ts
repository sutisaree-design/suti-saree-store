// ---------------------------------------------------------------------
// Blur Placeholder — two independent feature flags (Admin > Settings >
// Blur Placeholder).
//
// shimmer_enabled (default true): every product-gallery <Image> shows a
//   soft animated shimmer the instant it mounts, instead of a blank/white
//   box, while the real photo is still downloading — used as the
//   fallback whenever no real per-image preview is being shown. This is
//   a GENERIC placeholder (a tiny inline SVG, not a preview of the
//   actual photo) — so unlike Responsive Images it needs NO backfill and
//   applies to every image, old or new, the moment it's turned on. See
//   lib/image-placeholder.ts for the shimmer itself.
//
// real_preview_enabled (default true): whenever a real per-image blur
//   preview has already been generated for a photo (see
//   lib/blur-preview.ts and the "Generate Real Photo Previews" backfill),
//   use that instead of the generic shimmer. Turning this off does NOT
//   stop generation — the backfill still runs and stores previews — it
//   only stops the storefront from displaying them, so every photo falls
//   back to whatever shimmer_enabled decides.
//
// The two combine via lib/image-placeholder.ts's resolveBlurDataUrl():
//   real preview available AND real_preview_enabled -> show it
//   otherwise, shimmer_enabled                        -> generic shimmer
//   otherwise                                          -> no placeholder
//
// FAIL-SAFE DEFAULT
//   Any error reading the setting (Supabase unreachable, row missing,
//   etc.) resolves both flags to `true` — the safer choice for a purely
//   cosmetic loading-state feature, since showing a shimmer/preview can
//   never break a page the way a broken image URL could. Same
//   cache/global-sync pattern as lib/responsive-images-flag.ts.
// ---------------------------------------------------------------------

import { getServerSupabase } from '@/lib/supabase-server';

export interface BlurPlaceholderSettings {
  shimmer_enabled: boolean;
  real_preview_enabled: boolean;
}

export const DEFAULT_BLUR_PLACEHOLDER_SETTINGS: BlurPlaceholderSettings = {
  shimmer_enabled: true,
  real_preview_enabled: true,
};

/**
 * Normalizes whatever's stored under the `blur_placeholder` settings key
 * into the current two-flag shape — including the legacy single
 * `{ enabled: boolean }` shape this key used before the shimmer/real
 * preview toggles were split apart, so existing rows in the `settings`
 * table keep working with no migration needed.
 */
export function coerceBlurPlaceholderSettings(
  value: (Partial<BlurPlaceholderSettings> & { enabled?: boolean }) | null | undefined
): BlurPlaceholderSettings {
  if (!value) return { ...DEFAULT_BLUR_PLACEHOLDER_SETTINGS };
  // Legacy row: only `enabled` was ever stored, controlling both shimmer
  // and real-preview display together.
  if (typeof value.shimmer_enabled !== 'boolean' && typeof value.real_preview_enabled !== 'boolean' && typeof value.enabled === 'boolean') {
    return { shimmer_enabled: value.enabled, real_preview_enabled: value.enabled };
  }
  return {
    shimmer_enabled: typeof value.shimmer_enabled === 'boolean' ? value.shimmer_enabled : DEFAULT_BLUR_PLACEHOLDER_SETTINGS.shimmer_enabled,
    real_preview_enabled: typeof value.real_preview_enabled === 'boolean' ? value.real_preview_enabled : DEFAULT_BLUR_PLACEHOLDER_SETTINGS.real_preview_enabled,
  };
}

const SETTINGS_KEY = 'blur_placeholder';
const CACHE_TTL_MS = 45_000;

let cache: { value: BlurPlaceholderSettings; expiresAt: number } | null = null;

export async function getBlurPlaceholderSettingsServer(): Promise<BlurPlaceholderSettings> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) return cache.value;

  let settings: BlurPlaceholderSettings = { ...DEFAULT_BLUR_PLACEHOLDER_SETTINGS };
  try {
    const supabase = getServerSupabase();
    const { data } = await supabase
      .from('settings')
      .select('value')
      .eq('key', SETTINGS_KEY)
      .maybeSingle();
    settings = coerceBlurPlaceholderSettings(data?.value as Partial<BlurPlaceholderSettings> | undefined);
  } catch {
    // Fail open to the safe default; don't cache the failure so the
    // very next request tries Supabase again instead of being stuck.
    return { ...DEFAULT_BLUR_PLACEHOLDER_SETTINGS };
  }

  cache = { value: settings, expiresAt: now + CACHE_TTL_MS };
  return settings;
}

/**
 * Makes the current values available synchronously to client components
 * (ProductGallery is 'use client' and can't await a database call).
 * Call this once per request from the root layout — before children
 * render — mirroring syncResponsiveImagesServerGlobal().
 */
export function syncBlurPlaceholderServerGlobal(settings: BlurPlaceholderSettings): void {
  const g = globalThis as unknown as Record<string, unknown>;
  g.__BLUR_SHIMMER_ENABLED__ = settings.shimmer_enabled;
  g.__BLUR_REAL_PREVIEW_ENABLED__ = settings.real_preview_enabled;
}
