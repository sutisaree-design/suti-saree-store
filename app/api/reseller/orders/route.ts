import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/supabase-server-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

async function getResellerProfile(supabase: ReturnType<typeof getSupabaseAdmin>, userId: string) {
  const { data, error } = await supabase
    .from('reseller_profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// GET — orders this reseller has placed on behalf of their own customers.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Please log in first' }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();

  try {
    const profile = await getResellerProfile(supabase, user.id);
    if (!profile) {
      return NextResponse.json({ orders: [] });
    }

    const { data: orders, error } = await supabase
      .from('orders')
      .select(
        'id, items, total_amount, reseller_base_cost, reseller_profit, reseller_margin_percent, status, delivery_status, reseller_payout_status, customer_name, customer_phone, shipping_address, created_at'
      )
      .eq('reseller_id', profile.id)
      .order('created_at', { ascending: false });
    if (error) throw error;

    return NextResponse.json({ orders: orders ?? [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load orders';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST — reseller places an order on behalf of THEIR OWN customer.
// Prices are always recomputed server-side from the products table so a
// reseller can never tamper with the base cost or their margin client-side.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Please log in first' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const items = Array.isArray(body?.items) ? body.items : [];
  const marginRaw = Number(body?.margin_percent);
  const customerName = String(body?.customer_name || '').trim();
  const customerPhone = String(body?.customer_phone || '').trim();
  const customerEmail = body?.customer_email ? String(body.customer_email).trim() : null;
  const shippingAddress = body?.shipping_address;

  if (items.length === 0) {
    return NextResponse.json({ error: 'Add at least one product' }, { status: 400 });
  }
  if (!customerName || !customerPhone) {
    return NextResponse.json({ error: 'Customer name and phone are required' }, { status: 400 });
  }
  if (!shippingAddress?.address || !shippingAddress?.city || !shippingAddress?.state || !shippingAddress?.pincode) {
    return NextResponse.json({ error: 'Complete shipping address is required' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  try {
    const profile = await getResellerProfile(supabase, user.id);
    if (!profile) {
      return NextResponse.json({ error: 'You are not a reseller yet' }, { status: 403 });
    }
    if (profile.status !== 'active') {
      return NextResponse.json({ error: 'Your reseller account is currently suspended' }, { status: 403 });
    }

    const marginPercent = Number.isFinite(marginRaw) && marginRaw >= 0 ? marginRaw : profile.default_margin_percent;

    const productIds = items.map((i: any) => i.product_id).filter(Boolean);
    const { data: products, error: productsErr } = await supabase
      .from('products')
      .select('id, name, price, images, stock_quantity')
      .in('id', productIds);
    if (productsErr) throw productsErr;

    const productById = new Map((products ?? []).map((p) => [p.id, p]));

    let baseCost = 0;
    let totalAmount = 0;
    const orderItems: any[] = [];

    for (const raw of items) {
      const product = productById.get(raw.product_id);
      if (!product) {
        return NextResponse.json({ error: `Product not found: ${raw.product_id}` }, { status: 400 });
      }
      const quantity = Math.max(1, Number(raw.quantity) || 1);
      const basePrice = product.price;
      const sellingPrice = Math.round(basePrice * (1 + marginPercent / 100));

      baseCost += basePrice * quantity;
      totalAmount += sellingPrice * quantity;

      orderItems.push({
        product_id: product.id,
        product_name: product.name,
        image_url: product.images?.[0] ?? null,
        size: raw.size ?? null,
        quantity,
        price: sellingPrice, // what the reseller's own customer pays
        base_price: basePrice, // what the store charges the reseller
      });
    }

    const profit = totalAmount - baseCost;

    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .insert({
        items: orderItems,
        total_amount: totalAmount,
        subtotal: totalAmount,
        shipping_charge: 0,
        gst_amount: 0,
        status: 'pending',
        payment_method: 'cod',
        shipping_address: shippingAddress,
        customer_name: customerName,
        customer_email: customerEmail,
        customer_phone: customerPhone,
        user_id: user.id,
        is_reseller_order: true,
        reseller_id: profile.id,
        reseller_margin_percent: marginPercent,
        reseller_base_cost: baseCost,
        reseller_profit: profit,
      })
      .select('id')
      .single();
    if (orderErr) throw orderErr;

    return NextResponse.json({ id: order.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to place order';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
