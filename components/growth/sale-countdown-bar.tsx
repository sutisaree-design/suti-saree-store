'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Clock } from 'lucide-react';
import { fetchGrowthSettings, GrowthSettings } from '@/lib/growth-api';

function splitTime(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  return {
    hours: Math.floor(totalSeconds / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
  };
}

export default function SaleCountdownBar({ initialSettings }: { initialSettings?: GrowthSettings }) {
  const pathname = usePathname();
  const [settings, setSettings] = useState<GrowthSettings | null>(initialSettings ?? null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (initialSettings) return; // already provided by the server
    fetchGrowthSettings()
      .then(setSettings)
      .catch(() => {});
  }, [initialSettings]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  if (pathname?.startsWith('/admin')) return null;
  if (!settings?.sale_countdown_enabled || !settings.sale_countdown_end_at) return null;

  const endAt = new Date(settings.sale_countdown_end_at).getTime();
  const remaining = endAt - now;
  if (remaining <= 0) return null;

  const { hours, minutes, seconds } = splitTime(remaining);
  const pad = (n: number) => String(n).padStart(2, '0');

  return (
    <div className="flex items-center justify-center gap-2 bg-secondary px-4 py-2 text-xs font-medium text-secondary-foreground sm:text-sm">
      <Clock className="h-4 w-4 shrink-0" />
      <span>{settings.sale_countdown_text}</span>
      {/* suppressHydrationWarning: the server's clock and the browser's differ by a
          few seconds, so the digits legitimately differ on first paint. */}
      <span className="font-mono font-bold tabular-nums" suppressHydrationWarning>
        {pad(hours)}:{pad(minutes)}:{pad(seconds)}
      </span>
    </div>
  );
}
