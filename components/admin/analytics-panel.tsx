'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  BarChart,
  FunnelChart,
  Funnel,
  LabelList,
  Cell,
} from 'recharts';
import { AlertTriangle, TrendingUp, ShoppingBag, Percent, PackageX, BarChart3, Wifi, Receipt, Search, ShoppingCart, CreditCard, CheckCircle2, PackagePlus, Loader2, ArrowUp, ArrowDown, ArrowUpDown, Repeat } from 'lucide-react';
import { startOfDay, endOfDay, subDays } from 'date-fns';
import { fetchAnalytics, AnalyticsData } from '@/lib/analytics-api';
import { updateProduct, extractErrorMessage } from '@/lib/products-api';
import { formatINR } from '@/lib/format';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import TrafficPanel from '@/components/admin/traffic-panel';
import SearchInsightsPanel from '@/components/admin/search-insights-panel';
import VariantSwitchesPanel from '@/components/admin/variant-switches-panel';
import { DateRangePicker, SimpleRange } from '@/components/admin/date-range-picker';

const FUNNEL_COLORS = ['#8b5e3c', '#a9744f', '#c68b5f', '#e0a374', '#f0b98a'];
const BAR_COLOR = '#c9a48a';
const ORDER_DOT_COLOR = '#8b5e3c';

// ── Tab bar ────────────────────────────────────────────────────────────────

type Tab = 'sales' | 'traffic' | 'search' | 'variants';

function TabBar({
  active,
  onChange,
  right,
}: {
  active: Tab;
  onChange: (t: Tab) => void;
  right?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div className="flex w-fit max-w-full gap-1 overflow-x-auto rounded-xl border border-border/60 bg-muted/40 p-1">
        <TabButton value="sales" active={active} onChange={onChange} icon={<BarChart3 className="h-4 w-4" />}>
          Sales Analytics
        </TabButton>
        <TabButton value="traffic" active={active} onChange={onChange} icon={<Wifi className="h-4 w-4" />}>
          Traffic
        </TabButton>
        <TabButton value="search" active={active} onChange={onChange} icon={<Search className="h-4 w-4" />}>
          Search
        </TabButton>
        <TabButton value="variants" active={active} onChange={onChange} icon={<Repeat className="h-4 w-4" />}>
          Variant Switches
        </TabButton>
      </div>
      {active === 'sales' && right}
    </div>
  );
}

