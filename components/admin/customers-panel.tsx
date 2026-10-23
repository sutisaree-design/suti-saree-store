'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Eye, ShoppingCart, CheckCircle2, XCircle, Search, X } from 'lucide-react';
import { fetchCustomers, CustomerRow } from '@/lib/customers-api';
import { formatINR } from '@/lib/format';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';

export default function CustomersPanel() {
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [registrationFilter, setRegistrationFilter] = useState<'all' | 'registered' | 'guest'>('all');
  const [orderedFilter, setOrderedFilter] = useState<'all' | 'ordered' | 'no_order'>('all');

  useEffect(() => {
    fetchCustomers()
      .then(setCustomers)
      .catch((err) => toast.error(err instanceof Error ? err.message : 'Failed to load customers'))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return customers.filter((c) => {
      const matchesQuery =
        !q ||
        c.name.toLowerCase().includes(q) ||
        (c.email ?? '').toLowerCase().includes(q) ||
        (c.phone ?? '').toLowerCase().includes(q);

      const matchesRegistration =
        registrationFilter === 'all' ||
        (registrationFilter === 'registered' ? c.isRegistered : !c.isRegistered);

      const matchesOrdered =
        orderedFilter === 'all' ||
        (orderedFilter === 'ordered' ? c.behavior.converted : !c.behavior.converted);

      return matchesQuery && matchesRegistration && matchesOrdered;
    });
  }, [customers, search, registrationFilter, orderedFilter]);

  const filtersActive = !!search || registrationFilter !== 'all' || orderedFilter !== 'all';

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-secondary">Admin</p>
          <h1 className="mt-1 font-serif text-3xl font-bold text-primary sm:text-4xl">Customers</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {loading
              ? 'Loading…'
              : filtersActive
              ? `${filtered.length} of ${customers.length} customers`
              : `${customers.length} customer${customers.length === 1 ? '' : 's'}`}{' '}
            — built from order history and site activity
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, email or phone…"
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

          <Select value={registrationFilter} onValueChange={(v) => setRegistrationFilter(v as typeof registrationFilter)}>
            <SelectTrigger className="w-[130px]">
              <SelectValue placeholder="All Customers" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Customers</SelectItem>
              <SelectItem value="registered">Registered</SelectItem>
              <SelectItem value="guest">Guest</SelectItem>
            </SelectContent>
          </Select>

          <Select value={orderedFilter} onValueChange={(v) => setOrderedFilter(v as typeof orderedFilter)}>
            <SelectTrigger className="w-[130px]">
              <SelectValue placeholder="All Behavior" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Behavior</SelectItem>
              <SelectItem value="ordered">Ordered</SelectItem>
              <SelectItem value="no_order">No order</SelectItem>
            </SelectContent>
          </Select>

          {filtersActive && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearch('');
                setRegistrationFilter('all');
                setOrderedFilter('all');
              }}
            >
              Reset
            </Button>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-border/60 bg-card">
        <table className="w-full table-auto">
          <thead className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Orders</th>
              <th className="px-4 py-3">Total Spent</th>
              <th className="px-4 py-3">Last Order</th>
              <th className="px-4 py-3">Behavior</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <CustomerRowItem
                key={c.id}
                customer={c}
                open={expanded === c.id}
                onToggle={() => setExpanded((prev) => (prev === c.id ? null : c.id))}
              />
            ))}
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">
                  No customers found yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CustomerRowItem({
  customer,
  open,
  onToggle,
}: {
  customer: CustomerRow;
  open: boolean;
  onToggle: () => void;
}) {
  const b = customer.behavior;
  return (
    <>
      <tr className="border-t">
        <td className="px-4 py-3 align-top">
          <div className="text-sm font-medium">{customer.name}</div>
          <div className="text-xs text-muted-foreground">{customer.email || customer.phone || '—'}</div>
          {customer.isRegistered && (
            <span className="mt-1 inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-800">
              Registered
            </span>
          )}
        </td>
        <td className="px-4 py-3 align-top text-sm">{customer.orderCount}</td>
        <td className="px-4 py-3 align-top text-sm font-medium">{formatINR(customer.totalSpent)}</td>
        <td className="px-4 py-3 align-top text-sm">
          {customer.lastOrderAt ? new Date(customer.lastOrderAt).toLocaleDateString('en-IN') : '—'}
        </td>
        <td className="px-4 py-3 align-top text-xs">
          <div className="flex flex-wrap gap-1.5">
            <BehaviorBadge icon={<Eye className="h-3 w-3" />} active={b.pagesVisitedCount > 0}>
              {b.pagesVisitedCount} page{b.pagesVisitedCount === 1 ? '' : 's'}
            </BehaviorBadge>
            <BehaviorBadge icon={<ShoppingCart className="h-3 w-3" />} active={b.addedToCart}>
              Cart
            </BehaviorBadge>
            {b.converted ? (
              <BehaviorBadge icon={<CheckCircle2 className="h-3 w-3" />} active tone="success">
                Ordered
              </BehaviorBadge>
            ) : (
              <BehaviorBadge icon={<XCircle className="h-3 w-3" />} active={false}>
                No order
              </BehaviorBadge>
            )}
          </div>
        </td>
        <td className="px-4 py-3 align-top text-sm">
          <button onClick={onToggle} className="text-secondary hover:underline">
            {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </td>
      </tr>
      {open && (
        <tr className="bg-muted/20">
          <td colSpan={6} className="px-4 py-4">
            <div className="grid gap-4 lg:grid-cols-2">
              <div>
                <h4 className="mb-2 text-sm font-semibold">Order History</h4>
                <ul className="space-y-3">
                  {customer.orders.map((o) => (
                    <li key={o.id} className="rounded-md border border-border/50 bg-card p-3">
                      <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                        <span>{new Date(o.created_at).toLocaleString('en-IN')}</span>
                        <span className="rounded-full bg-muted px-2 py-0.5 font-medium capitalize">{o.status}</span>
                      </div>
                      <ul className="space-y-1.5">
                        {(o.items || []).map((it: any, idx: number) => (
                          <li key={idx} className="flex items-center gap-2 text-sm">
                            {it.image_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={it.image_url}
                                alt={it.product_name}
                                className="h-8 w-8 rounded-md object-cover"
                              />
                            ) : (
                              <div className="h-8 w-8 rounded-md bg-muted" />
                            )}
                            <span className="flex-1 truncate">{it.product_name}</span>
                            <span className="text-xs text-muted-foreground">
                              {[it.color, it.size].filter(Boolean).join(' / ')}
                            </span>
                            <span className="text-xs">x{it.quantity}</span>
                          </li>
                        ))}
                      </ul>
                      <div className="mt-2 text-right text-sm font-medium">{formatINR(o.total_amount)}</div>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h4 className="mb-2 text-sm font-semibold">Pages Visited</h4>
                {b.pagesVisited.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No browsing activity recorded for this customer.</p>
                ) : (
                  <ul className="flex flex-wrap gap-1.5">
                    {b.pagesVisited.map((p) => (
                      <li key={p} className="rounded-full bg-muted px-2 py-1 text-xs">
                        {p}
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-3 text-xs text-muted-foreground">
                  Viewed {b.productsViewed} product page{b.productsViewed === 1 ? '' : 's'} ·{' '}
                  {b.addedToCart ? 'added items to cart' : 'never added to cart'} ·{' '}
                  {b.startedCheckout ? 'reached checkout' : 'never reached checkout'}
                </p>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function BehaviorBadge({
  icon,
  active,
  tone,
  children,
}: {
  icon: React.ReactNode;
  active: boolean;
  tone?: 'success';
  children: React.ReactNode;
}) {
  const base = 'inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium';
  const cls = !active
    ? `${base} bg-muted text-muted-foreground`
    : tone === 'success'
    ? `${base} bg-emerald-100 text-emerald-800`
    : `${base} bg-secondary/15 text-secondary`;
  return (
    <span className={cls}>
      {icon}
      {children}
    </span>
  );
}
