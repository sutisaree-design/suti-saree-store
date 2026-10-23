import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAdminToken, ADMIN_SESSION_COOKIE } from '@/lib/admin-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { getVariantDisplayName } from '@/lib/variant-display-name';

const REVENUE_STATUSES = ['paid', 'shipped', 'delivered'];
const EXCLUDED_ORDER_STATUSES = ['cancelled', 'failed'];
const DEFAULT_RANGE_DAYS = 30;
const MAX_RANGE_DAYS = 365;
const MAX_ORDER_POINTS = 1000;

function dayKey(dateStr: string) {
  return new Date(dateStr).toISOString().slice(0, 10);
}

/**
 * Reads `?from=...&to=...` from the request. Accepts either a full ISO
 * timestamp (e.g. from the admin dashboard's hour-level presets like
 * "Last 1 hour", which need real hour/minute precision) or a plain
 * `YYYY-MM-DD` date (older callers / bookmarked links), which gets padded
 * to the start/end of that day. Falls back to the last 30 days (inclusive
 * of today) when either is missing or invalid.
 */
function parseRange(url: URL) {
  const fromParam = url.searchParams.get('from');
  const toParam = url.searchParams.get('to');

  const parseParam = (p: string | null, isEnd: boolean): Date | null => {
    if (!p) return null;
    const d = /^\d{4}-\d{2}-\d{2}$/.test(p) ? new Date(`${p}T${isEnd ? '23:59:59.999' : '00:00:00.000'}Z`) : new Date(p);
    return isNaN(d.getTime()) ? null : d;
  };

  let to = parseParam(toParam, true) ?? new Date();
  let from =
    parseParam(fromParam, false) ??
    (() => {
      const d = new Date(to);
      d.setUTCDate(d.getUTCDate() - (DEFAULT_RANGE_DAYS - 1));
      d.setUTCHours(0, 0, 0, 0);
      return d;
    })();

  const invalid = isNaN(from.getTime()) || isNaN(to.getTime()) || from > to;
  if (invalid) {
    to = new Date();
    from = new Date(to);
    from.setUTCDate(from.getUTCDate() - (DEFAULT_RANGE_DAYS - 1));
    from.setUTCHours(0, 0, 0, 0);
  }

  const rangeHours = Math.max(1, (to.getTime() - from.getTime()) / 3_600_000);
  const rangeDays = Math.min(MAX_RANGE_DAYS, Math.max(1, Math.ceil(rangeHours / 24)));

  return { from, to, rangeDays, rangeHours };
}

