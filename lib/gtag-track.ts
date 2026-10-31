/**
 * Fires a GA4 / Google Ads gtag event, retrying for a few seconds if
 * `window.gtag` isn't defined yet.
 *
 * Google's gtag.js loads with Next's `afterInteractive` strategy, which
 * can finish loading slightly *after* the very first user interaction on
 * a page — e.g. someone tapping "Add to Cart" the instant a product page
 * renders, or the checkout page's mount effect firing before the script
 * tag has executed. A one-shot `typeof window.gtag === 'function'` check
 * at that moment fails, gtag is never called, and the event is silently
 * lost — even though the user genuinely did the thing.
 *
 * This mirrors the retry approach already used by `PurchaseTracker` for
 * the `purchase` event, so `add_to_cart` / `begin_checkout` (and any
 * other event fired via this helper) get the same reliability.
 */
export function fireGtagEvent(eventName: string, params: Record<string, unknown>): void {
  if (typeof window === 'undefined') return;

  let attempts = 0;
  const maxAttempts = 20; // ~10s total at 500ms apart — matches PurchaseTracker.

  const tryFire = () => {
    const gtag = (window as any).gtag;
    if (typeof gtag === 'function') {
      gtag('event', eventName, params);
      // Optional Google Ads conversions for add_to_cart / begin_checkout
      // (labels are set in Admin > Integrations; nothing happens when empty).
      fireAdsConversionForEvent(eventName, params);
      return;
    }
    attempts += 1;
    if (attempts < maxAttempts) {
      setTimeout(tryFire, 500);
    }
  };

  tryFire();
  // Meta Pixel standard event with the same data (no-op when the pixel is off).
  fireMetaEventForGtag(eventName, params);
}

// ---------------------------------------------------------------------------
// Admin > Integrations: Google Ads conversions + Meta Pixel standard events
// ---------------------------------------------------------------------------

interface TrackingConfig {
  adsId?: string;
  purchaseLabel?: string;
  addToCartLabel?: string;
  beginCheckoutLabel?: string;
  enhanced?: boolean;
  pixel?: boolean;
  metaEvents?: boolean;
}

/** Config injected by components/analytics-scripts.tsx from Admin > Integrations. */
export function getTrackingConfig(): TrackingConfig {
  if (typeof window === 'undefined') return {};
  return ((window as any).__TRACKING__ as TrackingConfig) || {};
}

/** Fires the Google Ads conversion event for `label`, if an Ads ID + label are configured. */
export function fireAdsConversion(label: string | undefined, payload: { value?: number; transactionId?: string }): void {
  const cfg = getTrackingConfig();
  const gtag = (window as any).gtag;
  if (!cfg.adsId || !label || typeof gtag !== 'function') return;
  gtag('event', 'conversion', {
    send_to: `${cfg.adsId}/${label}`,
    value: payload.value ?? 0,
    currency: 'INR',
    ...(payload.transactionId ? { transaction_id: payload.transactionId } : {}),
  });
}

function fireAdsConversionForEvent(eventName: string, params: Record<string, unknown>): void {
  const cfg = getTrackingConfig();
  const value = typeof params.value === 'number' ? params.value : undefined;
  if (eventName === 'add_to_cart') fireAdsConversion(cfg.addToCartLabel, { value });
  else if (eventName === 'begin_checkout') fireAdsConversion(cfg.beginCheckoutLabel, { value });
}

/** Sends a Meta Pixel event, retrying while fbevents.js is still loading (it loads after first interaction). */
export function fireMetaEvent(name: string, params: Record<string, unknown>, eventId?: string): void {
  if (typeof window === 'undefined') return;
  let attempts = 0;
  const maxAttempts = 20;
  const tryFire = () => {
    const cfg = getTrackingConfig();
    if (!cfg.metaEvents) return;
    const fbq = (window as any).fbq;
    if (typeof fbq === 'function') {
      if (eventId) fbq('track', name, params, { eventID: eventId });
      else fbq('track', name, params);
      return;
    }
    attempts += 1;
    if (attempts < maxAttempts) setTimeout(tryFire, 500);
  };
  tryFire();
}

function fireMetaEventForGtag(eventName: string, params: Record<string, unknown>): void {
  const map: Record<string, string> = {
    view_item: 'ViewContent',
    add_to_cart: 'AddToCart',
    begin_checkout: 'InitiateCheckout',
  };
  const metaName = map[eventName];
  if (!metaName) return;
  const items = Array.isArray(params.items) ? (params.items as any[]) : [];
  const ids = items.map((i) => String(i.item_id ?? '')).filter(Boolean);
  fireMetaEvent(metaName, {
    content_ids: ids,
    content_type: 'product',
    value: typeof params.value === 'number' ? params.value : undefined,
    currency: (params.currency as string) || 'INR',
    num_items: items.reduce((n, i) => n + (Number(i.quantity) || 1), 0) || undefined,
  });
}

