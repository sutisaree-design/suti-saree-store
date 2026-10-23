import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAdminToken, ADMIN_SESSION_COOKIE } from '@/lib/admin-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

const DEFAULT_RANGE_DAYS = 30;
const MAX_RANGE_DAYS = 365;
const MAX_EVENT_ROWS = 20000; // safety cap, same as app/api/admin/search-insights/route.ts

/**
 * Admin > Analytics > Variant switches. Reads the 'variant_switch' rows
 * logged from app/product/[slug]/product-detail.tsx (handleSelectVariant)
 * every time a shopper taps a different colour swatch on a product page,
 * and aggregates them in memory -- same approach
 * app/api/admin/search-insights/route.ts uses for search terms.
 *
 * Answers: "for each product, which colour do people switch TO the most?"
 * -- useful for deciding which colour photo to lead the shop grid with,
 * and which colours to keep in stock.
 *
 * Returns:
 *   byProduct -- one row per product_id, with a toColor breakdown sorted
 *                by switch count, plus totalSwitches for that product.
 *   topProducts -- byProduct sorted by totalSwitches, most-switched first
 *                  (i.e. "these products have the most colour indecision /
 *                  colour interest").
 *   totalSwitches, rangeDays
 */
export async function GET(req: Request) {
  const cookie = cookies().get(ADMIN_SESSION_COOKIE)?.value ?? null;
  const verified = await verifyAdminToken(cookie);
  if (!verified.valid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const requestedDays = Number(url.searchParams.get('days'));
  const rangeDays =
    Number.isFinite(requestedDays) && requestedDays > 0
      ? Math.min(MAX_RANGE_DAYS, Math.round(requestedDays))
      : DEFAULT_RANGE_DAYS;

  const since = new Date();
  since.setUTCDate(since.getUTCDate() - rangeDays);

  try {
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from('activity_events')
      .select('product_id, metadata, created_at')
      .eq('event_type', 'variant_switch')
      .gte('created_at', since.toISOString())
      .not('product_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(MAX_EVENT_ROWS);

    if (error) throw error;

    const events = data ?? [];

    type ColorAgg = { toColor: string; count: number };
    const byProduct = new Map<
      string,
      { productId: string; totalSwitches: number; colors: Map<string, ColorAgg> }
    >();

    for (const e of events) {
      const productId = e.product_id as string | null;
      if (!productId) continue;
      const toColor = typeof e.metadata?.toColor === 'string' ? e.metadata.toColor : 'Unknown';

      const productEntry =
        byProduct.get(productId) ??
        { productId, totalSwitches: 0, colors: new Map<string, ColorAgg>() };
      productEntry.totalSwitches += 1;

      const colorEntry = productEntry.colors.get(toColor) ?? { toColor, count: 0 };
      colorEntry.count += 1;
      productEntry.colors.set(toColor, colorEntry);

      byProduct.set(productId, productEntry);
    }

    // Fetch product names in one go so the response is directly renderable
    // without a second round-trip from the admin dashboard.
    const productIds = Array.from(byProduct.keys());
    const { data: products } = productIds.length
      ? await supabase.from('products').select('id, name, slug').in('id', productIds)
      : { data: [] as { id: string; name: string; slug: string }[] };
    const productMap = new Map((products ?? []).map((p) => [p.id, p]));

    const byProductArr = Array.from(byProduct.values())
      .map((p) => ({
        productId: p.productId,
        productName: productMap.get(p.productId)?.name ?? 'Unknown product',
        productSlug: productMap.get(p.productId)?.slug ?? null,
        totalSwitches: p.totalSwitches,
        colors: Array.from(p.colors.values()).sort((a, b) => b.count - a.count),
      }))
      .sort((a, b) => b.totalSwitches - a.totalSwitches);

    return NextResponse.json({
      byProduct: byProductArr,
      topProducts: byProductArr.slice(0, 50),
      totalSwitches: events.length,
      rangeDays,
    });
  } catch (err) {
    console.error('[admin/variant-switches] failed:', err);
    return NextResponse.json({ error: 'Failed to load variant switch insights' }, { status: 500 });
  }
}
