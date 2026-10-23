'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAdminFocus } from './use-admin-focus';
import { toast } from 'sonner';
import {
  Loader2,
  RotateCcw,
  PackagePlus,
  Gauge,
  AlarmClockOff,
  CheckCircle2,
  TimerReset,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  fetchReturnToVendorQueue,
  fetchRestockSuggestions,
  fetchVendorPerformance,
  fetchStaleInventory,
  fetchStockHoldTimers,
  markReturnToVendorResolved,
  type ReturnToVendorRow,
  type RestockSuggestionRow,
  type VendorPerformanceRow,
  type StaleInventoryRow,
  type StockHoldRow,
} from '@/lib/vendor-api';

type TabKey = 'return-to-vendor' | 'stock-holds' | 'restock' | 'performance' | 'stale';

const TABS: { value: TabKey; label: string; icon: typeof RotateCcw }[] = [
  { value: 'return-to-vendor', label: 'Return to Vendor', icon: RotateCcw },
  { value: 'stock-holds', label: 'Stock Hold Timers', icon: TimerReset },
  { value: 'restock', label: 'Restock Suggested', icon: PackagePlus },
  { value: 'performance', label: 'Vendor Performance', icon: Gauge },
  { value: 'stale', label: 'Stale Inventory', icon: AlarmClockOff },
];

