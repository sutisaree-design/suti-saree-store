export interface SalesTrendPoint {
  date: string;
  revenue: number;
  orders: number;
}

export interface OrderPoint {
  id: string;
  /** exact order timestamp (ISO string) */
  time: string;
  /** exact order price/total */
  amount: number;
  status: string;
}

export interface TopProduct {
  productId: string | null;
  name: string;
  unitsSold: number;
  revenue: number;
  image: string | null;
}

export interface FunnelStage {
  stage: string;
  sessions: number;
}

export interface ProductPerformance {
  productId: string;
  name: string;
  /** This exact row's own product page -- the top-performing colour
   *  variant's slug when one is known, the base product's slug otherwise.
   *  Always populated when a page exists for it, so "View" never silently
   *  disappears. */
  slug: string | null;
  /** The photo shown above -- the top-performing colour's own photo when
   *  `variantColor` is set, the product's plain default photo otherwise. */
  image: string | null;
  /** The colour this row's photo/name/link represent, when any colour-level
   *  activity has been recorded for this product (ranked Purchase > Begin
   *  checkout > Add to cart > Impressions, same ranking used elsewhere on
   *  this dashboard). Null means no colour-level data exists yet -- the
   *  photo above is just the product's generic default, not any specific
   *  variant. Impressions/addToCart/beginCheckout/purchases below are
   *  always the *whole product's* totals across every colour, regardless
   *  of which colour is highlighted here. */
  variantColor: string | null;
  impressions: number;
  /** sessions that added this product to cart, within the window */
  addToCart: number;
  /** sessions that reached checkout with this product in cart, within the window */
  beginCheckout: number;
  /** completed orders containing this product, within the window (any order
   *  that isn't cancelled/failed -- includes Cash on Delivery orders that
   *  are still 'pending' payment collection). */
  purchases: number;
  conversions: number;
  conversionRate: number;
}

export interface LowStockProduct {
  id: string;
  name: string;
  image: string | null;
  stock_quantity: number;
  low_stock_threshold: number;
  in_stock: boolean;
}

export interface AnalyticsRange {
  /** full ISO timestamp, not just a date -- preserves hour-level precision for presets like "Last 1 hour" */
  from: string;
  /** full ISO timestamp */
  to: string;
  days: number;
  hours: number;
}

export interface AnalyticsData {
  summary: {
    totalRevenue: number;
    orderCount: number;
    avgOrderValue: number;
    conversionRate: number;
    lowStockCount: number;
  };
  range: AnalyticsRange;
  salesTrend: SalesTrendPoint[];
  orders: OrderPoint[];
  topProducts: TopProduct[];
  funnel: FunnelStage[];
  lowStock: LowStockProduct[];
  /** Product Performance now shares the same [from, to] window as everything
   *  else on the dashboard -- there's a single date/time control, not a
   *  separate one just for this table. */
  productPerformance: ProductPerformance[];
}

export interface FetchAnalyticsOptions {
  /** full ISO timestamp (or yyyy-MM-dd for a whole-day range) */
  from?: string;
  /** full ISO timestamp (or yyyy-MM-dd for a whole-day range) */
  to?: string;
}

export async function fetchAnalytics(options: FetchAnalyticsOptions = {}): Promise<AnalyticsData> {
  const params = new URLSearchParams();
  if (options.from) params.set('from', options.from);
  if (options.to) params.set('to', options.to);
  const qs = params.toString();
  const res = await fetch(`/api/admin/analytics${qs ? `?${qs}` : ''}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to load analytics');
  }
  return res.json();
}
