import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAdminToken, ADMIN_SESSION_COOKIE } from '@/lib/admin-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

async function requireAdmin() {
  const cookie = cookies().get(ADMIN_SESSION_COOKIE)?.value ?? null;
  const verified = await verifyAdminToken(cookie);
  return verified.valid;
}

// ---------------------------------------------------------------------
// Reseller payouts — a reseller's margin is only ever payable once their
// order is delivered AND the store's return window has passed
// (orders.reseller_payout_status flips 'pending_delivery' ->
// 'in_return_window' the moment delivery happens, then ->  'eligible'
// once reseller_payout_return_window_ends_at passes — the first via a
// DB trigger, the second via a daily cron calling
// promote_reseller_payouts_after_return_window(); see
// supabase/migrations/20260803140000_reseller_payout_system.sql and
// 20260803150000_reseller_payout_return_window.sql). This route just
// surfaces that: what's owed per reseller, broken down by stage, plus
// the "Mark as Paid" action and payout history.
// ---------------------------------------------------------------------

// GET — every reseller with a payout-stage breakdown (pending delivery /
// ready to pay / already paid / voided), the orders currently ready to
// pay, and recent payout history.
export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = getSupabaseAdmin();

  try {
    const { data: resellers, error: resellersErr } = await admin
      .from('reseller_profiles')
      .select('id, user_id, business_name, status, payout_upi_id, payout_account_holder')
      .order('created_at', { ascending: false });
    if (resellersErr) throw resellersErr;

    const userIds = (resellers ?? []).map((r) => r.user_id);
    const { data: profiles } = await admin
      .from('profiles')
      .select('id, full_name, phone')
      .in('id', userIds.length ? userIds : ['00000000-0000-0000-0000-000000000000']);
    const profileByUser = new Map((profiles ?? []).map((p) => [p.id, p]));

    const { data: orders, error: ordersErr } = await admin
      .from('orders')
      .select(
        'id, reseller_id, total_amount, reseller_profit, reseller_base_cost, status, delivery_status, reseller_payout_status, reseller_payout_eligible_at, customer_name, created_at'
      )
      .eq('is_reseller_order', true)
      .not('reseller_id', 'is', null)
      .order('created_at', { ascending: false });
    if (ordersErr) throw ordersErr;

    const { data: payouts, error: payoutsErr } = await admin
      .from('reseller_payouts')
      .select('id, reseller_id, total_amount, order_count, payment_reference, notes, paid_at, created_at')
      .order('paid_at', { ascending: false })
      .limit(100);
    if (payoutsErr) throw payoutsErr;

    const ordersByReseller = new Map<string, typeof orders>();
    for (const o of orders ?? []) {
      const list = ordersByReseller.get(o.reseller_id) ?? [];
      list.push(o);
      ordersByReseller.set(o.reseller_id, list as any);
    }

    const nameByReseller = new Map<string, string>();

    const resellerRows = (resellers ?? []).map((r) => {
      const profile = profileByUser.get(r.user_id);
      const name = profile?.full_name || r.business_name || 'Reseller';
      nameByReseller.set(r.id, name);
      const myOrders = ordersByReseller.get(r.id) ?? [];

      const eligibleOrders = myOrders.filter((o) => o.reseller_payout_status === 'eligible');
      const pendingDeliveryOrders = myOrders.filter((o) => o.reseller_payout_status === 'pending_delivery');
      const inReturnWindowOrders = myOrders.filter((o) => o.reseller_payout_status === 'in_return_window');
      const paidOrders = myOrders.filter((o) => o.reseller_payout_status === 'paid');
      const voidOrders = myOrders.filter((o) => o.reseller_payout_status === 'void');

      const sum = (rows: typeof myOrders) => rows.reduce((s, o) => s + (o.reseller_profit || 0), 0);

      return {
        id: r.id,
        userId: r.user_id,
        name,
        phone: profile?.phone || null,
        status: r.status,
        payoutUpiId: r.payout_upi_id,
        payoutAccountHolder: r.payout_account_holder,
        pendingDeliveryAmount: sum(pendingDeliveryOrders),
        pendingDeliveryCount: pendingDeliveryOrders.length,
        inReturnWindowAmount: sum(inReturnWindowOrders),
        inReturnWindowCount: inReturnWindowOrders.length,
        eligibleAmount: sum(eligibleOrders),
        eligibleOrders: eligibleOrders.map((o) => ({
          id: o.id,
          customerName: o.customer_name,
          totalAmount: o.total_amount,
          resellerProfit: o.reseller_profit,
          deliveredAt: o.reseller_payout_eligible_at,
          createdAt: o.created_at,
        })),
        paidAmount: sum(paidOrders),
        voidAmount: sum(voidOrders),
        voidCount: voidOrders.length,
      };
    });

    const payoutHistory = (payouts ?? []).map((p) => ({
      id: p.id,
      resellerId: p.reseller_id,
      resellerName: nameByReseller.get(p.reseller_id) || 'Reseller',
      totalAmount: p.total_amount,
      orderCount: p.order_count,
      paymentReference: p.payment_reference,
      notes: p.notes,
      paidAt: p.paid_at,
    }));

    return NextResponse.json({
      resellers: resellerRows,
      payoutHistory,
      totals: {
        pendingDelivery: resellerRows.reduce((s, r) => s + r.pendingDeliveryAmount, 0),
        inReturnWindow: resellerRows.reduce((s, r) => s + r.inReturnWindowAmount, 0),
        eligible: resellerRows.reduce((s, r) => s + r.eligibleAmount, 0),
        paid: resellerRows.reduce((s, r) => s + r.paidAmount, 0),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load reseller payouts';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST — mark a batch of eligible orders for one reseller as paid. Body:
// { reseller_id, order_ids: string[], payment_reference, notes? }.
// Re-validates every order_id server-side (belongs to this reseller AND
// is currently 'eligible') so an admin can't accidentally double-pay or
// pay out an order that's still in transit / already paid / voided.
export async function POST(req: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const resellerId = body?.reseller_id as string | undefined;
  const orderIds = Array.isArray(body?.order_ids) ? (body.order_ids as string[]) : [];
  const paymentReference = body?.payment_reference ? String(body.payment_reference).trim() : null;
  const notes = body?.notes ? String(body.notes).trim() : null;

  if (!resellerId || orderIds.length === 0) {
    return NextResponse.json({ error: 'Select a reseller and at least one order' }, { status: 400 });
  }

  const admin = getSupabaseAdmin();

  try {
    const { data: eligibleOrders, error: fetchErr } = await admin
      .from('orders')
      .select('id, reseller_profit')
      .eq('reseller_id', resellerId)
      .eq('reseller_payout_status', 'eligible')
      .in('id', orderIds);
    if (fetchErr) throw fetchErr;

    if (!eligibleOrders || eligibleOrders.length === 0) {
      return NextResponse.json(
        { error: 'None of the selected orders are currently eligible for payout (already paid, or not yet delivered).' },
        { status: 400 }
      );
    }
    if (eligibleOrders.length !== orderIds.length) {
      return NextResponse.json(
        { error: `Only ${eligibleOrders.length} of ${orderIds.length} selected orders are still eligible — refresh and try again.` },
        { status: 409 }
      );
    }

    const totalAmount = eligibleOrders.reduce((s, o) => s + (o.reseller_profit || 0), 0);

    const { data: payout, error: payoutErr } = await admin
      .from('reseller_payouts')
      .insert({
        reseller_id: resellerId,
        total_amount: totalAmount,
        order_count: eligibleOrders.length,
        payment_reference: paymentReference,
        notes,
      })
      .select('*')
      .single();
    if (payoutErr) throw payoutErr;

    const { error: updateErr } = await admin
      .from('orders')
      .update({ reseller_payout_status: 'paid', reseller_payout_id: payout.id })
      .in(
        'id',
        eligibleOrders.map((o) => o.id)
      );
    if (updateErr) throw updateErr;

    return NextResponse.json({ payout });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to record payout';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
