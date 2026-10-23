import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAdminToken, ADMIN_SESSION_COOKIE } from '@/lib/admin-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

// ---------------------------------------------------------------------
// Phase 4C admin data — four views behind one route (?type=...), all
// backing the "Vendor Ops" admin panel tab:
//   return-to-vendor  -> return_to_vendor_queue table (pending rows)
//   restock           -> get_restock_suggestions() RPC
//   performance       -> get_vendor_performance() RPC
//   stale             -> get_stale_inventory() RPC
// ---------------------------------------------------------------------

async function requireAdmin() {
  const cookie = cookies().get(ADMIN_SESSION_COOKIE)?.value ?? null;
  const verified = await verifyAdminToken(cookie);
  return verified.valid;
}

export async function GET(req: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type') || 'return-to-vendor';
  const admin = getSupabaseAdmin();

  try {
    if (type === 'return-to-vendor') {
      const { data, error } = await admin
        .from('return_to_vendor_queue')
        .select(
          'id, vendor_id, product_id, order_item_id, reason, note, status, created_at, resolved_at, hold_deadline, vendors(business_name), products(name), order_items(product_name, quantity, stage)'
        )
        .eq('status', 'pending')
        .order('created_at', { ascending: true });
      if (error) throw error;

      const rows = (data ?? []).map((row: any) => ({
        id: row.id,
        vendor_id: row.vendor_id,
        business_name: row.vendors?.business_name ?? 'Unknown vendor',
        product_id: row.product_id,
        product_name: row.products?.name ?? row.order_items?.product_name ?? 'Unknown product',
        order_item_id: row.order_item_id,
        quantity: row.order_items?.quantity ?? null,
        reason: row.reason,
        note: row.note,
        created_at: row.created_at,
        hold_deadline: row.hold_deadline ?? null,
      }));

      return NextResponse.json({ rows });
    }

    // Vendor Ops -> "Stock Hold Timers" tab: every active/overdue hold
    // (both still-holding = green countdown, and already-flagged =
    // red overdue), so admin sees the full picture, not just the
    // ones that already crossed into the queue.
    if (type === 'stock-holds') {
      const { data, error } = await admin
        .from('vendor_return_holds')
        .select(
          'id, vendor_id, product_id, order_item_id, source, returned_at, hold_days, hold_deadline, status, vendors(business_name, stock_hold_days), products(name), order_items(product_name)'
        )
        .in('status', ['holding', 'flagged'])
        .order('hold_deadline', { ascending: true });
      if (error) throw error;

      const rows = (data ?? []).map((row: any) => ({
        id: row.id,
        vendor_id: row.vendor_id,
        business_name: row.vendors?.business_name ?? 'Unknown vendor',
        stock_hold_days_setting: row.vendors?.stock_hold_days ?? 15,
        product_id: row.product_id,
        product_name: row.products?.name ?? row.order_items?.product_name ?? 'Unknown product',
        order_item_id: row.order_item_id,
        source: row.source,
        returned_at: row.returned_at,
        hold_days: row.hold_days,
        hold_deadline: row.hold_deadline,
        status: row.status,
      }));

      return NextResponse.json({ rows });
    }

    if (type === 'restock') {
      const { data, error } = await admin.rpc('get_restock_suggestions');
      if (error) throw error;
      return NextResponse.json({ rows: data ?? [] });
    }

    if (type === 'performance') {
      const { data, error } = await admin.rpc('get_vendor_performance');
      if (error) throw error;
      return NextResponse.json({ rows: data ?? [] });
    }

    if (type === 'stale') {
      const { data, error } = await admin.rpc('get_stale_inventory');
      if (error) throw error;
      return NextResponse.json({ rows: data ?? [] });
    }

    return NextResponse.json({ error: 'Unknown type' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to load vendor ops data' }, { status: 500 });
  }
}

// PATCH — mark a return_to_vendor_queue row as physically returned to
// the vendor (admin ticks it off once the item has actually left the
// warehouse).
export async function PATCH(req: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const id = body?.id as string | undefined;
  if (!id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  }

  const admin = getSupabaseAdmin();

  try {
    const { error } = await admin
      .from('return_to_vendor_queue')
      .update({ status: 'returned', resolved_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to update queue row' }, { status: 500 });
  }
}
