'use client';

import { useEffect } from 'react';
import { setGtagUserData } from '@/lib/gtag-track';

interface PurchaseTrackerItem {
  product_id: string | null;
  product_name: string;
  price: number;
  quantity: number;
  // Colour/size-matched id from the Merchant Center feed (see
  // lib/gtag-track.ts's feedMatchedItemId). Falls back to product_id for
  // orders placed before this field existed.
  feed_item_id?: string | null;
}

interface PurchaseTrackerProps {
  orderId: string;
  value: number;
  shipping?: number;
  tax?: number;
  couponCode?: string | null;
  items: PurchaseTrackerItem[];
  // Enhanced Conversions — customer data used to improve conversion
  // match rate in Google Ads. All optional; omit whatever isn't
  // available and Google Ads will use what it gets.
  customerEmail?: string | null;
  customerPhone?: string | null;
  customerName?: string | null;
  shippingCity?: string | null;
  shippingState?: string | null;
  shippingPostalCode?: string | null;
}

/**
 * Fires the GA4 ecommerce "purchase" event once the order-confirmation
 * page loads. Renders nothing — it's a side-effect-only component.
 *
 * Guarded with sessionStorage so refreshing this page (or the user
 * coming back to it later) never reports the same order twice.
 *
 * The GA4 script tag loads with Next's `afterInteractive` strategy, which
 * can finish loading slightly *after* this component's effect runs on the
 * very first paint. So instead of giving up when `window.gtag` isn't ready
 * yet, we retry for a few seconds — and only set the "already tracked"
 * flag once the event has actually been sent.
 */
export default function PurchaseTracker({
  orderId,
  value,
  shipping,
  tax,
  couponCode,
  items,
  customerEmail,
  customerPhone,
  customerName,
  shippingCity,
  shippingState,
  shippingPostalCode,
}: PurchaseTrackerProps) {
  useEffect(() => {
    const dedupeKey = `ga4_purchase_${orderId}`;
    try {
      if (sessionStorage.getItem(dedupeKey)) return;
    } catch {
      // sessionStorage unavailable (e.g. private mode) — fall through and track anyway.
    }

    let attempts = 0;
    const maxAttempts = 20; // ~10s total at 500ms apart — gtag.js is on a slow connection at worst.
    let timer: ReturnType<typeof setTimeout>;

    const tryFire = () => {
      const gtag = (window as any).gtag;
      if (typeof gtag === 'function') {
        // Enhanced Conversions: set customer data *before* firing the
        // conversion event so this "purchase" carries it. gtag.js hashes
        // email/phone (SHA256) itself — we send plain values.
        const [firstName, ...rest] = (customerName ?? '').trim().split(/\s+/).filter(Boolean);
        const lastName = rest.join(' ') || undefined;
        setGtagUserData({
          email: customerEmail,
          phone: customerPhone,
          firstName: firstName || undefined,
          lastName,
          city: shippingCity,
          region: shippingState,
          postalCode: shippingPostalCode,
        });

        gtag('event', 'purchase', {
          transaction_id: orderId,
          value,
          currency: 'INR',
          shipping: shipping ?? 0,
          tax: tax ?? 0,
          coupon: couponCode ?? undefined,
          items: items.map((item) => ({
            // Feed-matched id first, so this event lines up with
            // view_item/add_to_cart's item_id and Google Ads can match this
            // purchase back to the exact Merchant Center feed item (needed
            // for retail audience "already purchased" exclusion and
            // dynamic remarketing accuracy).
            item_id: item.feed_item_id ?? item.product_id ?? item.product_name,
            item_name: item.product_name,
            price: item.price,
            quantity: item.quantity,
          })),
        });
        try {
          sessionStorage.setItem(dedupeKey, '1');
        } catch {
          // ignore
        }
        return;
      }

      attempts += 1;
      if (attempts < maxAttempts) {
        timer = setTimeout(tryFire, 500);
      }
    };

    tryFire();

    return () => clearTimeout(timer);
  }, [
    orderId,
    value,
    shipping,
    tax,
    couponCode,
    items,
    customerEmail,
    customerPhone,
    customerName,
    shippingCity,
    shippingState,
    shippingPostalCode,
  ]);

  return null;
}
