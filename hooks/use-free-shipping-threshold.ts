'use client';

import { useEffect, useState } from 'react';
import { fetchShippingSettings, DEFAULT_SHIPPING_SETTINGS } from '@/lib/pincode-api';

// A shop/catalog grid can render dozens of <ProductCard> at once. Without
// this, each one calling fetchShippingSettings() in its own effect would
// fire that many duplicate requests for the exact same admin-set number.
// Caching the resolved value (and de-duping any requests that overlap
// while it's still in flight) means the whole page only ever fetches it
// once per session.
let cachedThreshold: number | null = null;
let inFlight: Promise<number> | null = null;

function getThreshold(): Promise<number> {
  if (cachedThreshold !== null) return Promise.resolve(cachedThreshold);
  if (!inFlight) {
    inFlight = fetchShippingSettings()
      .then((s) => {
        cachedThreshold = s.free_shipping_threshold;
        return cachedThreshold;
      })
      .catch(() => DEFAULT_SHIPPING_SETTINGS.free_shipping_threshold)
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}

/**
 * Returns the live "free shipping above ₹X" threshold from Admin >
 * Settings > Shipping (the same number checkout and the cart page use),
 * or `undefined` while it's still loading. A caller can compare a
 * product's price against this to decide whether to show a "Free
 * Delivery" badge -- so the badge is never shown for a product that
 * would actually get charged shipping at checkout.
 */
export function useFreeShippingThreshold(): number | undefined {
  const [threshold, setThreshold] = useState<number | undefined>(cachedThreshold ?? undefined);

  useEffect(() => {
    if (cachedThreshold !== null) {
      setThreshold(cachedThreshold);
      return;
    }
    let cancelled = false;
    getThreshold().then((t) => {
      if (!cancelled) setThreshold(t);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return threshold;
}

/** True once we know the threshold and this price clears it (0 threshold
 *  means shipping is free on every order). Returns false while loading,
 *  so the badge only appears once we're sure it's accurate. */
export function qualifiesForFreeDelivery(price: number, threshold: number | undefined): boolean {
  if (threshold === undefined) return false;
  return threshold === 0 || price >= threshold;
}
