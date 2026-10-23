'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { trackEvent } from '@/lib/track-api';

/**
 * Mounted once near the root of the app. Logs a `page_view` activity event
 * every time the route changes, so Admin > Analytics can show which pages
 * customers visit and Admin > Customers can show individual browsing
 * behaviour. Renders nothing.
 */
export default function ActivityTracker() {
  const pathname = usePathname();
  const { user } = useAuth();

  useEffect(() => {
    if (!pathname) return;
    // Skip logging admin's own navigation around the dashboard.
    if (pathname.startsWith('/admin')) return;
    trackEvent('page_view', { pagePath: pathname, userId: user?.id ?? null });
  }, [pathname, user?.id]);

  return null;
}
