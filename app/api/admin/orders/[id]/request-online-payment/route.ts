import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAdminToken, ADMIN_SESSION_COOKIE } from '@/lib/admin-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { sendEmail } from '@/lib/email';
import { codToPrepaidRequestEmail } from '@/lib/email-templates';
import { logPaymentRequestEvent } from '@/lib/order-payment-events';

// Admin > Orders > "Request Online Payment" -- for a COD order whose item
// isn't kept ready-made (needs to be prepared before it can ship), this
// converts the order from COD to "pay online first":
//   1. Flips payment_method 'cod' -> 'online' (status stays 'pending'),
//      which is the exact combination /checkout/resume/[id] and
//      /api/razorpay/create-order already require -- so the customer's
//      normal Razorpay flow just works from here with no other changes.
//      original_payment_method is NOT touched here -- it was already set
//      to 'cod' by the DB trigger when the order was placed, and stays
//      that way forever, so the admin can still tell this was originally
//      a COD order even after payment_method flips to 'online'.
//   2. Emails the customer an apology + a link to that resume-payment
//      page (codToPrepaidRequestEmail).
// Once they actually pay, /api/razorpay/verify-payment takes over as
// usual: status -> 'paid', and the customer gets the existing "payment
// confirmed, we're preparing it" email + the account/track page banner.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const cookie = cookies().get(ADMIN_SESSION_COOKIE)?.value ?? null;
  const verified = await verifyAdminToken(cookie);
  if (!verified.valid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const { data: order, error } = await supabase
    .from('orders')
    .select(
      'id, status, payment_method, items, total_amount, subtotal, shipping_charge, gst_amount, coupon_code, coupon_discount, gift_card_code, gift_card_discount, loyalty_points_redeemed, loyalty_discount, customer_name, customer_email'
    )
    .eq('id', params.id)
    .maybeSingle();

  if (error || !order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  }
  if (order.status !== 'pending' || order.payment_method !== 'cod') {
    return NextResponse.json(
      { error: 'Only a COD order that is still pending can be converted to online payment' },
      { status: 409 }
    );
  }
  if (!order.customer_email) {
    return NextResponse.json({ error: 'This order has no customer email to send the request to' }, { status: 400 });
  }

  // Same "extra % off for paying online" incentive as a fresh checkout
  // (Admin > Settings > Online Payment Discount, 'payment_discount' key) --
  // a COD order converted here is, from this point on, exactly an online
  // order, so it should get exactly the same discount a customer who'd
  // chosen "pay online" at checkout would have. Computed on the order's
  // current total_amount (the COD price already reflects every other
  // discount that applied at checkout), then baked into a NEW total_amount
  // + online_payment_discount so every downstream reader (this email, the
  // resume-payment page, /api/razorpay/create-order's authoritative
  // amount lookup, the account order page, invoices) just shows/charges
  // the already-discounted number without needing to know why.
  const { data: discountSetting } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'payment_discount')
    .maybeSingle();
  const discountConfig = (discountSetting?.value as { enabled?: boolean; percent?: number } | null) || null;
  const discountPercent =
    discountConfig?.enabled && discountConfig.percent && discountConfig.percent > 0 ? discountConfig.percent : 0;
  const originalTotal = order.total_amount;
  const onlinePaymentDiscount = discountPercent > 0 ? Math.round((originalTotal * discountPercent) / 100) : 0;
  const newTotal = Math.max(0, originalTotal - onlinePaymentDiscount);

  const { error: updateError } = await supabase
    .from('orders')
    .update({
      payment_method: 'online',
      total_amount: newTotal,
      online_payment_discount: onlinePaymentDiscount,
    })
    .eq('id', order.id)
    .eq('status', 'pending');
  if (updateError) {
    return NextResponse.json({ error: 'Failed to update the order' }, { status: 500 });
  }

  // Marks the moment the admin clicked this button -- this row's
  // created_at is "kab admin ne request kiya". Also unlocks the
  // razorpay create-order/verify-payment routes below to log this
  // order's later payment attempts (they're gated on a 'requested' row
  // existing, so ordinary online checkouts never get logged here).
  await logPaymentRequestEvent(order.id, 'requested');

  // Reserve the tracking row BEFORE building the email, since its id gets
  // embedded in the email itself (open pixel + click-through link) --
  // see lib/email-templates.ts -> codToPrepaidRequestEmail.
  const { data: sentEvent } = await supabase
    .from('order_payment_request_events')
    .insert({ order_id: order.id, event_type: 'email_sent' })
    .select('id')
    .maybeSingle();
  const trackingId = sentEvent?.id;

  // Best-effort -- footer just shows fewer lines if this fails, never
  // blocks the actual "convert to online + notify customer" flow. Same
  // 'settings' table read as app/about/page.tsx's getStoreInfo(), just
  // via the already-open service-role client instead of a second one.
  const { data: storeSetting } = await supabase.from('settings').select('value').eq('key', 'store_info').maybeSingle();
  const store = (storeSetting?.value as any) || undefined;

  const { subject, html } = codToPrepaidRequestEmail({
    id: order.id,
    items: Array.isArray(order.items) ? order.items : [],
    total_amount: newTotal,
    original_total: originalTotal,
    online_payment_discount: onlinePaymentDiscount,
    // Pass through the order's original checkout-time breakdown so the
    // email can show it (see lib/email-templates.ts -> codToPrepaidRequestEmail)
    // instead of folding a coupon/gift-card/loyalty discount silently into
    // the "COD total" line.
    subtotal: order.subtotal,
    shipping_charge: order.shipping_charge,
    gst_amount: order.gst_amount,
    coupon_code: order.coupon_code,
    coupon_discount: order.coupon_discount,
    gift_card_code: order.gift_card_code,
    gift_card_discount: order.gift_card_discount,
    loyalty_points_redeemed: order.loyalty_points_redeemed,
    loyalty_discount: order.loyalty_discount,
    customer_name: order.customer_name,
    trackingId,
    store,
  });
  // Returned to the admin panel so it can open a short WhatsApp message
  // immediately (customer hears about it right away, not only by email).
  const siteBase = (process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin).replace(/\/$/, '');
  const waInfo = {
    payUrl: `${siteBase}/checkout/resume/${order.id}`,
    onlineTotal: newTotal,
    codTotal: originalTotal,
    discount: onlinePaymentDiscount,
  };
  const sendResult = await sendEmail({ to: order.customer_email, subject, html });
  if (!sendResult.success) {
    await logPaymentRequestEvent(order.id, 'email_send_failed', {
      meta: { error: 'error' in sendResult ? String(sendResult.error) : 'Email failed to send' },
    });
    // The order is already converted at this point -- don't silently
    // leave the admin thinking nothing happened, but don't roll back
    // either (they can use "Send test" / resend some other way).
    return NextResponse.json(
      { success: true, emailed: false, ...waInfo, error: 'error' in sendResult ? sendResult.error : 'Email failed to send' },
      { status: 200 }
    );
  }

  return NextResponse.json({ success: true, emailed: true, ...waInfo });
}