export async function GET(req: Request) {
  const cookie = cookies().get(ADMIN_SESSION_COOKIE)?.value ?? null;
  const verified = await verifyAdminToken(cookie);
  if (!verified.valid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const { from, to, rangeDays, rangeHours } = parseRange(url);

  try {
    const supabase = getSupabaseAdmin();

    // Product Performance used to run on its own separate hours/days window
    // (independent of the `from`/`to` picker above), which meant its "Last
    // 1 hour" and the summary cards' "Last 1 hour" could silently mean two
    // different actual time windows. It now shares the exact same `from`/
    // `to` range as the summary cards, funnel, and sales trend -- one
    // control, one window, everywhere on this dashboard.
    const [ordersRes, productsRes, eventsRes, variantsRes] = await Promise.all([
      supabase
        .from('orders')
        .select('id, items, total_amount, status, created_at')
        .order('created_at', { ascending: false }),
      supabase
        .from('products')
        .select('id, name, slug, images, colors, stock_quantity, low_stock_threshold, in_stock')
        .order('stock_quantity', { ascending: true }),
      supabase
        .from('activity_events')
        // `metadata` is included so we can read the colour a shopper was
        // looking at/adding to cart/checking out with (metadata.color),
        // which powers the per-colour breakdown in Product Performance below.
        .select('session_id, event_type, product_id, metadata, created_at')
        .gte('created_at', from.toISOString())
        .lte('created_at', to.toISOString()),
      supabase
        .from('product_variants')
        .select('id, product_id, color, images, slug'),
    ]);

    if (ordersRes.error) throw ordersRes.error;
    if (productsRes.error) throw productsRes.error;
    if (eventsRes.error) throw eventsRes.error;
    if (variantsRes.error) throw variantsRes.error;

    const orders = ordersRes.data ?? [];
    const products = productsRes.data ?? [];
    const events = eventsRes.data ?? [];
    const variants = variantsRes.data ?? [];

    // productId -> color -> { image, slug }. Used to resolve a "top colour"
    // (see Product Performance below) to an actual clickable variant page
    // and thumbnail, without a second round trip from the dashboard.
    const variantLookup = new Map<string, Map<string, { image: string | null; slug: string }>>();
    for (const v of variants) {
      if (!v.product_id || !v.color) continue;
      const byColor = variantLookup.get(v.product_id) ?? new Map();
      byColor.set(v.color, { image: v.images?.[0] ?? null, slug: v.slug });
      variantLookup.set(v.product_id, byColor);
    }

    // ---------------- Orders that fall inside the selected date range ----------------
    const ordersInRange = orders.filter((o) => {
      if (!o.created_at) return false;
      const t = new Date(o.created_at).getTime();
      return t >= from.getTime() && t <= to.getTime();
    });

    // ---------------- Sales trend (one bucket per day across the range) ----------------
    const trendMap = new Map<string, { revenue: number; orders: number }>();
    for (let i = 0; i < rangeDays; i++) {
      const d = new Date(from);
      d.setUTCDate(d.getUTCDate() + i);
      trendMap.set(d.toISOString().slice(0, 10), { revenue: 0, orders: 0 });
    }
    let totalRevenue = 0;
    let orderCount = 0;
    for (const o of ordersInRange) {
      const key = dayKey(o.created_at);
      const bucket = trendMap.get(key);
      if (!bucket) continue;
      if (!EXCLUDED_ORDER_STATUSES.includes(o.status)) {
        bucket.orders += 1;
        orderCount += 1;
      }
      if (REVENUE_STATUSES.includes(o.status)) {
        bucket.revenue += o.total_amount || 0;
        totalRevenue += o.total_amount || 0;
      }
    }
    const salesTrend = Array.from(trendMap.entries()).map(([date, v]) => ({
      date,
      revenue: v.revenue,
      orders: v.orders,
    }));

    // ---------------- Individual orders: exact time + price for the chart ----------------
    // Every order in the selected range, with its precise timestamp and
    // amount, so the chart can plot (and the tooltip can show) the exact
    // order time and price rather than only a per-day average.
    const orderPoints = ordersInRange
      .filter((o) => !EXCLUDED_ORDER_STATUSES.includes(o.status))
      .map((o) => ({
        id: o.id,
        time: o.created_at,
        amount: o.total_amount || 0,
        status: o.status,
      }))
      .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime())
      .slice(-MAX_ORDER_POINTS);

    // ---------------- Top products (all-time, by revenue) ----------------
    const productAgg = new Map<
      string,
      { productId: string | null; name: string; unitsSold: number; revenue: number; image: string | null }
    >();
    for (const o of orders) {
      if (!REVENUE_STATUSES.includes(o.status)) continue;
      const items = Array.isArray(o.items) ? o.items : [];
      for (const it of items) {
        const key = it.product_id || it.product_name;
        if (!key) continue;
        const existing = productAgg.get(key) || {
          productId: it.product_id ?? null,
          name: it.product_name || 'Unknown product',
          unitsSold: 0,
          revenue: 0,
          image: it.image_url ?? null,
        };
        existing.unitsSold += it.quantity || 0;
        existing.revenue += (it.price || 0) * (it.quantity || 0);
        if (!existing.image && it.image_url) existing.image = it.image_url;
        productAgg.set(key, existing);
      }
    }
    const topProducts = Array.from(productAgg.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    // ---------------- Conversion funnel (session-based, selected range) ----------------
    // `events` is already scoped to [from, to] by the Supabase query above.
    const eventsInRange = events;
    const sessionsByStage: Record<string, Set<string>> = {
      page_view: new Set(),
      product_view: new Set(),
      add_to_cart: new Set(),
      checkout_start: new Set(),
      purchase: new Set(),
    };
    for (const ev of eventsInRange) {
      if (sessionsByStage[ev.event_type]) sessionsByStage[ev.event_type].add(ev.session_id);
    }
    const funnel = [
      { stage: 'Visited', sessions: sessionsByStage.page_view.size },
      { stage: 'Viewed a product', sessions: sessionsByStage.product_view.size },
      { stage: 'Added to cart', sessions: sessionsByStage.add_to_cart.size },
      { stage: 'Started checkout', sessions: sessionsByStage.checkout_start.size },
      { stage: 'Purchased', sessions: sessionsByStage.purchase.size },
    ];
    const conversionRate =
      sessionsByStage.page_view.size > 0
        ? Number(((sessionsByStage.purchase.size / sessionsByStage.page_view.size) * 100).toFixed(1))
        : 0;

    // ---------------- Low stock alerts (always all-time, not range-bound) ----------------
    const lowStock = products
      .filter((p) => p.stock_quantity <= (p.low_stock_threshold ?? 5))
      .map((p) => ({
        id: p.id,
        name: p.name,
        image: p.images?.[0] ?? null,
        stock_quantity: p.stock_quantity,
        low_stock_threshold: p.low_stock_threshold ?? 5,
        in_stock: p.in_stock,
      }))
      // Explicit sort (rather than relying on the products query's own
      // ordering) so the lowest-stock item is always first, even if that
      // upstream ordering ever changes.
      .sort((a, b) => a.stock_quantity - b.stock_quantity);

    // ---------------- Product performance: Impressions vs Conversion (same [from, to] window as everything else above) ----------------
    // Per-colour breakdown alongside the per-product totals: `metadata.color`
    // is stamped on product_view / add_to_cart / checkout_start events (see
    // app/product/[slug]/product-detail.tsx and app/checkout/page.tsx), and
    // each order line item already carries the exact colour that was bought
    // (order.items[].color). Grouping those by (product_id, color) lets the
    // dashboard surface which *variation* is actually driving clicks/carts/
    // checkouts/purchases, not just which base product.
    type ColorStats = { color: string; impressions: number; addToCart: number; beginCheckout: number; purchases: number };
    const productViewCounts = new Map<string, number>();
    const productAddToCartCounts = new Map<string, number>();
    const productCheckoutStartCounts = new Map<string, number>();
    const productColorStats = new Map<string, Map<string, ColorStats>>();

    const bumpColor = (
      productId: string,
      color: string | null | undefined,
      field: 'impressions' | 'addToCart' | 'beginCheckout' | 'purchases',
      amount = 1
    ) => {
      if (!color) return;
      const byColor = productColorStats.get(productId) ?? new Map<string, ColorStats>();
      const entry = byColor.get(color) ?? { color, impressions: 0, addToCart: 0, beginCheckout: 0, purchases: 0 };
      entry[field] += amount;
      byColor.set(color, entry);
      productColorStats.set(productId, byColor);
    };

    for (const ev of eventsInRange) {
      if (!ev.product_id) continue;
      const color = typeof ev.metadata?.color === 'string' ? ev.metadata.color : null;
      if (ev.event_type === 'product_view') {
        productViewCounts.set(ev.product_id, (productViewCounts.get(ev.product_id) ?? 0) + 1);
        bumpColor(ev.product_id, color, 'impressions');
      } else if (ev.event_type === 'add_to_cart') {
        productAddToCartCounts.set(ev.product_id, (productAddToCartCounts.get(ev.product_id) ?? 0) + 1);
        bumpColor(ev.product_id, color, 'addToCart');
      } else if (ev.event_type === 'checkout_start') {
        productCheckoutStartCounts.set(ev.product_id, (productCheckoutStartCounts.get(ev.product_id) ?? 0) + 1);
        bumpColor(ev.product_id, color, 'beginCheckout');
      }
    }

    // "Purchased" = a real order was placed for this product and it wasn't
    // cancelled/failed. Previously this only counted orders already marked
    // paid/shipped/delivered, which meant Cash-on-Delivery orders (created
    // with status 'pending' and often left that way until dispatch) never
    // showed up here at all -- the Purchase column looked stuck at 0 even
    // with real orders coming in. `orderCount`/the sales-trend "orders"
    // bucket above already use this same not-cancelled/failed rule, so this
    // now matches them instead of silently using a stricter definition.
    const productPurchaseCounts = new Map<string, number>();
    for (const o of ordersInRange) {
      if (EXCLUDED_ORDER_STATUSES.includes(o.status)) continue;
      const items = Array.isArray(o.items) ? o.items : [];
      const countedInThisOrder = new Set<string>();
      for (const it of items) {
        if (!it.product_id || countedInThisOrder.has(it.product_id)) continue;
        countedInThisOrder.add(it.product_id);
        productPurchaseCounts.set(it.product_id, (productPurchaseCounts.get(it.product_id) ?? 0) + 1);
        bumpColor(it.product_id, it.color ?? null, 'purchases');
      }
    }

    // Splitting into one strict row per *tracked* colour (an earlier pass at
    // this) turned out to lose data on real store traffic: add-to-cart
    // clicks and completed orders don't always carry `metadata.color` /
    // `items[].color` the way product-view events reliably do, so most of
    // a product's real Add to cart / Purchase counts ended up stranded in
    // a separate "leftover" row far down the list (sorted by impressions),
    // while the row actually shown at the top read 0 for both. Back to one
    // row per product -- so Impressions/Add to cart/Begin checkout/
    // Purchase always add up to the *complete*, correct totals no matter
    // how consistently colour was tagged on each event type -- but now
    // clearly labelled with exactly which colour's own photo is being
    // shown (previously a bare thumbnail with no indication of whether it
    // was "the product in general" or one specific variant), and every row
    // always gets a working View link (previously null whenever a product
    // had at most one colour with recorded activity).
    const productPerformance = products
      .map((p) => {
        const impressions = productViewCounts.get(p.id) ?? 0;
        const addToCart = productAddToCartCounts.get(p.id) ?? 0;
        const beginCheckout = productCheckoutStartCounts.get(p.id) ?? 0;
        const purchases = productPurchaseCounts.get(p.id) ?? 0;

        // Which colour to represent this row with: whichever colour has
        // the most activity (ranked Purchase > Begin checkout > Add to
        // cart > Impressions, same order the rest of this dashboard ranks
        // "popularity"), shown even when only one colour has any tracked
        // activity at all -- so the row is never ambiguous about whether
        // its photo is a specific variant or just a generic default.
        const byColor = productColorStats.get(p.id);
        const baseColor = (p.colors ?? [])[0] ?? null;
        let variantColor: string | null = null;
        let image = p.images?.[0] ?? null;
        let slug = p.slug ?? null;
        if (byColor && byColor.size > 0) {
          const ranked = Array.from(byColor.values()).sort(
            (a, b) =>
              b.purchases - a.purchases ||
              b.beginCheckout - a.beginCheckout ||
              b.addToCart - a.addToCart ||
              b.impressions - a.impressions
          );
          const best = ranked[0];
          const variantMatch = variantLookup.get(p.id)?.get(best.color) ?? null;
          const isBaseColor = baseColor === best.color;
          variantColor = best.color;
          image = variantMatch?.image ?? (isBaseColor ? p.images?.[0] ?? null : image);
          // Always keep the base product's own slug as a fallback so
          // "View" still opens *some* real page even if this exact colour
          // can't be resolved to its own variant page (e.g. the variant
          // was since removed from the catalog but old events still
          // reference its colour name).
          slug = variantMatch?.slug ?? (isBaseColor ? p.slug ?? null : slug);
        }

        return {
          productId: p.id,
          name: variantColor ? getVariantDisplayName(p.name, baseColor, variantColor) : p.name,
          slug,
          image,
          variantColor,
          impressions,
          addToCart,
          beginCheckout,
          purchases,
          conversions: purchases,
          conversionRate: impressions > 0 ? Number(((purchases / impressions) * 100).toFixed(2)) : 0,
        };
      })
      .filter((p) => p.impressions > 0 || p.addToCart > 0 || p.beginCheckout > 0 || p.purchases > 0)
      .sort((a, b) => b.impressions - a.impressions)
      .slice(0, 50);


    return NextResponse.json({
      summary: {
        totalRevenue,
        orderCount,
        avgOrderValue: orderCount > 0 ? Math.round(totalRevenue / orderCount) : 0,
        conversionRate,
        lowStockCount: lowStock.length,
      },
      range: {
        // Full ISO timestamps (not just the date) so the dashboard can tell
        // apart e.g. "Last 1 hour" from "Today" -- both used to collapse
        // to the same date-only string and get treated identically.
        from: from.toISOString(),
        to: to.toISOString(),
        days: rangeDays,
        hours: Math.round(rangeHours * 10) / 10,
      },
      salesTrend,
      orders: orderPoints,
      topProducts,
      funnel,
      lowStock,
      productPerformance,
    });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to load analytics' }, { status: 500 });
  }
}
