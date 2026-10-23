import { NextResponse } from 'next/server';
import { getCurrentUser, getSupabaseServer } from '@/lib/supabase-server-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

// ---------------------------------------------------------------------
// Vendor's own "Stock Hold Timers" — every returned/RTO unit of theirs
// currently holding (green countdown) or already flagged past deadline
// (red, overdue) in the warehouse. Mirrors the admin Vendor Ops "Stock
// Hold Timers" tab but scoped to this vendor only.
// ---------------------------------------------------------------------

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Please log in first' }, { status: 401 });
  }

  const authedSupabase = await getSupabaseServer();
  const { data: vendor, error: vendorErr } = await authedSupabase
    .from('vendors')
    .select('id, stock_hold_days')
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
    const { data, error } = await admin
      .from('vendor_return_holds')
      .select('id, vendor_id, product_id, order_item_id, source, returned_at, hold_days, hold_deadline, status, products(name), order_items(product_name)')
      .eq('vendor_id', vendor.id)
      .in('status', ['holding', 'flagged'])
      .order('hold_deadline', { ascending: true });
    if (error) throw error;

    const rows = (data ?? []).map((row: any) => ({
      id: row.id,
      vendor_id: row.vendor_id,
      product_id: row.product_id,
      product_name: row.products?.name ?? row.order_items?.product_name ?? 'Unknown product',
      order_item_id: row.order_item_id,
      source: row.source,
      returned_at: row.returned_at,
      hold_days: row.hold_days,
      hold_deadline: row.hold_deadline,
      status: row.status,
    }));

    return NextResponse.json({ rows, stock_hold_days: vendor.stock_hold_days ?? 15 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load stock hold timers';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
