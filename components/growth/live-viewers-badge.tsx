'use client';

import { useEffect, useState } from 'react';
import { Eye } from 'lucide-react';
import { fetchGrowthSettings, fetchLiveViewerCount } from '@/lib/growth-api';

const POLL_MS = 60000;

/**
 * "12 people are viewing this right now" — real count of distinct
 * sessions that viewed this exact product in the last N minutes (see
 * app/api/live-viewers/route.ts). Admin toggle + window + minimum-to-show
 * live under Admin > Marketing > Growth Tools > Live Viewers.
 *
 * Hidden entirely when the real count is below the admin's configured
 * minimum, so a single visitor never sees "1 person viewing this" —
 * the badge only ever shows a real number, it just stays quiet when
 * that number wouldn't look convincing.
 */
export default function LiveViewersBadge({ productId }: { productId: string | undefined }) {
  const [enabled, setEnabled] = useState(false);
  const [minToShow, setMinToShow] = useState(2);
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetchGrowthSettings()
      .then((s) => {
        if (cancelled) return;
        setEnabled(!!s.live_viewers_enabled);
        setMinToShow(s.live_viewers_min_to_show ?? 2);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!enabled || !productId) return;
    let cancelled = false;

    const poll = () => {
      fetchLiveViewerCount(productId).then((c) => {
        if (!cancelled) setCount(c);
      });
    };

    poll();
    const interval = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [enabled, productId]);

  if (!enabled || !productId || count < minToShow) return null;

  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-primary">
      <Eye className="h-3.5 w-3.5 shrink-0" />
      {count} people are viewing this right now
    </span>
  );
}
