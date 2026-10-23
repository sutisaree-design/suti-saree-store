import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

// Computes "customers who bought this also bought" purely from real
// order history (no admin setup needed) -- looks at every order that
// contained the target product, tallies which other products showed up
// alongside it, and returns the top 4 by frequency.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const productId = searchParams.get('productId');
  if (!productId) {
    return NextResponse.json({ error: 'productId is required' }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();

    const { data: coOrders, error: ordersErr } = await supabase
      .from('order_items')
      .select('order_id')
      .eq('product_id', productId)
      .limit(200);
    if (ordersErr) throw ordersErr;

    const orderIds = Array.from(new Set((coOrders ?? []).map((r) => r.order_id)));
    if (orderIds.length === 0) return NextResponse.json({ products: [] });

    const { data: coItems, error: itemsErr } = await supabase
      .from('order_items')
      .select('product_id')
      .in('order_id', orderIds)
      .neq('product_id', productId);
    if (itemsErr) throw itemsErr;

    const counts = new Map<string, number>();
    for (const item of coItems ?? []) {
      if (!item.product_id) continue;
      counts.set(item.product_id, (counts.get(item.product_id) || 0) + 1);
    }

    const topIds = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([id]) => id);

    if (topIds.length === 0) return NextResponse.json({ products: [] });

    const { data: products, error: prodErr } = await supabase
      .from('products')
      .select(
        'id, name, slug, description, price, mrp, category_id, category_name, fabric, origin, colors, sizes, occasion, gender, age_group, material, pattern, images, video_url, sku, highlights, stock_quantity, low_stock_threshold, rating, reviews, featured, in_stock, created_at, updated_at'
      )
      .in('id', topIds)
      .eq('in_stock', true)
      .eq('approval_status', 'live');
    if (prodErr) throw prodErr;

    return NextResponse.json({ products: products ?? [] });
  } catch {
    return NextResponse.json({ products: [] });
  }
}
