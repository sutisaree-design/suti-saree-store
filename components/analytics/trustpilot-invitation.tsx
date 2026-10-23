'use client';

import { useEffect } from 'react';

interface TrustpilotInvitationProps {
  orderId: string;
  recipientEmail: string;
  recipientName: string;
}

/**
 * Fires a Trustpilot "createInvitation" call once the order-confirmation
 * page loads, so the customer gets an automatic review-request email a
 * few days later. Renders nothing — it's a side-effect-only component,
 * same shape as <PurchaseTracker /> right next to it.
 *
 * Guarded with sessionStorage so refreshing this page (or coming back to
 * it later) never queues a second invitation for the same order.
 *
 * `window.tp` comes from the Trustpilot base script registered in
 * app/layout.tsx (Trustpilot > Integrations > Ecommerce > JavaScript
 * Integration). That script loads with `afterInteractive`, which can
 * finish slightly *after* this component's effect runs on first paint —
 * so, same as the GA4 purchase event, this retries for a few seconds
 * instead of giving up if `tp` isn't defined yet.
 */
export default function TrustpilotInvitation({ orderId, recipientEmail, recipientName }: TrustpilotInvitationProps) {
  useEffect(() => {
    if (!recipientEmail) return; // guest/edge-case orders with no email on file — nothing to send to.

    const dedupeKey = `trustpilot_invite_${orderId}`;
    try {
      if (sessionStorage.getItem(dedupeKey)) return;
    } catch {
      // sessionStorage unavailable (e.g. private mode) — fall through and send anyway.
    }

    let attempts = 0;
    const maxAttempts = 20; // ~10s total at 500ms apart — tp.min.js is on a slow connection at worst.
    let timer: ReturnType<typeof setTimeout>;

    const tryFire = () => {
      const tp = (window as any).tp;
      if (typeof tp === 'function') {
        tp('createInvitation', {
          recipientEmail,
          recipientName,
          referenceId: orderId,
          source: 'InvitationScript',
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
  }, [orderId, recipientEmail, recipientName]);

  return null;
}
