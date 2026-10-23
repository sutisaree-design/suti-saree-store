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
// Affiliate payouts — an affiliate's commission is only ever payable once
// their referred order is delivered AND the store's return window has
// passed (orders.affiliate_payout_status flips 'pending_delivery' ->
// 'in_return_window' the moment delivery happens, then -> 'eligible' once
// affiliate_payout_return_window_ends_at passes — the first via a DB
// trigger, the second via a daily cron calling
// promote_affiliate_payouts_after_return_window(); see
// supabase/migrations/20260913000000_affiliate_program.sql). This route
// mirrors app/api/admin/reseller-payouts/route.ts exactly, just renamed.
// ---------------------------------------------------------------------

// GET — every affiliate with a payout-stage breakdown (pending delivery /
// in return window / ready to pay / already paid), the orders currently
// ready to pay, and recent payout history.
export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = getSupabaseAdmin();

  try {
    const { data: affiliates, error: affiliatesErr } = await admin
      .from('affiliates')
      .select('id, user_id, code, status, commission_percent, payout_upi_id, payout_account_holder')
      .order('created_at', { ascending: false });
    if (affiliatesErr) throw affiliatesErr;

    const userIds = (affiliates ?? []).map((a) => a.user_id);
    const { data: profiles } = await admin
      .from('profiles')
      .select('id, full_name, phone')
      .in('id', userIds.length ? userIds : ['00000000-0000-0000-0000-000000000000']);
    const profileByUser = new Map((profiles ?? []).map((p) => [p.id, p]));

    const { data: orders, error: ordersErr } = await admin
      .from('orders')
      .select(
        'id, affiliate_id, total_amount, affiliate_commission_amount, status, delivery_status, affiliate_payout_status, affiliate_payout_eligible_at, customer_name, created_at'
      )
      .eq('is_affiliate_order', true)
      .not('affiliate_id', 'is', null)
      .order('created_at', { ascending: false });
    if (ordersErr) throw ordersErr;

    const { data: payouts, error: payoutsErr } = await admin
      .from('affiliate_payouts')
      .select('id, affiliate_id, total_amount, order_count, payment_reference, notes, paid_at, created_at')
      .order('paid_at', { ascending: false })
      .limit(100);
    if (payoutsErr) throw payoutsErr;

    const ordersByAffiliate = new Map<string, typeof orders>();
    for (const o of orders ?? []) {
      const list = ordersByAffiliate.get(o.affiliate_id) ?? [];
      list.push(o);
      ordersByAffiliate.set(o.affiliate_id, list as any);
    }

    const nameByAffiliate = new Map<string, string>();

    const affiliateRows = (affiliates ?? []).map((a) => {
      const profile = profileByUser.get(a.user_id);
      const name = profile?.full_name || 'Affiliate';
      nameByAffiliate.set(a.id, name);
      const myOrders = ordersByAffiliate.get(a.id) ?? [];

      const eligibleOrders = myOrders.filter((o) => o.affiliate_payout_status === 'eligible');
      const pendingDeliveryOrders = myOrders.filter((o) => o.affiliate_payout_status === 'pending_delivery');
      const inReturnWindowOrders = myOrders.filter((o) => o.affiliate_payout_status === 'in_return_window');
      const paidOrders = myOrders.filter((o) => o.affiliate_payout_status === 'paid');
      const voidOrders = myOrders.filter((o) => o.affiliate_payout_status === 'void');

      const sum = (rows: typeof myOrders) => rows.reduce((s, o) => s + (o.affiliate_commission_amount || 0), 0);

      return {
        id: a.id,
        userId: a.user_id,
        name,
        code: a.code,
        phone: profile?.phone || null,
        status: a.status,
        commissionPercent: a.commission_percent,
        payoutUpiId: a.payout_upi_id,
        payoutAccountHolder: a.payout_account_holder,
        pendingDeliveryAmount: sum(pendingDeliveryOrders),
        pendingDeliveryCount: pendingDeliveryOrders.length,
        inReturnWindowAmount: sum(inReturnWindowOrders),
        inReturnWindowCount: inReturnWindowOrders.length,
        eligibleAmount: sum(eligibleOrders),
        eligibleOrders: eligibleOrders.map((o) => ({
          id: o.id,
          customerName: o.customer_name,
          totalAmount: o.total_amount,
          commissionAmount: o.affiliate_commission_amount,
          deliveredAt: o.affiliate_payout_eligible_at,
          createdAt: o.created_at,
        })),
        paidAmount: sum(paidOrders),
        voidAmount: sum(voidOrders),
        voidCount: voidOrders.length,
      };
    });

    const payoutHistory = (payouts ?? []).map((p) => ({
      id: p.id,
      affiliateId: p.affiliate_id,
      affiliateName: nameByAffiliate.get(p.affiliate_id) || 'Affiliate',
      totalAmount: p.total_amount,
      orderCount: p.order_count,
      paymentReference: p.payment_reference,
      notes: p.notes,
      paidAt: p.paid_at,
    }));

    return NextResponse.json({
      affiliates: affiliateRows,
      payoutHistory,
      totals: {
        pendingDelivery: affiliateRows.reduce((s, r) => s + r.pendingDeliveryAmount, 0),
        inReturnWindow: affiliateRows.reduce((s, r) => s + r.inReturnWindowAmount, 0),
        eligible: affiliateRows.reduce((s, r) => s + r.eligibleAmount, 0),
        paid: affiliateRows.reduce((s, r) => s + r.paidAmount, 0),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load affiliate payouts';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST — mark a batch of eligible orders for one affiliate as paid. Body:
// { affiliate_id, order_ids: string[], payment_reference, notes? }.
// Re-validates every order_id server-side (belongs to this affiliate AND
// is currently 'eligible') so an admin can't accidentally double-pay or
// pay out an order that's still in transit / already paid / voided.
export async function POST(req: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const affiliateId = body?.affiliate_id as string | undefined;
  const orderIds = Array.isArray(body?.order_ids) ? (body.order_ids as string[]) : [];
  const paymentReference = body?.payment_reference ? String(body.payment_reference).trim() : null;
  const notes = body?.notes ? String(body.notes).trim() : null;

  if (!affiliateId || orderIds.length === 0) {
    return NextResponse.json({ error: 'Select an affiliate and at least one order' }, { status: 400 });
  }

  const admin = getSupabaseAdmin();

  try {
    const { data: eligibleOrders, error: fetchErr } = await admin
      .from('orders')
      .select('id, affiliate_commission_amount')
      .eq('affiliate_id', affiliateId)
      .eq('affiliate_payout_status', 'eligible')
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

    const totalAmount = eligibleOrders.reduce((s, o) => s + (o.affiliate_commission_amount || 0), 0);

    const { data: payout, error: payoutErr } = await admin
      .from('affiliate_payouts')
      .insert({
        affiliate_id: affiliateId,
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
      .update({ affiliate_payout_status: 'paid', affiliate_payout_id: payout.id })
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
