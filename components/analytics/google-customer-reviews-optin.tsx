'use client';

import { useEffect } from 'react';
import { GCR_MERCHANT_ID } from '@/lib/google-customer-reviews';

interface GoogleCustomerReviewsOptInProps {
  orderId: string;
  email: string;
  deliveryCountry: string; // 2-letter ISO code, e.g. "IN"
  estimatedDeliveryDate: string; // YYYY-MM-DD
}

/**
 * Google Customer Reviews survey opt-in. Shows Google's small "Would you like
 * a survey about this order?" popup on the order-confirmation page. Customers
 * who say yes get a review email from Google after delivery; those reviews
 * build the Merchant Center store rating.
 *
 * Renders nothing itself (Google draws the popup). Same side-effect-only shape
 * as <PurchaseTracker /> and <TrustpilotInvitation />.
 *
 * Guarded with sessionStorage so refreshing the page does not re-show the
 * popup for the same order.
 */
export default function GoogleCustomerReviewsOptIn({
  orderId,
  email,
  deliveryCountry,
  estimatedDeliveryDate,
}: GoogleCustomerReviewsOptInProps) {
  useEffect(() => {
    if (!email) return; // Google needs the customer's email.

    const dedupeKey = `gcr_optin_${orderId}`;
    try {
      if (sessionStorage.getItem(dedupeKey)) return;
    } catch {
      // sessionStorage unavailable -- fall through and show anyway.
    }

    const w = window as any;

    const render = () => {
      if (!w.gapi?.load) return;
      w.gapi.load('surveyoptin', () => {
        w.gapi.surveyoptin.render({
          // REQUIRED
          merchant_id: GCR_MERCHANT_ID,
          order_id: orderId,
          email,
          delivery_country: deliveryCountry,
          estimated_delivery_date: estimatedDeliveryDate,
          // Products have no GTINs (feed uses identifier_exists=false), so the
          // optional "products" field is intentionally left out.
        });
        try {
          sessionStorage.setItem(dedupeKey, '1');
        } catch {
          // ignore
        }
      });
    };

    // platform.js calls window.renderOptIn once it has loaded.
    w.renderOptIn = render;

    if (w.gapi?.load) {
      // platform.js already on the page (client-side navigation).
      render();
      return;
    }

    if (!document.getElementById('gcr-platform-js')) {
      const s = document.createElement('script');
      s.id = 'gcr-platform-js';
      s.src = 'https://apis.google.com/js/platform.js?onload=renderOptIn';
      s.async = true;
      s.defer = true;
      document.body.appendChild(s);
    }
  }, [orderId, email, deliveryCountry, estimatedDeliveryDate]);

  return null;
}
