'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, TimerReset } from 'lucide-react';
import { fetchMyStockHoldTimers, type StockHoldRow } from '@/lib/vendor-api';

function countdown(hold_deadline: string) {
  const diffMs = new Date(hold_deadline).getTime() - Date.now();
  const diffDays = Math.round(Math.abs(diffMs) / 86_400_000);
  if (diffMs > 0) {
    return { label: `${diffDays} din baaki`, className: 'bg-green-50 text-green-700 border-green-200' };
  }
  return { label: `${diffDays} din overdue`, className: 'bg-red-50 text-red-700 border-red-200' };
}

/**
 * "Stock Hold Timers" — vendor ka apna view of every returned/RTO unit
 * currently sitting in the warehouse hold window (green countdown), or
 * already past it and sent to Return to Vendor (red). Mirrors the
 * admin's Vendor Ops > Stock Hold Timers tab, scoped to this vendor.
 */
export default function StockHoldTimers() {
  const [rows, setRows] = useState<StockHoldRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMyStockHoldTimers()
      .then(setRows)
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading stock hold timers…
      </div>
    );
  }

  if (rows.length === 0) return null; // nothing currently holding — no need to clutter the page

  return (
    <div className="rounded-lg border border-border/60 bg-card p-4">
      <p className="flex items-center gap-2 text-sm font-medium text-primary">
        <TimerReset className="h-4 w-4" /> Stock Hold Timers
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Returned/RTO items currently in your warehouse hold window. Change the window in{' '}
        <Link href="/vendor/dashboard/settings" className="underline">
          Settings
        </Link>
        .
      </p>
      <div className="mt-3 space-y-2">
        {rows.map((row) => {
          const c = countdown(row.hold_deadline);
          return (
            <div
              key={row.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/50 bg-muted/20 p-2.5 text-sm"
            >
              <div>
                <p className="font-medium text-foreground">{row.product_name}</p>
                <p className="text-xs text-muted-foreground">
                  {row.source === 'rto' ? 'RTO' : 'Returned'} on{' '}
                  {new Date(row.returned_at).toLocaleDateString('en-IN')} · hold window {row.hold_days} din
                </p>
              </div>
              <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${c.className}`}>
                {c.label}
                {row.status === 'flagged' ? ' · sent to Return to Vendor' : ''}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
