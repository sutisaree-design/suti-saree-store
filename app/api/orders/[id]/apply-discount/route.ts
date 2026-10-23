import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

// Same discount formula as computeCouponDiscount() in lib/coupons-api.ts,
// reimplemented here (rather than imported) because that module is a
// 'use client' file meant for the browser -- this route only needs the one
// pure function, not its module-level supabase client.
function computeCouponDiscount(
  coupon: { discount_type: 'percentage' | 'flat'; discount_value: number },
  subtotal: number,
  productCount: number = 1
): number {
  if (subtotal <= 0) return 0;
  const raw =
    coupon.discount_type === 'percentage'
      ? Math.round((subtotal * coupon.discount_value) / 100)
      : Math.round(coupon.discount_value) * Math.max(1, productCount);
  return Math.min(raw, subtotal);
}

// Lets a customer on /checkout/resume/[id] (the "Complete your payment"
// page) apply a coupon or gift card to an order that was ALREADY placed
// without one -- e.g. they forgot to add ARUHI75 at checkout, or the order
// was a COD order the admin just converted to "pay online first" and they'd
// like to redeem a gift card before paying.
//
// Same trust model as the resume page itself (see
// app/checkout/resume/[id]/page.tsx): the order id (an unguessable UUID) is
// the access token, no login required. Only orders that are still
// `status = 'pending'` and `payment_method != 'cod'` can be touched here --
// the exact same gate the resume page uses to decide whether to render at
// all, so this can never modify a COD order or one that's already paid.
//
// Every number here is recomputed from scratch server-side (coupon rules,
// gift card balance, the live online-payment-discount %, GST extraction),
// mirroring the authoritative formula in place_order_with_items() (see
// supabase/migrations/20261001000000_fix_total_gst_bogo_resale.sql) --
// nothing from the request body is trusted except the code being applied.

type Order = {
  id: string;
  status: string;
  payment_method: string | null;
  items: any;
  subtotal: number | null;
  shipping_charge: number | null;
  bogo_discount: number | null;
  coupon_code: string | null;
  coupon_discount: number | null;
  gift_card_code: string | null;
  gift_card_discount: number | null;
  loyalty_discount: number | null;
};

const ORDER_FIELDS =
  'id, status, payment_method, items, subtotal, shipping_charge, bogo_discount, coupon_code, coupon_discount, gift_card_code, gift_card_discount, loyalty_discount';

async function loadEditableOrder(admin: ReturnType<typeof getSupabaseAdmin>, id: string) {
  const { data: order, error } = await admin.from('orders').select(ORDER_FIELDS).eq('id', id).maybeSingle();
  if (error || !order) return { order: null as Order | null, errorResponse: NextResponse.json({ error: 'Order not found' }, { status: 404 }) };

  if (order.status !== 'pending' || order.payment_method === 'cod' || order.payment_method === 'partial' || order.subtotal == null) {
    return {
      order: null,
      errorResponse: NextResponse.json(
        { error: 'This order can no longer be modified. Please contact us for help.' },
        { status: 409 }
      ),
    };
  }
  return { order: order as Order, errorResponse: null };
}

