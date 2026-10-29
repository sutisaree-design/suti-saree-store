'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Search, X, ChevronLeft, ChevronRight, Info } from 'lucide-react';
import { formatINR } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
// IMPORTANT: type-only imports. lib/legacy-orders-api.ts imports 'server-only'
// and must never be bundled into client code.
import type {
  LegacyOrderListRow,
  LegacyOrderListResult,
  LegacyStatusStat,
  LegacyOrderDetail,
} from '@/lib/legacy-orders-api';

const PAGE_SIZE = 25;

const STATUS_BORDER_COLOR: Record<string, string> = {
  completed: 'border-l-green-600',
  processing: 'border-l-sky-500',
  'on-hold': 'border-l-amber-400',
  pending: 'border-l-amber-400',
  cancelled: 'border-l-red-500',
  refunded: 'border-l-purple-500',
  failed: 'border-l-neutral-500',
};

const STATUS_BADGE_COLOR: Record<string, string> = {
  completed: 'bg-green-100 text-green-800',
  processing: 'bg-sky-100 text-sky-800',
  'on-hold': 'bg-amber-100 text-amber-800',
  pending: 'bg-amber-100 text-amber-800',
  cancelled: 'bg-red-100 text-red-800',
  refunded: 'bg-purple-100 text-purple-800',
  failed: 'bg-neutral-200 text-neutral-700',
};

// WooCommerce stores statuses as "wc-completed" etc.
const cleanStatus = (s: string) => s.replace(/^wc-/, '');

function StatusBadge({ status }: { status: string }) {
  const key = cleanStatus(status);
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
        STATUS_BADGE_COLOR[key] || 'bg-muted text-muted-foreground'
      }`}
    >
      {key.replace(/-/g, ' ')}
    </span>
  );
}

// date_created_gmt has no timezone suffix -> it is UTC. Display in IST.
function parseGmt(value: string | null | undefined): Date | null {
  if (!value) return null;
  const s = String(value).trim();
  const hasTz = /(Z|[+-]\d{2}:?\d{2})$/i.test(s);
  const iso = hasTz ? s : `${s.replace(' ', 'T')}Z`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

const IST_FORMAT = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});

function formatIST(value: string | null | undefined): string {
  const d = parseGmt(value);
  return d ? IST_FORMAT.format(d) : '—';
}

async function readJson(res: Response) {
  let body: any = null;
  try {
    body = await res.json();
  } catch {
    /* ignore */
  }
  if (!res.ok) {
    throw new Error(body?.error || `Request failed (${res.status})`);
  }
  return body;
}

export default function LegacyOrdersPanel() {
  const [stats, setStats] = useState<LegacyStatusStat[]>([]);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<LegacyOrderListResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const reqSeq = useRef(0);

  // Debounce the search box.
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedQ(search.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [search]);

  // Status counts for the filter chips + summary cards.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/admin/legacy-orders?stats=1', { cache: 'no-store' })
      .then(readJson)
      .then((b) => {
        if (!cancelled) setStats(b.stats ?? []);
      })
      .catch((e) => {
        if (!cancelled) setStatsError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const load = useCallback(async () => {
    const seq = ++reqSeq.current;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (debouncedQ) params.set('q', debouncedQ);
      if (status) params.set('status', status);
      params.set('page', String(page));
      params.set('pageSize', String(PAGE_SIZE));
      const res = await fetch(`/api/admin/legacy-orders?${params.toString()}`, { cache: 'no-store' });
      const body = (await readJson(res)) as LegacyOrderListResult;
      if (seq === reqSeq.current) setData(body);
    } catch (e: any) {
      if (seq === reqSeq.current) setError(e?.message || 'Failed to load orders');
    } finally {
      if (seq === reqSeq.current) setLoading(false);
    }
  }, [debouncedQ, status, page]);

  useEffect(() => {
    load();
  }, [load]);

  const totalOrdersAll = useMemo(() => stats.reduce((s, r) => s + r.orders, 0), [stats]);
  const totalValueAll = useMemo(() => stats.reduce((s, r) => s + r.total_value, 0), [stats]);
  const activeStat = status ? stats.find((s) => s.status === status) : null;
  const cardOrders = status ? activeStat?.orders ?? 0 : totalOrdersAll;
  const cardValue = status ? activeStat?.total_value ?? 0 : totalValueAll;

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rows = data?.orders ?? [];

  const pickStatus = (s: string) => {
    setStatus(s);
    setPage(1);
  };

  return (
    <div className="grid gap-6">
      <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <span>Old WooCommerce site orders - read only. No emails or WhatsApp are ever sent for these.</span>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
        <div className="rounded-lg border border-border/60 bg-card p-3 sm:p-4">
          <p className="text-xs text-muted-foreground">Total Orders{status ? ` (${cleanStatus(status)})` : ''}</p>
          <p className="mt-2 text-lg font-semibold sm:text-2xl">{cardOrders.toLocaleString('en-IN')}</p>
        </div>
        <div className="rounded-lg border border-border/60 bg-card p-3 sm:p-4">
          <p className="text-xs text-muted-foreground">Total Value{status ? ` (${cleanStatus(status)})` : ''}</p>
          <p className="mt-2 truncate text-lg font-semibold sm:text-2xl">{formatINR(cardValue)}</p>
        </div>
        <div className="rounded-lg border border-border/60 bg-card p-3 sm:p-4">
          <p className="text-xs text-muted-foreground">Matching current search / filter</p>
          <p className="mt-2 text-lg font-semibold sm:text-2xl">{total.toLocaleString('en-IN')}</p>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div className="relative w-full sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search order #, customer, phone, email, product..."
            className="pl-9 pr-8"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => pickStatus('')}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              status === '' ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:bg-muted'
            }`}
          >
            All{stats.length > 0 ? ` (${totalOrdersAll.toLocaleString('en-IN')})` : ''}
          </button>
          {stats.map((s) => (
            <button
              key={s.status}
              type="button"
              onClick={() => pickStatus(s.status)}
              className={`rounded-full border px-3 py-1 text-xs font-medium capitalize transition-colors ${
                status === s.status ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:bg-muted'
              }`}
            >
              {cleanStatus(s.status).replace(/-/g, ' ')} ({s.orders.toLocaleString('en-IN')})
            </button>
          ))}
          {statsError && <span className="text-xs text-destructive">Status counts unavailable: {statsError}</span>}
        </div>
      </div>

      {error && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-2.5 text-sm">
          <span className="text-destructive">{error}</span>
          <Button variant="outline" size="sm" onClick={load}>
            Retry
          </Button>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-border/60 bg-card">
        <table className="w-full min-w-[900px] table-auto">
          <thead className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Order #</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Item</th>
              <th className="px-4 py-3">Date (IST)</th>
              <th className="px-4 py-3">Total</th>
              <th className="px-4 py-3">Payment</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">View</th>
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-sm text-muted-foreground">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-sm text-muted-foreground">
                  {error ? 'Could not load orders.' : 'No old orders match your search or filters.'}
                </td>
              </tr>
            ) : (
              rows.map((o) => <LegacyRow key={o.id} order={o} onView={setOpenId} dim={loading} />)
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <span className="text-muted-foreground">
          {total > 0
            ? `Showing ${(page - 1) * PAGE_SIZE + 1}-${Math.min(page * PAGE_SIZE, total)} of ${total.toLocaleString('en-IN')}`
            : 'No results'}
          {loading && rows.length > 0 && <Loader2 className="ml-2 inline h-3.5 w-3.5 animate-spin" />}
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1 || loading}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="gap-1"
          >
            <ChevronLeft className="h-4 w-4" /> Prev
          </Button>
          <span className="text-xs text-muted-foreground">
            Page {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages || loading}
            onClick={() => setPage((p) => p + 1)}
            className="gap-1"
          >
            Next <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <LegacyOrderModal id={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}