function TabButton({
  value,
  active,
  onChange,
  icon,
  children,
}: {
  value: Tab;
  active: Tab;
  onChange: (t: Tab) => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  const isActive = active === value;
  return (
    <button
      onClick={() => onChange(value)}
      className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors sm:px-4 ${
        isActive
          ? 'bg-white text-primary shadow-sm'
          : 'text-muted-foreground hover:text-foreground'
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

// ── Sales trend + order-level chart tooltip ─────────────────────────────────

function SalesTooltip({ active, payload, label }: any) {
  if (!active || !payload || payload.length === 0) return null;
  const dayEntry = payload.find((p: any) => p.dataKey === 'revenue');
  const orderEntries = payload.filter((p: any) => p.dataKey === 'amount');

  return (
    <div className="min-w-[200px] rounded-lg border border-border/60 bg-white/97 p-3 text-xs shadow-xl backdrop-blur-sm">
      <p className="mb-1.5 font-serif text-sm font-bold text-primary">
        {new Date(`${label}T00:00:00`).toLocaleDateString('en-IN', { dateStyle: 'medium' })}
      </p>
      {dayEntry && (
        <p className="mb-1.5 flex items-center justify-between text-muted-foreground">
          <span>Day revenue</span>
          <span className="font-semibold text-foreground">{formatINR(dayEntry.value as number)}</span>
        </p>
      )}
      {orderEntries.length > 0 ? (
        <div className="max-h-40 space-y-1 overflow-y-auto border-t border-border/50 pt-1.5 pr-1">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Orders ({orderEntries.length})
          </p>
          {orderEntries.map((entry: any, i: number) => {
            const o = entry.payload;
            return (
              <div key={i} className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">
                  {new Date(o.time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                </span>
                <span className="font-medium">{formatINR(o.amount)}</span>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="border-t border-border/50 pt-1.5 text-muted-foreground">No orders this day.</p>
      )}
    </div>
  );
}

// ── Sales panel (existing analytics) ─────────────────────────────────────

const PERF_PAGE_SIZE = 8;
const LOW_STOCK_PAGE_SIZE = 8;
const DEFAULT_RESTOCK_AMOUNT = '10';

type PerfSortKey = 'name' | 'impressions' | 'addToCart' | 'beginCheckout' | 'purchases' | 'conversionRate';

// Clickable column header with a sort arrow -- same "click to sort,
// arrow flips between latest-first / earliest-first" pattern used
// elsewhere in the admin (e.g. Traffic's "Items viewed" column).
function SortableTh({
  label,
  active,
  dir,
  onClick,
  align = 'left',
}: {
  label: string;
  active: boolean;
  dir: 'asc' | 'desc';
  onClick: () => void;
  align?: 'left' | 'right';
}) {
  return (
    <th className={`pb-2 pr-3 font-medium ${align === 'right' ? 'text-right' : 'text-left'}`}>
      <button
        type="button"
        onClick={onClick}
        className={`inline-flex items-center gap-1 transition-colors hover:text-foreground ${
          active ? 'text-foreground' : ''
        }`}
      >
        {label}
        {active ? (
          dir === 'desc' ? (
            <ArrowDown className="h-3 w-3" />
          ) : (
            <ArrowUp className="h-3 w-3" />
          )
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-40" />
        )}
      </button>
    </th>
  );
}

function SalesPanel({ range, onRangeChange }: { range: SimpleRange; onRangeChange: (r: SimpleRange) => void }) {
  const router = useRouter();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [perfSearch, setPerfSearch] = useState('');
  const [perfSortKey, setPerfSortKey] = useState<PerfSortKey>('impressions');
  const [perfSortDir, setPerfSortDir] = useState<'asc' | 'desc'>('desc');
  const [perfVisibleCount, setPerfVisibleCount] = useState(PERF_PAGE_SIZE);
  const [lowStockVisibleCount, setLowStockVisibleCount] = useState(LOW_STOCK_PAGE_SIZE);
  const [stockEditId, setStockEditId] = useState<string | null>(null);
  const [stockAddAmount, setStockAddAmount] = useState(DEFAULT_RESTOCK_AMOUNT);
  const [stockSaving, setStockSaving] = useState(false);

  // Refetch the whole dashboard -- including Product Performance, which now
  // shares this exact same range instead of its own separate window --
  // whenever the top-right date range changes. One control, one fetch.
  useEffect(() => {
    setLoading(true);
    setPerfVisibleCount(PERF_PAGE_SIZE);
    setLowStockVisibleCount(LOW_STOCK_PAGE_SIZE);
    fetchAnalytics({
      from: range.from.toISOString(),
      to: range.to.toISOString(),
    })
      .then(setData)
      .catch((err) => toast.error(err instanceof Error ? err.message : 'Failed to load analytics'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range]);

  // Clicking a Product Performance column header: same column again flips
  // the arrow (desc <-> asc); a new column starts at desc (highest/latest
  // first), which is what "sort by latest" usually means for count columns.
  const togglePerfSort = (key: PerfSortKey) => {
    if (key === perfSortKey) {
      setPerfSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    } else {
      setPerfSortKey(key);
      setPerfSortDir('desc');
    }
    setPerfVisibleCount(PERF_PAGE_SIZE);
  };

  // Quick "Add stock" action from the Low Stock Alerts list. Updates the
  // product's stock_quantity via the same admin API the Products panel
  // uses, then refetches the whole dashboard so the low-stock list,
  // summary count, and Product Performance table all stay in sync (an item
  // that's no longer low-stock should simply disappear from the list).
  const handleAddStock = async (productId: string, currentQty: number) => {
    const amount = Number(stockAddAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('Enter a valid quantity to add');
      return;
    }
    setStockSaving(true);
    try {
      const newQty = currentQty + amount;
      await updateProduct(productId, { stock_quantity: newQty, in_stock: newQty > 0 });
      toast.success(`Stock updated to ${newQty}`);
      setStockEditId(null);
      setStockAddAmount(DEFAULT_RESTOCK_AMOUNT);
      const refreshed = await fetchAnalytics({
        from: range.from.toISOString(),
        to: range.to.toISOString(),
      });
      setData(refreshed);
    } catch (err) {
      toast.error(extractErrorMessage(err, 'Failed to update stock'));
    } finally {
      setStockSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="grid gap-6">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-80 rounded-lg" />
        <Skeleton className="h-72 rounded-lg" />
      </div>
    );
  }

  if (!data) {
    return <p className="text-sm text-muted-foreground">Could not load analytics right now.</p>;
  }

  const { summary, salesTrend, orders, topProducts, funnel, lowStock, productPerformance, range: dataRange } = data;

  // Pull the three requested funnel stages out by name so the summary cards
  // stay correct even if the stage order in the API response ever changes.
  const addToCartSessions = funnel.find((f) => f.stage === 'Added to cart')?.sessions ?? 0;
  const checkoutSessions = funnel.find((f) => f.stage === 'Started checkout')?.sessions ?? 0;
  const purchaseSessions = funnel.find((f) => f.stage === 'Purchased')?.sessions ?? 0;

  // Bars: one per day in the selected range, showing that day's total revenue.
  const dayData = salesTrend.map((d) => ({ date: d.date, revenue: d.revenue }));
  // Dots: one per order, positioned on the same day-bucket, at its exact price —
  // hovering a dot (or its day) surfaces the exact order time & price.
  const orderScatterData = orders.map((o) => ({
    date: o.time.slice(0, 10),
    amount: o.amount,
    time: o.time,
    status: o.status,
  }));

  // Under 24h -> show the precise hour count (matches the picker's "Last 1
  // hour" / "Last 6 hours" etc. presets). 24h+ -> day-based label as before.
  const rangeLabel =
    dataRange.hours < 24
      ? `Last ${Math.round(dataRange.hours)} hour${Math.round(dataRange.hours) === 1 ? '' : 's'}`
      : dataRange.days === 1
      ? new Date(dataRange.from).toLocaleDateString('en-IN', { dateStyle: 'medium' })
      : `${dataRange.days} days`;

  // Smoothly scrolls an in-page section into view -- used by the summary
  // cards above so clicking e.g. "Revenue" jumps straight to the chart that
  // explains it, instead of the click doing nothing.
  const scrollToSection = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="grid gap-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4 xl:grid-cols-8">
        <SummaryCard
          icon={<TrendingUp className="h-4 w-4" />}
          label="Revenue"
          sublabel={rangeLabel}
          value={formatINR(summary.totalRevenue)}
          onClick={() => scrollToSection('analytics-sales-trend')}
        />
        <SummaryCard
          icon={<ShoppingBag className="h-4 w-4" />}
          label="Orders"
          sublabel={rangeLabel}
          value={String(summary.orderCount)}
          onClick={() => router.push('/admin?section=orders')}
        />
        <SummaryCard
          icon={<Receipt className="h-4 w-4" />}
          label="Avg. order value"
          sublabel={rangeLabel}
          value={formatINR(summary.avgOrderValue)}
          onClick={() => scrollToSection('analytics-sales-trend')}
        />
        <SummaryCard
          icon={<Percent className="h-4 w-4" />}
          label="Conversion rate"
          sublabel={rangeLabel}
          value={`${summary.conversionRate}%`}
          onClick={() => scrollToSection('analytics-conversion-funnel')}
        />
        <SummaryCard
          icon={<ShoppingCart className="h-4 w-4" />}
          label="Add to cart"
          sublabel={rangeLabel}
          value={String(addToCartSessions)}
          onClick={() => scrollToSection('analytics-product-performance')}
        />
        <SummaryCard
          icon={<CreditCard className="h-4 w-4" />}
          label="Begin checkout"
          sublabel={rangeLabel}
          value={String(checkoutSessions)}
          onClick={() => scrollToSection('analytics-product-performance')}
        />
        <SummaryCard
          icon={<CheckCircle2 className="h-4 w-4" />}
          label="Purchase"
          sublabel={rangeLabel}
          value={String(purchaseSessions)}
          onClick={() => scrollToSection('analytics-product-performance')}
        />
        <SummaryCard
          icon={<PackageX className="h-4 w-4" />}
          label="Low stock"
          value={String(summary.lowStockCount)}
          tone={summary.lowStockCount > 0 ? 'warn' : undefined}
          onClick={() => router.push('/admin?section=restock-alerts')}
        />
      </div>

      {/* Sales trend + exact order time & price */}
      <div id="analytics-sales-trend" className="scroll-mt-4 rounded-xl border border-border/60 bg-card p-4 shadow-sm">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-serif text-lg font-bold text-primary">Sales Trend & Orders — {rangeLabel}</h3>
        </div>
        <div className="mb-3 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: BAR_COLOR }} />
            Daily revenue
          </span>
          <span className="flex items-center gap-1.5">
            <span
              className="h-2.5 w-2.5 rounded-full ring-2 ring-white"
              style={{ backgroundColor: ORDER_DOT_COLOR }}
            />
            Individual order — exact time &amp; price (hover to see)
          </span>
        </div>
        <ResponsiveContainer width="100%" height={320}>
          <ComposedChart margin={{ left: 0, right: 16, top: 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis
              dataKey="date"
              type="category"
              allowDuplicatedCategory={false}
              tick={{ fontSize: 11 }}
              tickFormatter={(d) => new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
              minTickGap={20}
            />
            <YAxis tick={{ fontSize: 11 }} width={70} tickFormatter={(v) => formatINR(v)} />
            <Tooltip content={<SalesTooltip />} />
            <Bar dataKey="revenue" data={dayData as any} fill={BAR_COLOR} radius={[3, 3, 0, 0]} barSize={18} />
            <Scatter dataKey="amount" data={orderScatterData as any} fill={ORDER_DOT_COLOR} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Top products */}
        <div className="rounded-xl border border-border/60 bg-card p-4 shadow-sm">
          <h3 className="mb-3 font-serif text-lg font-bold text-primary">Top Products — by revenue</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart
              data={topProducts.slice(0, 8)}
              layout="vertical"
              margin={{ left: 8, right: 16, top: 0, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => formatINR(v)} />
              <YAxis
                type="category"
                dataKey="name"
                tick={{ fontSize: 11 }}
                width={100}
                tickFormatter={(n: string) => (n.length > 14 ? n.slice(0, 13) + '…' : n)}
              />
              <Tooltip formatter={(v: number) => formatINR(v)} />
              <Bar dataKey="revenue" fill="#8b5e3c" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Conversion funnel */}
        <div id="analytics-conversion-funnel" className="scroll-mt-4 rounded-xl border border-border/60 bg-card p-4 shadow-sm">
          <h3 className="mb-3 font-serif text-lg font-bold text-primary">Conversion Funnel — {rangeLabel}</h3>
          <ResponsiveContainer width="100%" height={280}>
            <FunnelChart>
              <Tooltip />
              <Funnel dataKey="sessions" data={funnel} isAnimationActive>
                <LabelList position="right" fill="#555" stroke="none" dataKey="stage" />
                {funnel.map((_, i) => (
                  <Cell key={i} fill={FUNNEL_COLORS[i] ?? '#ccc'} />
                ))}
              </Funnel>
            </FunnelChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Product performance: Impressions vs Conversion */}
      <div id="analytics-product-performance" className="scroll-mt-4 rounded-xl border border-border/60 bg-card p-4 shadow-sm">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-serif text-lg font-bold text-primary">Product Performance</h3>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={perfSearch}
              onChange={(e) => {
                setPerfSearch(e.target.value);
                setPerfVisibleCount(PERF_PAGE_SIZE);
              }}
              placeholder="Search product..."
              className="rounded-md border border-border/60 bg-background px-2 py-1 text-xs"
            />
          </div>
        </div>
        <p className="mb-3 text-xs text-muted-foreground">
          Impressions = product page views. Add to cart / Begin checkout / Purchase = how many sessions/orders
          reached that step with this product, in the {rangeLabel.toLowerCase()} window selected above. Conversion =
          % of impressions that led to a purchase.
        </p>
        {(() => {
          const filtered = productPerformance.filter((p) =>
            p.name.toLowerCase().includes(perfSearch.trim().toLowerCase())
          );
          if (productPerformance.length === 0) {
            return (
              <p className="text-sm text-muted-foreground">
                No product activity recorded in this period yet.
              </p>
            );
          }
          if (filtered.length === 0) {
            return <p className="text-sm text-muted-foreground">No product matches "{perfSearch}".</p>;
          }
          const sortDirMultiplier = perfSortDir === 'desc' ? -1 : 1;
          const sorted = [...filtered].sort((a, b) => {
            if (perfSortKey === 'name') return a.name.localeCompare(b.name) * sortDirMultiplier;
            return (a[perfSortKey] - b[perfSortKey]) * sortDirMultiplier;
          });
          const visible = sorted.slice(0, perfVisibleCount);
          const hasMore = sorted.length > visible.length;
          return (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="border-b border-border/60 text-left text-xs text-muted-foreground">
                      <SortableTh
                        label="Product"
                        active={perfSortKey === 'name'}
                        dir={perfSortDir}
                        onClick={() => togglePerfSort('name')}
                      />
                      <SortableTh
                        label="Impressions"
                        active={perfSortKey === 'impressions'}
                        dir={perfSortDir}
                        onClick={() => togglePerfSort('impressions')}
                      />
                      <SortableTh
                        label="Add to cart"
                        active={perfSortKey === 'addToCart'}
                        dir={perfSortDir}
                        onClick={() => togglePerfSort('addToCart')}
                      />
                      <SortableTh
                        label="Begin checkout"
                        active={perfSortKey === 'beginCheckout'}
                        dir={perfSortDir}
                        onClick={() => togglePerfSort('beginCheckout')}
                      />
                      <SortableTh
                        label="Purchase"
                        active={perfSortKey === 'purchases'}
                        dir={perfSortDir}
                        onClick={() => togglePerfSort('purchases')}
                      />
                      <SortableTh
                        label="Conversion"
                        active={perfSortKey === 'conversionRate'}
                        dir={perfSortDir}
                        onClick={() => togglePerfSort('conversionRate')}
                      />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {visible.map((p) => (
                      <tr key={p.productId}>
                        <td className="py-2 pr-3">
                          <div className="flex items-center gap-2">
                            {p.image ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={p.image} alt={p.name} className="h-8 w-8 rounded-md object-cover" />
                            ) : (
                              <div className="h-8 w-8 rounded-md bg-muted" />
                            )}
                            <div className="min-w-0">
                              <span className="block max-w-[220px] truncate font-medium">{p.name}</span>
                              <div className="mt-1 flex items-center gap-1.5">
                                {/* Explicit "Colour: X" (rather than a bare
                                    thumbnail) so it's never ambiguous whether
                                    the photo above is one specific colour
                                    variant's own photo or just the product's
                                    generic default -- when this is blank, no
                                    colour-level activity has been recorded
                                    for this product yet, and the photo above
                                    is the plain default. */}
                                {p.variantColor && (
                                  <span className="truncate text-[11px] text-muted-foreground">
                                    Colour: {p.variantColor}
                                  </span>
                                )}
                                {p.slug && (
                                  <a
                                    href={`/product/${p.slug}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="shrink-0 rounded border border-border/60 px-1.5 py-0.5 text-[10px] font-medium text-primary transition-colors hover:bg-accent"
                                    title={p.variantColor ? `Open the ${p.variantColor} variation` : 'Open this product'}
                                  >
                                    View →
                                  </a>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="py-2 pr-3 text-emerald-600">{p.impressions}</td>
                        <td className="py-2 pr-3 text-amber-600">{p.addToCart}</td>
                        <td className="py-2 pr-3 text-sky-600">{p.beginCheckout}</td>
                        <td className="py-2 pr-3 text-violet-600">{p.purchases}</td>
                        <td
                          className={`py-2 font-medium ${
                            p.conversionRate > 0 ? 'text-emerald-600' : 'text-destructive'
                          }`}
                        >
                          {p.conversionRate.toFixed(2)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {hasMore && (
                <div className="mt-3 flex justify-center">
                  <button
                    onClick={() => setPerfVisibleCount((c) => c + PERF_PAGE_SIZE)}
                    className="rounded-md border border-border/60 px-4 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    Show more ({sorted.length - visible.length} more)
                  </button>
                </div>
              )}
            </>
          );
        })()}
      </div>

      {/* Low stock alerts */}
      <div className="rounded-xl border border-border/60 bg-card p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          <h3 className="font-serif text-lg font-bold text-primary">
            Low Stock Alerts{' '}
            {lowStock.length > 0 && (
              <span className="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-sm text-amber-800">
                {lowStock.length}
              </span>
            )}
          </h3>
        </div>
        {lowStock.length === 0 ? (
          <p className="text-sm text-muted-foreground">All products are well-stocked.</p>
        ) : (
          (() => {
            // Lowest stock always first, regardless of the order the API
            // returned them in.
            const sorted = [...lowStock].sort((a, b) => a.stock_quantity - b.stock_quantity);
            const visible = sorted.slice(0, lowStockVisibleCount);
            const hasMore = sorted.length > visible.length;
            return (
              <>
                <ul className="divide-y divide-border/40">
                  {visible.map((p) => (
                    <li key={p.id} className="py-2.5">
                      <div className="flex flex-wrap items-center gap-3">
                        {p.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.image} alt={p.name} className="h-10 w-10 shrink-0 rounded-md object-cover" />
                        ) : (
                          <div className="h-10 w-10 shrink-0 rounded-md bg-muted" />
                        )}
                        <div className="min-w-[120px] flex-1">
                          <span className="block truncate text-sm font-medium">{p.name}</span>
                          <span className="text-xs text-muted-foreground sm:hidden">
                            Threshold: {p.low_stock_threshold}
                          </span>
                        </div>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${
                            p.stock_quantity === 0
                              ? 'bg-destructive/10 text-destructive'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {p.stock_quantity === 0 ? 'Out of stock' : `${p.stock_quantity} left`}
                        </span>
                        <span className="hidden text-xs text-muted-foreground sm:inline">
                          Threshold: {p.low_stock_threshold}
                        </span>
                        {stockEditId === p.id ? (
                          <div className="flex flex-wrap items-center gap-1">
                            <input
                              type="number"
                              min={1}
                              autoFocus
                              value={stockAddAmount}
                              onChange={(e) => setStockAddAmount(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleAddStock(p.id, p.stock_quantity);
                                if (e.key === 'Escape') setStockEditId(null);
                              }}
                              className="w-16 rounded-md border border-border/60 bg-background px-2 py-1 text-xs"
                            />
                            <button
                              onClick={() => handleAddStock(p.id, p.stock_quantity)}
                              disabled={stockSaving}
                              className="rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
                            >
                              {stockSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Save'}
                            </button>
                            <button
                              onClick={() => setStockEditId(null)}
                              disabled={stockSaving}
                              className="rounded-md border border-border/60 px-2 py-1 text-xs text-muted-foreground hover:bg-accent"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              setStockEditId(p.id);
                              setStockAddAmount(DEFAULT_RESTOCK_AMOUNT);
                            }}
                            className="flex shrink-0 items-center gap-1 rounded-md border border-border/60 px-2 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
                          >
                            <PackagePlus className="h-3.5 w-3.5" />
                            Add stock
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
                {hasMore && (
                  <div className="mt-3 flex justify-center">
                    <button
                      onClick={() => setLowStockVisibleCount((c) => c + LOW_STOCK_PAGE_SIZE)}
                      className="rounded-md border border-border/60 px-4 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    >
                      Show more ({sorted.length - visible.length} more)
                    </button>
                  </div>
                )}
              </>
            );
          })()
        )}
      </div>
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  sublabel,
  value,
  tone,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  sublabel?: string;
  value: string;
  tone?: 'warn';
  onClick?: () => void;
}) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      onClick={onClick}
      type={onClick ? 'button' : undefined}
      className={`min-w-0 rounded-xl border p-3 text-left shadow-sm transition-all sm:p-4 ${
        tone === 'warn' ? 'border-amber-300 bg-amber-50' : 'border-border/60 bg-card'
      } ${onClick ? 'cursor-pointer hover:-translate-y-0.5 hover:shadow-md hover:border-primary/50' : ''}`}
    >
      <div className="flex items-center justify-between gap-1.5 text-xs text-muted-foreground">
        <span className="flex min-w-0 items-center gap-1.5 truncate">
          {icon}
          <span className="truncate">{label}</span>
        </span>
        {sublabel && (
          <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px]">{sublabel}</span>
        )}
      </div>
      <p className="mt-2 truncate text-lg font-semibold sm:text-xl">{value}</p>
    </Tag>
  );
}

// ── Main export ────────────────────────────────────────────────────────────

export default function AnalyticsPanel() {
  const [activeTab, setActiveTab] = useState<Tab>('sales');
  const [range, setRange] = useState<SimpleRange>(() => ({
    from: startOfDay(subDays(new Date(), 29)),
    to: endOfDay(new Date()),
  }));

  return (
    <div>
      <TabBar
        active={activeTab}
        onChange={setActiveTab}
        right={<DateRangePicker value={range} onChange={setRange} />}
      />
      {activeTab === 'sales' ? (
        <SalesPanel range={range} onRangeChange={setRange} />
      ) : activeTab === 'traffic' ? (
        <TrafficPanel />
      ) : activeTab === 'search' ? (
        <SearchInsightsPanel />
      ) : (
        <VariantSwitchesPanel />
      )}
    </div>
  );
}