// Recomputes online_payment_discount / gst_amount / total_amount from the
// order's fixed subtotal + shipping and the (possibly just-changed)
// coupon/gift-card/loyalty discounts, and writes them back. Same formula
// order.subtotal -> - coupon - bogo - gift card - loyalty -> online
// payment discount -> GST extraction, as app/checkout/page.tsx and
// place_order_with_items() both use.
async function recomputeAndSave(
  admin: ReturnType<typeof getSupabaseAdmin>,
  order: Order,
  next: { coupon_code: string | null; coupon_discount: number; gift_card_code: string | null; gift_card_discount: number }
) {
  const subtotal = Number(order.subtotal || 0);
  const shipping = Number(order.shipping_charge || 0);
  const bogoDiscount = Number(order.bogo_discount || 0);
  const loyaltyDiscount = Number(order.loyalty_discount || 0);

  const runningAfterDiscounts = Math.max(
    0,
    subtotal - next.coupon_discount - bogoDiscount - next.gift_card_discount - loyaltyDiscount
  );

  const { data: discountSetting } = await admin
    .from('settings')
    .select('value')
    .eq('key', 'payment_discount')
    .maybeSingle();
  const discountConfig = (discountSetting?.value as { enabled?: boolean; percent?: number } | null) || null;
  const percent = discountConfig?.enabled && discountConfig.percent && discountConfig.percent > 0 ? discountConfig.percent : 0;
  // payment_method is always 'online' here -- loadEditableOrder() already
  // rejected 'cod' orders above.
  const onlinePaymentDiscount = percent > 0 ? Math.round((runningAfterDiscounts * percent) / 100) : 0;
  const subtotalAfterPaymentDiscount = Math.max(0, runningAfterDiscounts - onlinePaymentDiscount);

  const { data: shippingSetting } = await admin.from('settings').select('value').eq('key', 'shipping').maybeSingle();
  const gstRatePercent = Number((shippingSetting?.value as { gst_rate_percent?: number } | null)?.gst_rate_percent ?? 5);
  // Prices are GST-inclusive -- extracted for display/invoice only, never
  // added on top of the total.
  const gstAmount = Math.round(subtotalAfterPaymentDiscount - (subtotalAfterPaymentDiscount * 100) / (100 + gstRatePercent));

  const totalAmount = Math.max(
    0,
    subtotal + shipping - next.coupon_discount - bogoDiscount - next.gift_card_discount - loyaltyDiscount - onlinePaymentDiscount
  );

  const { error: updateError } = await admin
    .from('orders')
    .update({
      coupon_code: next.coupon_code,
      coupon_discount: next.coupon_discount,
      gift_card_code: next.gift_card_code,
      gift_card_discount: next.gift_card_discount,
      online_payment_discount: onlinePaymentDiscount,
      gst_amount: gstAmount,
      total_amount: totalAmount,
    })
    .eq('id', order.id)
    .eq('status', 'pending'); // last-second guard: never overwrite an order that got paid in the meantime

  if (updateError) {
    return { ok: false as const, error: 'Failed to update the order' };
  }
  return { ok: true as const, total_amount: totalAmount, online_payment_discount: onlinePaymentDiscount, gst_amount: gstAmount };
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => ({}));
  const action = typeof body?.action === 'string' ? body.action : '';
  const code = typeof body?.code === 'string' ? body.code.trim().toUpperCase() : '';

  const admin = getSupabaseAdmin();
  const { order, errorResponse } = await loadEditableOrder(admin, params.id);
  if (!order) return errorResponse!;

  const items: any[] = Array.isArray(order.items) ? order.items : [];
  const distinctProducts = new Set(items.map((it) => it.product_id).filter(Boolean)).size || items.length || 1;

  if (action === 'apply_coupon') {
    if (!code) return NextResponse.json({ error: 'Enter a coupon code' }, { status: 400 });
    if (Number(order.coupon_discount || 0) > 0) {
      return NextResponse.json({ error: 'A coupon is already applied to this order. Remove it first to use a different one.' }, { status: 409 });
    }

    const { data: coupon } = await admin.from('coupons').select('*').ilike('code', code).maybeSingle();
    if (!coupon) return NextResponse.json({ error: 'Invalid coupon code' }, { status: 400 });
    if (!coupon.is_active) return NextResponse.json({ error: 'This coupon is no longer active' }, { status: 400 });
    if (coupon.expires_at && new Date(coupon.expires_at).getTime() < Date.now()) {
      return NextResponse.json({ error: 'This coupon has expired' }, { status: 400 });
    }
    if (coupon.usage_limit !== null && coupon.times_used >= coupon.usage_limit) {
      return NextResponse.json({ error: 'This coupon has reached its usage limit' }, { status: 400 });
    }
    const subtotal = Number(order.subtotal || 0);
    if (subtotal < coupon.min_order_value) {
      return NextResponse.json(
        { error: `This coupon needs a minimum order value of ₹${coupon.min_order_value}` },
        { status: 400 }
      );
    }

    const couponDiscount = computeCouponDiscount(coupon, subtotal, distinctProducts);
    const result = await recomputeAndSave(admin, order, {
      coupon_code: coupon.code,
      coupon_discount: couponDiscount,
      gift_card_code: order.gift_card_code,
      gift_card_discount: Number(order.gift_card_discount || 0),
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 });

    // Best-effort -- the coupon is already applied to the order either way;
    // a failed usage-count bump just means the admin's stats undercount by
    // one, never something worth failing the customer's request over.
    admin.from('coupons').update({ times_used: coupon.times_used + 1 }).eq('id', coupon.id).then(
      () => {},
      () => {}
    );

    return NextResponse.json({
      success: true,
      coupon_code: coupon.code,
      coupon_discount: couponDiscount,
      total_amount: result.total_amount,
      online_payment_discount: result.online_payment_discount,
      gst_amount: result.gst_amount,
    });
  }

  if (action === 'remove_coupon') {
    if (!Number(order.coupon_discount || 0)) {
      return NextResponse.json({ error: 'No coupon is applied to this order' }, { status: 400 });
    }
    const removedCode = order.coupon_code;
    const result = await recomputeAndSave(admin, order, {
      coupon_code: null,
      coupon_discount: 0,
      gift_card_code: order.gift_card_code,
      gift_card_discount: Number(order.gift_card_discount || 0),
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 });

    if (removedCode) {
      const { data: coupon } = await admin.from('coupons').select('id, times_used').ilike('code', removedCode).maybeSingle();
      if (coupon) {
        admin
          .from('coupons')
          .update({ times_used: Math.max(0, coupon.times_used - 1) })
          .eq('id', coupon.id)
          .then(
            () => {},
            () => {}
          );
      }
    }

    return NextResponse.json({
      success: true,
      total_amount: result.total_amount,
      online_payment_discount: result.online_payment_discount,
      gst_amount: result.gst_amount,
    });
  }

  if (action === 'apply_giftcard') {
    if (!code) return NextResponse.json({ error: 'Enter a gift card code' }, { status: 400 });
    if (Number(order.gift_card_discount || 0) > 0) {
      return NextResponse.json({ error: 'A gift card is already applied to this order. Remove it first to use a different one.' }, { status: 409 });
    }

    const { data: giftCard } = await admin.from('gift_cards').select('*').eq('code', code).maybeSingle();
    if (!giftCard) return NextResponse.json({ error: 'Invalid gift card code' }, { status: 400 });
    if (giftCard.status === 'pending') return NextResponse.json({ error: 'This gift card purchase was never completed' }, { status: 400 });
    if (giftCard.status === 'deactivated') return NextResponse.json({ error: 'This gift card has been deactivated' }, { status: 400 });
    if (giftCard.status === 'redeemed' || giftCard.balance <= 0) {
      return NextResponse.json({ error: 'This gift card has no remaining balance' }, { status: 400 });
    }
    if (giftCard.expires_at && new Date(giftCard.expires_at).getTime() < Date.now()) {
      return NextResponse.json({ error: 'This gift card has expired' }, { status: 400 });
    }

    const subtotal = Number(order.subtotal || 0);
    const bogoDiscount = Number(order.bogo_discount || 0);
    const couponDiscount = Number(order.coupon_discount || 0);
    const amountDue = Math.max(0, subtotal - couponDiscount - bogoDiscount);
    const redeemable = Math.max(0, Math.min(giftCard.balance, amountDue));
    if (redeemable <= 0) return NextResponse.json({ error: 'Nothing left on this order to redeem the gift card against' }, { status: 400 });

    const result = await recomputeAndSave(admin, order, {
      coupon_code: order.coupon_code,
      coupon_discount: couponDiscount,
      gift_card_code: giftCard.code,
      gift_card_discount: redeemable,
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 });

    // Ledger entry -- gift_cards.balance/status are kept in sync by the
    // apply_gift_card_transaction trigger (see
    // supabase/migrations/20260724000000_phase10c_giftcards.sql), same as
    // every other credit/debit against a card.
    const { error: txnError } = await admin.from('gift_card_transactions').insert({
      gift_card_id: giftCard.id,
      order_id: order.id,
      amount: -redeemable,
      type: 'redeem',
      reason: `Redeemed on order #${order.id.slice(0, 8).toUpperCase()} (pay-online page)`,
    });
    if (txnError) {
      // Roll the order fields back rather than leave it thinking a gift
      // card is applied when the balance was never actually deducted.
      await recomputeAndSave(admin, order, {
        coupon_code: order.coupon_code,
        coupon_discount: couponDiscount,
        gift_card_code: null,
        gift_card_discount: 0,
      });
      return NextResponse.json({ error: 'Could not redeem this gift card right now. Please try again.' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      gift_card_code: giftCard.code,
      gift_card_discount: redeemable,
      total_amount: result.total_amount,
      online_payment_discount: result.online_payment_discount,
      gst_amount: result.gst_amount,
    });
  }

  if (action === 'remove_giftcard') {
    const removedDiscount = Number(order.gift_card_discount || 0);
    if (!removedDiscount) {
      return NextResponse.json({ error: 'No gift card is applied to this order' }, { status: 400 });
    }
    const removedCode = order.gift_card_code;

    const result = await recomputeAndSave(admin, order, {
      coupon_code: order.coupon_code,
      coupon_discount: Number(order.coupon_discount || 0),
      gift_card_code: null,
      gift_card_discount: 0,
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 });

    if (removedCode) {
      const { data: giftCard } = await admin.from('gift_cards').select('id').eq('code', removedCode).maybeSingle();
      if (giftCard) {
        // Credit the balance back via the same ledger/trigger used to debit it.
        admin
          .from('gift_card_transactions')
          .insert({
            gift_card_id: giftCard.id,
            order_id: order.id,
            amount: removedDiscount,
            type: 'refund',
            reason: `Removed from order #${order.id.slice(0, 8).toUpperCase()} before payment (pay-online page)`,
          })
          .then(
            () => {},
            () => {}
          );
      }
    }

    return NextResponse.json({
      success: true,
      total_amount: result.total_amount,
      online_payment_discount: result.online_payment_discount,
      gst_amount: result.gst_amount,
    });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