function LegacyRow({
  order,
  onView,
  dim,
}: {
  order: LegacyOrderListRow;
  onView: (id: number) => void;
  dim: boolean;
}) {
  const key = cleanStatus(order.status);
  const more = order.item_count > 1 ? ` +${order.item_count - 1} more` : '';
  return (
    <tr
      className={`border-t border-l-4 ${STATUS_BORDER_COLOR[key] || 'border-l-transparent'} ${
        dim ? 'opacity-60' : ''
      }`}
    >
      <td className="px-4 py-3 align-top">
        <span className="font-mono text-xs font-semibold">#{order.id}</span>
      </td>
      <td className="px-4 py-3 align-top">
        <div className="text-sm font-medium">{order.customer_name}</div>
        {order.customer_phone && <div className="text-xs text-muted-foreground">{order.customer_phone}</div>}
        {order.customer_email && <div className="text-xs text-muted-foreground">{order.customer_email}</div>}
      </td>
      <td className="px-4 py-3 align-top text-sm">
        <div className="max-w-[240px] truncate" title={order.first_item ?? ''}>
          {order.first_item || '—'}
        </div>
        {more && <div className="text-xs text-muted-foreground">{more.trim()}</div>}
      </td>
      <td className="px-4 py-3 align-top text-sm">{formatIST(order.date_created_gmt)}</td>
      <td className="px-4 py-3 align-top text-sm font-medium">{formatINR(order.total_amount)}</td>
      <td className="px-4 py-3 align-top text-sm">
        {order.payment_method_title || order.payment_method || '—'}
      </td>
      <td className="px-4 py-3 align-top">
        <StatusBadge status={order.status} />
      </td>
      <td className="px-4 py-3 align-top">
        <Button size="sm" onClick={() => onView(order.id)}>
          View
        </Button>
      </td>
    </tr>
  );
}

type AddressLike = LegacyOrderDetail['billing'];

