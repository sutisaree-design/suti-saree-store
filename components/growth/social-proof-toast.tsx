'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { ShoppingBag } from 'lucide-react';
import { fetchGrowthSettings, fetchSocialProofFeed, SocialProofEvent } from '@/lib/growth-api';

const DISPLAY_MS = 5000;
const GAP_MS = 7000;
const FIRST_DELAY_MS = 3000;

function relativeTime(minutesAgo: number) {
  if (minutesAgo < 60) return `${minutesAgo} min${minutesAgo === 1 ? '' : 's'} ago`;
  const hours = Math.round(minutesAgo / 60);
  return `${hours} hour${hours === 1 ? '' : 's'} ago`;
}

export default function SocialProofToast() {
  const pathname = usePathname();
  const [enabled, setEnabled] = useState(false);
  const [events, setEvents] = useState<SocialProofEvent[]>([]);
  const [index, setIndex] = useState(-1);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    fetchGrowthSettings()
      .then((s) => {
        setEnabled(!!s.social_proof_enabled);
        if (s.social_proof_enabled) {
          fetchSocialProofFeed().then(setEvents).catch(() => {});
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!enabled || events.length === 0 || pathname?.startsWith('/admin')) return;

    let cycle: ReturnType<typeof setInterval>;
    const first = setTimeout(() => {
      setIndex(0);
      setVisible(true);
      cycle = setInterval(() => {
        setVisible(false);
        setTimeout(() => {
          setIndex((i) => (i + 1) % events.length);
          setVisible(true);
        }, 400);
      }, GAP_MS);
    }, FIRST_DELAY_MS);

    return () => {
      clearTimeout(first);
      if (cycle) clearInterval(cycle);
    };
  }, [enabled, events, pathname]);

  // Auto-hide each toast after DISPLAY_MS within the visible window.
  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(() => setVisible(false), DISPLAY_MS);
    return () => clearTimeout(t);
  }, [visible, index]);

  if (pathname?.startsWith('/admin') || !enabled || index < 0 || !events[index]) return null;

  const event = events[index];

  return (
    <div
      className={`fixed bottom-6 left-4 z-40 max-w-xs rounded-lg border border-border bg-card px-4 py-3 shadow-lg transition-all duration-300 ${
        visible ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0'
      }`}
      role="status"
    >
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <ShoppingBag className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium leading-snug text-foreground">
            Someone{event.city ? ` in ${event.city}` : ''} just bought{' '}
            <span className="font-semibold">{event.product_name}</span>
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{relativeTime(event.minutes_ago)}</p>
        </div>
      </div>
    </div>
  );
}
