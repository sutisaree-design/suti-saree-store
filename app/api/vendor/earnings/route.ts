import { NextResponse } from 'next/server';
import { getCurrentUser, getSupabaseServer } from '@/lib/supabase-server-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

// ---------------------------------------------------------------------
// Phase 4B — Vendor "Earnings" tab data.
//
// Every number here is read, not calculated — the fee/payable math was
// already done by Phase 4A's calculate_order_item_settlement_fee()
// trigger the moment an item hit stage 'delivered', and settlement
// grouping was already done by run_weekly_vendor_settlement(). This
// route just aggregates what's already on order_items/vendor_settlements/
// vendor_clawbacks for the logged-in vendor.
//
// Same masking discipline as /api/vendor/orders: explicit column lists,
// service-role client, filtered by this vendor's own id server-side
// (order_items/vendor_settlements' policies don't fully cover this on
// their own — see the Phase 3A/4A migration notes on open policies).
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
  // Phase 4C off-boarding (point 5c): dashboard access must actually
  // stop once a vendor is suspended/closed, not just be hidden in the UI.
  if (vendor.status === 'suspended') {
    return NextResponse.json({ error: 'Your vendor account has been suspended' }, { status: 403 });
  }

  const admin = getSupabaseAdmin();

  try {
    // Every delivered item ever sourced from this vendor — the basis
    // for the lifetime "total sales / fee / payable" figures.
    const { data: deliveredItems, error: itemsErr } = await admin
      .from('order_items')
      .select('price, quantity, fee_amount, vendor_payable_amount, settlement_id')
      .eq('vendor_id', vendor.id)
      .eq('stage', 'delivered');
    if (itemsErr) throw itemsErr;

    let total_sales = 0;
    let total_fee = 0;
    let total_payable = 0;
    let total_unsettled = 0; // delivered, but not yet in any weekly settlement (still within return window or awaiting COD remittance)

    for (const item of deliveredItems ?? []) {
      total_sales += (item.price ?? 0) * (item.quantity ?? 1);
      total_fee += item.fee_amount ?? 0;
      total_payable += item.vendor_payable_amount ?? 0;
      if (!item.settlement_id) {
        total_unsettled += item.vendor_payable_amount ?? 0;
      }
    }

    // Weekly settlement history.
    const { data: settlements, error: settlementsErr } = await admin
      .from('vendor_settlements')
      .select('id, week_start, week_end, total_amount, clawback_deducted, status, payment_reference, paid_date, created_at')
      .eq('vendor_id', vendor.id)
      .order('week_start', { ascending: false });
    if (settlementsErr) throw settlementsErr;

    let total_paid = 0;
    let total_pending_settlement = 0;
    for (const s of settlements ?? []) {
      if (s.status === 'paid') total_paid += s.total_amount ?? 0;
      else total_pending_settlement += s.total_amount ?? 0;
    }

    // Clawbacks not yet applied against a future settlement.
    const { data: clawbacks, error: clawbackErr } = await admin
      .from('vendor_clawbacks')
      .select('amount')
      .eq('vendor_id', vendor.id)
      .eq('status', 'pending');
    if (clawbackErr) throw clawbackErr;
    const clawback_pending = (clawbacks ?? []).reduce((sum, c) => sum + (c.amount ?? 0), 0);

    return NextResponse.json({
      summary: {
        total_sales,
        total_fee,
        total_payable,
        total_paid,
        total_pending_settlement,
        total_unsettled,
        clawback_pending,
      },
      settlements: settlements ?? [],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load earnings';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
