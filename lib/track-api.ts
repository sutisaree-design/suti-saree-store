'use client';

import { supabase } from './supabase';
import { ActivityEventType } from './types';

const SESSION_KEY = 'saaj_session_id';

/**
 * Every browser tab/visit gets a random session id kept in sessionStorage
 * (cleared when the tab closes). This is how we stitch together "what did
 * this visitor look at" without requiring the shopper to log in.
 */
export function getSessionId(): string {
  if (typeof window === 'undefined') return 'server';
  try {
    let id = window.sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      window.sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    // Storage disabled (private mode etc.) — fall back to a per-call id.
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

interface TrackOptions {
  pagePath?: string;
  productId?: string;
  orderId?: string;
  userId?: string | null;
  metadata?: Record<string, any>;
}

// Set by /api/track/click/<sendId> (a non-httpOnly cookie) when a visitor
// arrives here via a link inside a WooCommerce campaign email. Reading it
// here means every event this visitor triggers afterwards (page_view,
// product_view, purchase, ...) gets tagged with the same send id, which is
// how the admin's cold/warm/hot audience view knows this person actually
// browsed the site (warm) or went on to view 2+ pages / buy (hot) after
// that specific email.
function getCampaignSendId(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/(?:^|;\s*)wc_sid=([0-9a-f-]{36})/i);
  return match ? match[1] : null;
}

/**
 * Fire-and-forget event log used by the Admin > Analytics dashboard for
 * sales trends, top products, conversion rate and customer behaviour.
 * Never throws — a failed tracking call should never break the storefront.
 */
export async function trackEvent(eventType: ActivityEventType, options: TrackOptions = {}) {
  try {
    await supabase.from('activity_events').insert({
      session_id: getSessionId(),
      user_id: options.userId ?? null,
      event_type: eventType,
      page_path: options.pagePath ?? null,
      product_id: options.productId ?? null,
      order_id: options.orderId ?? null,
      metadata: options.metadata ?? {},
      campaign_send_id: getCampaignSendId(),
    });
  } catch {
    // best-effort only
  }
}