function AddressBlock({ title, a }: { title: string; a: AddressLike }) {
  const name = a ? [a.first_name, a.last_name].filter(Boolean).join(' ') : '';
  const cityLine = a ? [a.city, a.state, a.postcode].filter(Boolean).join(', ') : '';
  return (
    <div className="rounded-lg border border-border/60 p-3">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</p>
      {!a ? (
        <p className="text-sm text-muted-foreground">—</p>
      ) : (
        <div className="space-y-0.5 text-sm">
          {name && <div className="font-medium">{name}</div>}
          {a.company && <div>{a.company}</div>}
          {a.address_1 && <div>{a.address_1}</div>}
          {a.address_2 && <div>{a.address_2}</div>}
          {cityLine && <div>{cityLine}</div>}
          {a.country && <div>{a.country}</div>}
          {a.phone && <div className="text-muted-foreground">{a.phone}</div>}
          {a.email && <div className="text-muted-foreground">{a.email}</div>}
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}

function LegacyOrderModal({ id, onClose }: { id: number | null; onClose: () => void }) {
  const [order, setOrder] = useState<LegacyOrderDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (id == null) {
      setOrder(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setOrder(null);
    fetch(`/api/admin/legacy-orders/${id}`, { cache: 'no-store' })
      .then(readJson)
      .then((b) => {
        if (!cancelled) setOrder(b.order as LegacyOrderDetail);
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message || 'Failed to load order');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <Dialog open={id != null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl text-primary">Old order #{id}</DialogTitle>
          <DialogDescription>Read only. Imported from the old WooCommerce site.</DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="py-10 text-center">
            <Loader2 className="mx-auto h-5 w-5 animate-spin" />
          </div>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}

        {order && (
          <div className="grid gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <StatusBadge status={order.status} />
              <span className="text-sm text-muted-foreground">Placed {formatIST(order.date_created_gmt)} IST</span>
              {order.date_paid_gmt && (
                <span className="text-sm text-muted-foreground">Paid {formatIST(order.date_paid_gmt)}</span>
              )}
              {order.date_completed_gmt && (
                <span className="text-sm text-muted-foreground">Completed {formatIST(order.date_completed_gmt)}</span>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <AddressBlock title="Billing" a={order.billing} />
              <AddressBlock title="Shipping" a={order.shipping} />
            </div>

            <div className="overflow-x-auto rounded-lg border border-border/60">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Item</th>
                    <th className="px-3 py-2">Color</th>
                    <th className="px-3 py-2">Size</th>
                    <th className="px-3 py-2">Code</th>
                    <th className="px-3 py-2 text-right">Qty</th>
                    <th className="px-3 py-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {order.items.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-4 text-center text-muted-foreground">
                        No items found.
                      </td>
                    </tr>
                  ) : (
                    order.items.map((it, i) => (
                      <tr key={i} className="border-t align-top">
                        <td className="px-3 py-2">
                          <div className="font-medium">{it.name}</div>
                          {it.product_id && (
                            <div className="text-xs text-muted-foreground">
                              Product {it.product_id}
                              {it.variation_id ? ` / Variation ${it.variation_id}` : ''}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2">{it.color || '—'}</td>
                        <td className="px-3 py-2">{it.size || '—'}</td>
                        <td className="px-3 py-2 font-mono text-xs">{it.product_code || '—'}</td>
                        <td className="px-3 py-2 text-right">{it.qty}</td>
                        <td className="px-3 py-2 text-right">{formatINR(it.total)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 rounded-lg border border-border/60 p-3">
                <Row
                  label="Shipping"
                  value={
                    order.shipping_lines.length > 0
                      ? order.shipping_lines.map((s) => `${s.name || s.method_id || 'Shipping'}: ${formatINR(s.cost)}`).join(', ')
                      : formatINR(order.shipping_total_amount)
                  }
                />
                <Row label="Discount" value={formatINR(order.discount_total_amount)} />
                <Row label="Tax" value={formatINR(order.tax_amount)} />
                {order.fees.map((f, i) => (
                  <Row key={i} label={`Fee: ${f.name}`} value={formatINR(f.total)} />
                ))}
                {order.taxes.map((t, i) => (
                  <Row
                    key={i}
                    label={`${t.label}${t.rate_percent ? ` (${t.rate_percent}%)` : ''}`}
                    value={formatINR(t.amount + t.shipping_amount)}
                  />
                ))}
                <div className="border-t pt-2">
                  <Row label="Order total" value={<span className="text-base">{formatINR(order.total_amount)}</span>} />
                </div>
              </div>

              <div className="space-y-2 rounded-lg border border-border/60 p-3">
                <Row label="Payment method" value={order.payment_method_title || order.payment_method || '—'} />
                <Row label="Transaction ID" value={order.transaction_id || '—'} />
                <Row
                  label="Coupons"
                  value={
                    order.coupons.length > 0
                      ? order.coupons.map((c) => `${c.code} (-${formatINR(c.discount)})`).join(', ')
                      : '—'
                  }
                />
                <Row
                  label="Refunds"
                  value={
                    order.refunds.length > 0
                      ? order.refunds
                          .map((r) => `${formatINR(Math.abs(r.total_amount))} on ${formatIST(r.date_created_gmt)}`)
                          .join('; ')
                      : '—'
                  }
                />
                {order.currency && order.currency !== 'INR' && <Row label="Currency" value={order.currency} />}
              </div>
            </div>

            {order.customer_note && (
              <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Customer note
                </p>
                <p className="whitespace-pre-wrap text-sm">{order.customer_note}</p>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
