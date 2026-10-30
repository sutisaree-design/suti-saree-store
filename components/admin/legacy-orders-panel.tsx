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

// ---- Manual outreach (nothing is ever sent automatically) -----------------
// These only open the admin's own WhatsApp / mail app with a pre-filled
// message. The admin reads it and presses Send themselves.
type MsgTemplate = { id: string; label: string; subject: string; body: string };

const MSG_TEMPLATES: MsgTemplate[] = [
  {
    id: 'thanks',
    label: 'Thank you + new arrivals',
    subject: 'Thank you from Sutisaree - new sarees for you',
    body:
      'Namaste {name} ji,\n\nThank you for shopping with Sutisaree earlier. We have moved to our new website and have fresh handloom and cotton sarees for you.\n\nSee new arrivals: https://sutisaree.com\n\nReply STOP if you do not want messages from us.',
  },
  {
    id: 'offer',
    label: 'Special offer',
    subject: 'A special offer for you from Sutisaree',
    body:
      'Namaste {name} ji,\n\nAs a valued Sutisaree customer, we have a special offer for you on our new website.\n\nShop now: https://sutisaree.com\n\nReply STOP if you do not want messages from us.',
  },
  {
    id: 'feedback',
    label: 'Feedback / review',
    subject: 'How was your Sutisaree saree?',
    body:
      'Namaste {name} ji,\n\nYou ordered "{item}" from us. We hope you loved it! If you have a minute, please reply with your feedback or a photo - it helps us a lot.\n\nReply STOP if you do not want messages from us.',
  },
  { id: 'custom', label: 'Custom (write your own)', subject: 'Message from Sutisaree', body: 'Namaste {name} ji,\n\n' },
];

function fillTemplate(text: string, o: { name: string; item: string | null }): string {
  const first = (o.name && o.name !== '—' ? o.name : 'Customer').trim().split(/\s+/)[0];
  return text.replace(/\{name\}/g, first).replace(/\{item\}/g, o.item || 'your saree');
}

// Indian numbers only -> digits for wa.me (91XXXXXXXXXX). Null if unusable.
function waDigits(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const d = raw.replace(/\D/g, '');
  if (d.length === 10) return `91${d}`;
  if (d.length === 11 && d.startsWith('0')) return `91${d.slice(1)}`;
  if (d.length === 12 && d.startsWith('91')) return d;
  if (d.length === 13 && d.startsWith('091')) return `91${d.slice(3)}`;
  return null;
}

