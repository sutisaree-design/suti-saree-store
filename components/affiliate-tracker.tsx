'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { captureAffiliateCode } from '@/lib/affiliate-api';

/**
 * Mounted once near the root of the app (see components/providers.tsx).
 * Watches for a ?aff=CODE query param on any page and, when present,
 * captures it into localStorage (30-day expiry — see
 * captureAffiliateCode in lib/affiliate-api.ts) so it can be sent along
 * with the order at checkout time, whenever that happens to be. Renders
 * nothing.
 */
export default function AffiliateTracker() {
  const searchParams = useSearchParams();

  useEffect(() => {
    const code = searchParams?.get('aff');
    if (code && code.trim()) {
      captureAffiliateCode(code.trim());
    }
  }, [searchParams]);

  return null;
}
