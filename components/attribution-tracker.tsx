'use client';

import { useEffect } from 'react';
import { captureAttribution } from '@/lib/attribution';

/**
 * Mounted once near the root of the app (see components/providers.tsx).
 * On each FULL page load it records where the visitor came from (Google Ads,
 * Google organic, ChatGPT, Instagram, ...) so it can be attached to their
 * order at checkout. Runs once on purpose: document.referrer only describes
 * the initial page load, not client-side route changes. Renders nothing.
 * See lib/attribution.ts for the rules and the privacy notes.
 */
export default function AttributionTracker() {
  useEffect(() => {
    captureAttribution();
  }, []);

  return null;
}