// Mobile card layout: below lg each table row becomes a stacked card (CSS only).
const M_LABEL =
  'max-lg:before:mb-1 max-lg:before:block max-lg:before:text-[10px] max-lg:before:font-semibold max-lg:before:uppercase max-lg:before:tracking-wider max-lg:before:text-muted-foreground max-lg:before:content-[attr(data-label)]';

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
  const [tplId, setTplId] = useState<string>(MSG_TEMPLATES[0].id);
  const [tplSubject, setTplSubject] = useState<string>(MSG_TEMPLATES[0].subject);
  const [tplBody, setTplBody] = useState<string>(MSG_TEMPLATES[0].body);
  const reqSeq = useRef(0);

  const pickTemplate = (id: string) => {
    const t = MSG_TEMPLATES.find((x) => x.id === id) ?? MSG_TEMPLATES[0];
    setTplId(t.id);
    setTplSubject(t.subject);
    setTplBody(t.body);
  };

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
        <span>Old WooCommerce site orders - read only. Nothing is sent automatically. The WhatsApp / Email buttons only open your own app with a pre-filled message; you press Send yourself.</span>
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

      <div className="grid gap-2 rounded-lg border border-border/60 bg-card p-3 sm:p-4">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold">Message to send (manual)</p>
          <select
            value={tplId}
            onChange={(e) => pickTemplate(e.target.value)}
            className="rounded-md border border-border bg-background px-2 py-1 text-sm"
          >
            {MSG_TEMPLATES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
          <span className="text-xs text-muted-foreground">Use {'{name}'} and {'{item}'} - filled in for each customer.</span>
        </div>
        <Input value={tplSubject} onChange={(e) => setTplSubject(e.target.value)} placeholder="Email subject" />
        <textarea
          value={tplBody}
          onChange={(e) => setTplBody(e.target.value)}
          rows={5}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
        <p className="text-xs text-muted-foreground">
          Keep messages relevant and always include a way to opt out. Sending the same promo to many people quickly can get your WhatsApp number restricted - send in small batches.
        </p>
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

      <div className="rounded-lg lg:overflow-x-auto lg:border lg:border-border/60 lg:bg-card">
        <table className="block w-full table-auto lg:table lg:min-w-[900px]">
          <thead className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground max-lg:hidden">
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
          <tbody className="max-lg:block">
            {loading && rows.length === 0 ? (
              <tr className="max-lg:block">
                <td colSpan={8} className="px-4 py-10 text-center text-sm text-muted-foreground max-lg:block max-lg:rounded-lg max-lg:border max-lg:bg-card">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr className="max-lg:block">
                <td colSpan={8} className="px-4 py-10 text-center text-sm text-muted-foreground max-lg:block max-lg:rounded-lg max-lg:border max-lg:bg-card">
                  {error ? 'Could not load orders.' : 'No old orders match your search or filters.'}
                </td>
              </tr>
            ) : (
              rows.map((o) => (
                <LegacyRow key={o.id} order={o} onView={setOpenId} dim={loading} tplSubject={tplSubject} tplBody={tplBody} />
              ))
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

function Thumb({ src, alt, size = 'h-12 w-10' }: { src: string | null | undefined; alt: string; size?: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <div className={`${size} shrink-0 rounded bg-muted`} aria-hidden />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
      className={`${size} shrink-0 rounded border border-border/60 object-cover`}
    />
  );
}

function LegacyRow({
  order,
  onView,
  dim,
  tplSubject,
  tplBody,
}: {
  order: LegacyOrderListRow;
  onView: (id: number) => void;
  dim: boolean;
  tplSubject: string;
  tplBody: string;
}) {
  const ctx = { name: order.customer_name, item: order.first_item };
  const digits = waDigits(order.customer_phone);
  const body = fillTemplate(tplBody, ctx);
  const waUrl = digits ? `https://wa.me/${digits}?text=${encodeURIComponent(body)}` : null;
  const mailUrl = order.customer_email
    ? `mailto:${order.customer_email}?subject=${encodeURIComponent(fillTemplate(tplSubject, ctx))}&body=${encodeURIComponent(body)}`
    : null;
  const key = cleanStatus(order.status);
  const more = order.item_count > 1 ? ` +${order.item_count - 1} more` : '';
  return (
    <tr
      className={`border-t border-l-4 ${STATUS_BORDER_COLOR[key] || 'border-l-transparent'} ${
        dim ? 'opacity-60' : ''
      } max-lg:mb-3 max-lg:grid max-lg:grid-cols-2 max-lg:gap-x-3 max-lg:gap-y-3 max-lg:rounded-lg max-lg:border-y max-lg:border-r max-lg:bg-card max-lg:p-3`}
    >
      <td className="px-4 py-3 align-top max-lg:col-span-2 max-lg:block max-lg:p-0">
        <span className="font-mono text-xs font-semibold">#{order.id}</span>
      </td>
      <td className="px-4 py-3 align-top max-lg:col-span-2 max-lg:block max-lg:p-0">
        <div className="text-sm font-medium">{order.customer_name}</div>
        {order.customer_phone && <div className="text-xs text-muted-foreground">{order.customer_phone}</div>}
        {order.customer_email && <div className="text-xs text-muted-foreground">{order.customer_email}</div>}
      </td>
      <td className="px-4 py-3 align-top text-sm max-lg:col-span-2 max-lg:block max-lg:p-0">
        <div className="flex items-start gap-2">
          <Thumb src={order.first_item_image} alt={order.first_item ?? ''} />
          <div className="min-w-0">
            <div className="max-w-[200px] truncate max-lg:max-w-[16rem]" title={order.first_item ?? ''}>
              {order.first_item || '—'}
            </div>
            {more && <div className="text-xs text-muted-foreground">{more.trim()}</div>}
          </div>
        </div>
      </td>
      <td data-label="Date (IST)" className={`px-4 py-3 align-top text-sm ${M_LABEL} max-lg:block max-lg:p-0`}>{formatIST(order.date_created_gmt)}</td>
      <td data-label="Total" className={`px-4 py-3 align-top text-sm font-medium ${M_LABEL} max-lg:block max-lg:p-0`}>{formatINR(order.total_amount)}</td>
      <td data-label="Payment" className={`px-4 py-3 align-top text-sm ${M_LABEL} max-lg:block max-lg:p-0`}>
        {order.payment_method_title || order.payment_method || '—'}
      </td>
      <td data-label="Status" className={`px-4 py-3 align-top ${M_LABEL} max-lg:block max-lg:p-0`}>
        <StatusBadge status={order.status} />
      </td>
      <td className="px-4 py-3 align-top max-lg:col-span-2 max-lg:block max-lg:p-0">
        <div className="flex flex-col items-start gap-1.5">
          <Button size="sm" onClick={() => onView(order.id)}>
            View
          </Button>
          <div className="flex gap-1.5">
            {waUrl ? (
              <a
                href={waUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-md bg-[#25D366] px-2 py-1 text-xs font-medium text-white hover:opacity-90"
              >
                WhatsApp
              </a>
            ) : (
              <span className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground" title="No valid phone number">
                WhatsApp
              </span>
            )}
            {mailUrl ? (
              <a
                href={mailUrl}
                className="rounded-md border border-border bg-card px-2 py-1 text-xs font-medium hover:bg-muted"
              >
                Email
              </a>
            ) : (
              <span className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground" title="No email">
                Email
              </span>
            )}
          </div>
        </div>
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
                          <div className="flex items-start gap-2">
                            <Thumb src={it.image_url} alt={it.name} size="h-14 w-11" />
                            <div className="min-w-0">
                              <div className="font-medium">{it.name}</div>
                              {it.product_id && (
                                <div className="text-xs text-muted-foreground">
                                  Product {it.product_id}
                                  {it.variation_id ? ` / Variation ${it.variation_id}` : ''}
                                </div>
                              )}
                            </div>
                          </div>
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