/**
 * Builds the exact same `id` string that app/api/merchant-feed/route.ts
 * uses for a given color-variant + size in the Google Merchant Center
 * feed (`<g:id>`).
 *
 * Google Ads' Retail audiences ("Product viewers", "Shopping cart
 * abandoners", etc.) and Performance Max's dynamic remarketing creative
 * both work by matching the `item_id` sent in GA4/gtag events against
 * the `id` of a product in your linked Merchant Center feed. If the two
 * don't match, Google can't reliably find *that exact item* to show back
 * to the shopper — it falls back to a generic ad instead of "here's the
 * blue saree, size M, you looked at".
 *
 * Previously `view_item` / `add_to_cart` sent the base `product.id`,
 * but the feed's `<g:id>` is per colour-variant (and per size, when
 * sizes exist) — e.g. `<variantId>-M` — never the bare product id. This
 * keeps both in sync from one place so they can't drift apart again.
 *
 * Mirrors app/api/merchant-feed/route.ts exactly:
 *   - no colour variants at all           -> product.id
 *   - variant with no sizes recorded      -> variant.id
 *   - variant + size                      -> `${variant.id}-${sizeSlug}`
 *     where sizeSlug = size with whitespace stripped, capped at 10 chars
 *     (same 50-char Merchant Center `id` limit the feed respects).
 */
export function feedMatchedItemId(
  productId: string,
  variant: { id: string; sizes?: unknown[] } | null | undefined,
  selectedSize: string | null | undefined
): string {
  if (!variant) return productId;
  if (!variant.sizes || variant.sizes.length === 0) return variant.id;
  if (!selectedSize) return variant.id;
  const sizeSlug = selectedSize.replace(/\s+/g, '').slice(0, 10);
  return `${variant.id}-${sizeSlug}`;
}

/**
 * Shape of the customer-provided data Google Ads uses for Enhanced
 * Conversions. Send plain values here — Google's gtag.js hashes them
 * (SHA256) client-side before anything leaves the browser, so we never
 * need to hash ourselves. See:
 * https://support.google.com/google-ads/answer/13258081
 */
export interface GtagUserData {
  email?: string | null;
  phone?: string | null; // any format — normalizeIndianPhoneE164() below cleans it up
  firstName?: string | null;
  lastName?: string | null;
  street?: string | null;
  city?: string | null;
  region?: string | null; // state
  postalCode?: string | null;
  country?: string | null; // ISO 3166-1 alpha-2, defaults to 'IN'
}

/**
 * Converts a loosely-formatted Indian phone number ("98765 43210",
 * "09876543210", "+91-98765-43210"...) into the E.164 format
 * (+919876543210) that Google Ads Enhanced Conversions requires.
 * Returns null if it doesn't look like a valid 10-digit Indian number.
 */
export function normalizeIndianPhoneE164(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 11 && digits.startsWith('0')) return `+91${digits.slice(1)}`;
  if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`;
  if (digits.length === 13 && digits.startsWith('091')) return `+91${digits.slice(3)}`;
  return null;
}

/**
 * Sets Enhanced Conversions customer data via gtag('set', 'user_data', ...)
 * so subsequent conversion events (fired right after, via fireGtagEvent)
 * carry it. Retries the same way fireGtagEvent does, in case gtag.js is
 * still loading. Silently no-ops for any field that isn't provided —
 * Google Ads only needs email OR phone at minimum, more improves match rate.
 */
export function setGtagUserData(data: GtagUserData): void {
  if (typeof window === 'undefined') return;

  const email = data.email?.trim().toLowerCase() || undefined;
  const phone = normalizeIndianPhoneE164(data.phone) || undefined;
  const hasAddress = data.firstName || data.lastName || data.street || data.city || data.region || data.postalCode;

  if (!email && !phone && !hasAddress) return; // nothing usable to send

  const userData: Record<string, unknown> = {};
  if (email) userData.email = email;
  if (phone) userData.phone_number = phone;
  if (hasAddress) {
    userData.address = {
      first_name: data.firstName || undefined,
      last_name: data.lastName || undefined,
      street: data.street || undefined,
      city: data.city || undefined,
      region: data.region || undefined,
      postal_code: data.postalCode || undefined,
      country: data.country || 'IN',
    };
  }

  let attempts = 0;
  const maxAttempts = 20;

  const trySet = () => {
    const gtag = (window as any).gtag;
    if (typeof gtag === 'function') {
      gtag('set', 'user_data', userData);
      return;
    }
    attempts += 1;
    if (attempts < maxAttempts) {
      setTimeout(trySet, 500);
    }
  };

  trySet();
}
