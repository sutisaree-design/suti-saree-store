import { NextResponse } from 'next/server';
import { getCurrentUser, getSupabaseServer } from '@/lib/supabase-server-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

// ---------------------------------------------------------------------
// Vendor-facing return/RTO overview — "aapke store ka return rate kitna
// hai" — shown on the Add Product page and the Orders dashboard so a
// vendor can see the numbers behind the platform's pricing/COD rules
// (see supabase/migrations/20260911000000_return_rto_risk_tracking.sql)
// before they price a new listing.
//
// Same masking discipline as /api/vendor/orders: only order_items rows
// scoped to this vendor's own id, then a delivery_status/returns lookup
// on the matching orders/returns rows — never customer_name/phone/
// address, and never another vendor's numbers.
// ---------------------------------------------------------------------

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Please log in first' }, { status: 401 });
  }

  const authedSupabase = await getSupabaseServer();
  const { data: vendor, error: vendorErr } = await authedSupabase
    .from('vendors')
    .select('id, status')
    .eq('user_id', user.id)
    .maybeSingle();
  if (vendorErr) {
    return NextResponse.json({ error: vendorErr.message }, { status: 500 });
  }
  if (!vendor) {
    return NextResponse.json({ error: 'No vendor profile found for this account' }, { status: 403 });
  }

  const admin = getSupabaseAdmin();

  try {
    const { data: items, error: itemsError } = await admin
      .from('order_items')
      .select('id, order_id, stage')
      .eq('vendor_id', vendor.id);
    if (itemsError) throw itemsError;

    const totalItems = items?.length ?? 0;
    if (totalItems === 0) {
      return NextResponse.json({
        total_items: 0,
        return_count: 0,
        rto_count: 0,
        return_rate_percent: null,
        rto_rate_percent: null,
      });
    }

    const orderIds = Array.from(new Set(items!.map((i) => i.order_id)));
    const itemIds = items!.map((i) => i.id);

    const { data: orders } = await admin
      .from('orders')
      .select('id, delivery_status')
      .in('id', orderIds);
    const rtoOrderIds = new Set(
      (orders || [])
        .filter((o) => o.delivery_status === 'rto_initiated' || o.delivery_status === 'rto_delivered')
        .map((o) => o.id)
    );
    // Approximation note: RTO is tracked at the whole-shipment (order)
    // level, so a multi-vendor order that RTOs counts against every
    // vendor whose item was in it — same caveat as any shared-shipment
    // return metric.
    const rtoCount = items!.filter((i) => rtoOrderIds.has(i.order_id)).length;

    const { data: returns } = await admin
      .from('returns')
      .select('order_item_id, status, type')
      .in('order_item_id', itemIds)
      .eq('type', 'return')
      .in('status', ['refunded', 'completed']);
    const returnCount = returns?.length ?? 0;

    return NextResponse.json({
      total_items: totalItems,
      return_count: returnCount,
      rto_count: rtoCount,
      return_rate_percent: Math.round((returnCount / totalItems) * 1000) / 10,
      rto_rate_percent: Math.round((rtoCount / totalItems) * 1000) / 10,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load return/RTO stats';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