const REASON_META: Record<ReturnToVendorRow['reason'], { label: string; className: string }> = {
  never_sold_90d: { label: 'Never Sold — 90 din', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  cancelled_returned_60d: {
    label: 'Cancelled/Returned — 60 din',
    className: 'bg-orange-50 text-orange-700 border-orange-200',
  },
  offboarding: { label: 'Vendor Off-boarded', className: 'bg-red-50 text-red-700 border-red-200' },
  returned_2x_consent: {
    label: 'Same product returned/RTO 2x',
    className: 'bg-red-50 text-red-700 border-red-200',
  },
  unsold_after_return: {
    label: "Unsold past vendor's hold window",
    className: 'bg-rose-50 text-rose-700 border-rose-200',
  },
};

function pct(n: number | null | undefined) {
  return n === null || n === undefined ? '—' : `${n}%`;
}

function minutesToReadable(m: number | null | undefined) {
  if (m === null || m === undefined) return '—';
  if (m < 60) return `${Math.round(m)} min`;
  const hours = m / 60;
  if (hours < 24) return `${hours.toFixed(1)} hrs`;
  return `${(hours / 24).toFixed(1)} days`;
}

// Green while there's still time left in the vendor's hold window, red
// once the deadline has passed — shown on both the Return to Vendor
// "unsold_after_return" rows and every row in the Stock Hold Timers tab.
function holdCountdown(hold_deadline: string) {
  const diffMs = new Date(hold_deadline).getTime() - Date.now();
  const diffDays = Math.round(Math.abs(diffMs) / 86_400_000);
  if (diffMs > 0) {
    return { label: `${diffDays} din baaki`, className: 'bg-green-50 text-green-700 border-green-200' };
  }
  return { label: `${diffDays} din overdue`, className: 'bg-red-50 text-red-700 border-red-200' };
}

export default function VendorOpsPanel() {
  const [tab, setTab] = useState<TabKey>('return-to-vendor');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [rtvRows, setRtvRows] = useState<ReturnToVendorRow[]>([]);
  const [stockHoldRows, setStockHoldRows] = useState<StockHoldRow[]>([]);
  const [restockRows, setRestockRows] = useState<RestockSuggestionRow[]>([]);
  const [performanceRows, setPerformanceRows] = useState<VendorPerformanceRow[]>([]);
  const [staleRows, setStaleRows] = useState<StaleInventoryRow[]>([]);

  // Bell deep link ("Return to Vendor — pending"): open that tab, highlight the row.
  const focusId = useAdminFocus(!loading && rtvRows.length > 0);
  useEffect(() => {
    if (focusId) setTab('return-to-vendor');
  }, [focusId]);

  const load = async (which: TabKey) => {
    setLoading(true);
    try {
      if (which === 'return-to-vendor') setRtvRows(await fetchReturnToVendorQueue());
      if (which === 'stock-holds') setStockHoldRows(await fetchStockHoldTimers());
      if (which === 'restock') setRestockRows(await fetchRestockSuggestions());
      if (which === 'performance') setPerformanceRows(await fetchVendorPerformance());
      if (which === 'stale') setStaleRows(await fetchStaleInventory());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(tab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const neverSold = useMemo(() => rtvRows.filter((r) => r.reason === 'never_sold_90d'), [rtvRows]);
  const cancelledReturned = useMemo(
    () => rtvRows.filter((r) => r.reason === 'cancelled_returned_60d'),
    [rtvRows]
  );
  const returned2x = useMemo(() => rtvRows.filter((r) => r.reason === 'returned_2x_consent'), [rtvRows]);
  const unsoldAfterReturn = useMemo(
    () => rtvRows.filter((r) => r.reason === 'unsold_after_return'),
    [rtvRows]
  );
  const offboarded = useMemo(() => rtvRows.filter((r) => r.reason === 'offboarding'), [rtvRows]);

  const handleResolve = async (row: ReturnToVendorRow) => {
    setBusyId(row.id);
    try {
      await markReturnToVendorResolved(row.id);
      toast.success('Marked as returned to vendor');
      setRtvRows((rows) => rows.filter((r) => r.id !== row.id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update');
    } finally {
      setBusyId(null);
    }
  };

  const renderRtvGroup = (title: string, rows: ReturnToVendorRow[]) => (
    <div className="mb-6">
      <p className="mb-2 text-sm font-semibold text-primary">
        {title} ({rows.length})
      </p>
      {rows.length === 0 ? (
        <div className="rounded-lg border border-border/60 bg-card py-6 text-center text-sm text-muted-foreground">
          Nothing here.
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => {
            const meta = REASON_META[row.reason];
            return (
              <div
                key={row.id}
                data-focus-id={row.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/60 bg-card p-3"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-primary">{row.product_name}</p>
                    <Badge className={`border ${meta.className}`}>{meta.label}</Badge>
                    {row.hold_deadline && (
                      <Badge className={`border ${holdCountdown(row.hold_deadline).className}`}>
                        {holdCountdown(row.hold_deadline).label}
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Vendor: {row.business_name}
                    {row.quantity ? ` · Qty: ${row.quantity}` : ''}
                  </p>
                  {row.note && <p className="mt-0.5 text-xs text-muted-foreground">{row.note}</p>}
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Flagged {new Date(row.created_at).toLocaleDateString('en-IN')}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busyId === row.id}
                  onClick={() => handleResolve(row)}
                >
                  <CheckCircle2 className="mr-1 h-4 w-4" /> Mark Returned
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  return (
    <div>
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-secondary">Admin</p>
        <h1 className="mt-1 font-serif text-3xl font-bold text-primary sm:text-4xl">Vendor Ops</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Return timers, restock suggestions, vendor performance and stale-inventory alerts.
        </p>
      </div>

      <div className="mb-5 flex flex-wrap gap-2 border-b border-border/60 pb-3">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.value}
              onClick={() => setTab(t.value)}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition ${
                tab === t.value
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted/50 text-muted-foreground hover:bg-muted'
              }`}
            >
              <Icon className="h-3.5 w-3.5" /> {t.label}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="py-10 text-center">
          <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" />
        </div>
      ) : tab === 'return-to-vendor' ? (
        <div>
          {renderRtvGroup('Same product returned/RTO 2x', returned2x)}
          {renderRtvGroup("Unsold past vendor's hold window", unsoldAfterReturn)}
          {renderRtvGroup('Never Sold — 90 din', neverSold)}
          {renderRtvGroup('Cancelled/Returned — 60 din', cancelledReturned)}
          {offboarded.length > 0 && renderRtvGroup('Vendor Off-boarded', offboarded)}
        </div>
      ) : tab === 'stock-holds' ? (
        stockHoldRows.length === 0 ? (
          <div className="rounded-lg border border-border/60 bg-card py-10 text-center text-sm text-muted-foreground">
            Nothing here — no returned/RTO unit is currently sitting in a hold window.
          </div>
        ) : (
          <div className="space-y-2">
            {stockHoldRows.map((row) => {
              const countdown = holdCountdown(row.hold_deadline);
              return (
                <div
                  key={row.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/60 bg-card p-3"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-primary">{row.product_name}</p>
                      <Badge className="border bg-slate-50 text-slate-700 border-slate-200">
                        {row.source === 'rto' ? 'RTO' : 'Return'}
                      </Badge>
                      <Badge className={`border ${countdown.className}`}>{countdown.label}</Badge>
                      {row.status === 'flagged' && (
                        <Badge className="border bg-red-50 text-red-700 border-red-200">
                          Sent to Return to Vendor
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Vendor: {row.business_name} · Hold window: {row.stock_hold_days_setting} din (vendor-set)
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Back in warehouse since {new Date(row.returned_at).toLocaleDateString('en-IN')} · deadline{' '}
                      {new Date(row.hold_deadline).toLocaleDateString('en-IN')}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : tab === 'restock' ? (
        restockRows.length === 0 ? (
          <div className="rounded-lg border border-border/60 bg-card py-10 text-center text-sm text-muted-foreground">
            Nothing here — no product has crossed the restock threshold in the last 30 days.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border/60">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Product</th>
                  <th className="px-3 py-2">Vendor</th>
                  <th className="px-3 py-2">Sold (30d)</th>
                  <th className="px-3 py-2">Available</th>
                  <th className="px-3 py-2">Sell-through</th>
                </tr>
              </thead>
              <tbody>
                {restockRows.map((r) => (
                  <tr key={r.product_id} className="border-t border-border/40">
                    <td className="px-3 py-2 font-medium text-primary">{r.product_name}</td>
                    <td className="px-3 py-2 text-muted-foreground">{r.business_name}</td>
                    <td className="px-3 py-2">{r.sold_last_30d}</td>
                    <td className="px-3 py-2">{r.available_quantity}</td>
                    <td className="px-3 py-2">
                      <Badge className="bg-amber-50 text-amber-700 border border-amber-200">
                        {pct(r.sell_through_percent)}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : tab === 'performance' ? (
        performanceRows.length === 0 ? (
          <div className="rounded-lg border border-border/60 bg-card py-10 text-center text-sm text-muted-foreground">
            No vendor activity yet.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border/60">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Vendor</th>
                  <th className="px-3 py-2">Sell-through</th>
                  <th className="px-3 py-2">Cancellation</th>
                  <th className="px-3 py-2">Return rate</th>
                  <th className="px-3 py-2">Avg accept time</th>
                  <th className="px-3 py-2">QC fail rate</th>
                  <th className="px-3 py-2">Missed orders</th>
                </tr>
              </thead>
              <tbody>
                {performanceRows.map((r) => (
                  <tr key={r.vendor_id} className="border-t border-border/40">
                    <td className="px-3 py-2 font-medium text-primary">{r.business_name}</td>
                    <td className="px-3 py-2">{pct(r.sell_through_rate)}</td>
                    <td className="px-3 py-2">{pct(r.cancellation_rate)}</td>
                    <td className="px-3 py-2">{pct(r.return_rate)}</td>
                    <td className="px-3 py-2">{minutesToReadable(r.avg_accept_time_minutes)}</td>
                    <td className="px-3 py-2">{pct(r.quality_check_fail_rate)}</td>
                    <td className="px-3 py-2">{r.missed_order_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : staleRows.length === 0 ? (
        <div className="rounded-lg border border-border/60 bg-card py-10 text-center text-sm text-muted-foreground">
          Nothing stale — every vendor product's quantity has been updated recently.
        </div>
      ) : (
        <div className="space-y-2">
          {staleRows.map((r) => (
            <div
              key={r.product_id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/60 bg-card p-3"
            >
              <div>
                <p className="font-medium text-primary">{r.product_name}</p>
                <p className="text-sm text-muted-foreground">
                  Vendor: {r.business_name} · Available: {r.available_quantity}
                </p>
              </div>
              <Badge className="bg-slate-50 text-slate-700 border border-slate-200">
                {r.days_stale} din se untouched
              </Badge>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
