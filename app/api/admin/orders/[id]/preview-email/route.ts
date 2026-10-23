import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAdminToken, ADMIN_SESSION_COOKIE } from '@/lib/admin-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { sendEmail } from '@/lib/email';
import {
  orderShippedEmail,
  orderStatusUpdateEmail,
  orderArrivingEmail,
  orderOutForDeliveryEmail,
  codToPrepaidRequestEmail,
  reviewRequestEmail,
  reviewReminderEmail,
} from '@/lib/email-templates';
import { isInPaymentRequestFlow } from '@/lib/order-payment-events';

// Used by the "Test" panel on Admin > Orders (see
// components/admin/delivery-notification-tester.tsx). Builds the exact same
// HTML the customer would receive for a given lifecycle email `type`,
// without writing anything to the order or emailing the real customer --
// so the admin can safely check "kaisa dikhta hai" (how does it look) as
// many times as they want. GET renders it straight in a new tab; POST sends
// it to whatever address the admin types in (e.g. their own inbox), for
// checking actual inline-CSS email-client rendering.
async function buildPreview(orderId: string, type: string, dateOverride?: string | null) {
  const supabase = getSupabaseAdmin();
  const { data: order, error } = await supabase
    .from('orders')
    .select(
      'id, customer_name, customer_email, tracking_number, courier_name, expected_delivery_date, items, total_amount, subtotal, shipping_charge, gst_amount, coupon_code, coupon_discount, gift_card_code, gift_card_discount, loyalty_points_redeemed, loyalty_discount, online_payment_discount'
    )
    .eq('id', orderId)
    .maybeSingle();
  if (error || !order) return null;

  // Test/preview orders (or real orders with no line items yet) still get
  // a couple of placeholder rows here, so the admin can see exactly what
  // the "premium" product-image layout looks like without needing a real
  // order full of items on hand.
  const previewItems =
    Array.isArray(order.items) && order.items.length > 0
      ? order.items
      : [
          {
            product_name: 'Sample Saree',
            image_url: 'https://placehold.co/96x96/7c3a1d/fff?text=Aruhi',
            size: 'Free Size',
            quantity: 1,
            price: order.total_amount || 1999,
          },
        ];
  const previewTotal = order.total_amount || previewItems.reduce((s: number, it: any) => s + it.price * it.quantity, 0);

  const testTracking = order.tracking_number || 'TEST123456789';
  const testCourier = order.courier_name || 'Delhivery';
  const testExpected =
    dateOverride ||
    order.expected_delivery_date ||
    new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  switch (type) {
    case 'shipped':
      return orderShippedEmail({
        id: order.id,
        customer_name: order.customer_name,
        tracking_number: testTracking,
        courier_name: testCourier,
        items: previewItems,
        total_amount: previewTotal,
      });
    case 'arriving':
      return orderArrivingEmail({
        id: order.id,
        customer_name: order.customer_name,
        expected_delivery_date: testExpected,
        courier_name: testCourier,
        tracking_number: testTracking,
        items: previewItems,
        total_amount: previewTotal,
      });
    case 'out_for_delivery':
      return orderOutForDeliveryEmail({
        id: order.id,
        customer_name: order.customer_name,
        courier_name: testCourier,
        tracking_number: testTracking,
        items: previewItems,
        total_amount: previewTotal,
      });
    case 'cod_to_prepaid': {
      // No trackingId here on purpose -- this is a dry-run preview/test
      // send, it never touches order_payment_request_events, so there's
      // nothing to open/click-track. The link in a preview goes straight
      // to the resume page.
      const { data: storeSetting } = await supabase.from('settings').select('value').eq('key', 'store_info').maybeSingle();
      return codToPrepaidRequestEmail({
        id: order.id,
        customer_name: order.customer_name,
        items: previewItems,
        total_amount: previewTotal,
        online_payment_discount: order.online_payment_discount ?? undefined,
        subtotal: order.subtotal,
        shipping_charge: order.shipping_charge,
        gst_amount: order.gst_amount,
        coupon_code: order.coupon_code,
        coupon_discount: order.coupon_discount,
        gift_card_code: order.gift_card_code,
        gift_card_discount: order.gift_card_discount,
        loyalty_points_redeemed: order.loyalty_points_redeemed,
        loyalty_discount: order.loyalty_discount,
        store: (storeSetting?.value as any) || undefined,
      });
    }
    case 'review_request':
      return reviewRequestEmail({
        id: order.id,
        customer_name: order.customer_name,
        items: previewItems,
      });
    case 'review_reminder':
      return reviewReminderEmail({
        id: order.id,
        customer_name: order.customer_name,
        items: previewItems,
      });
    case 'delivered':
    case 'paid':
    case 'cancelled':
    case 'failed':
    case 'pending':
      return orderStatusUpdateEmail({
        id: order.id,
        customer_name: order.customer_name,
        status: type,
        tracking_number: testTracking,
        courier_name: testCourier,
        items: previewItems,
        total_amount: previewTotal,
        // Reflect this order's real flow in the preview so "Test" actually
        // shows the admin what the customer would receive (see the same
        // gating in verify-payment / updateOrderStatus).
        isPaymentRequestFlow: type === 'paid' ? await isInPaymentRequestFlow(order.id).catch(() => false) : false,
      });
    default:
      return null;
  }
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const cookie = cookies().get(ADMIN_SESSION_COOKIE)?.value ?? null;
  const verified = await verifyAdminToken(cookie);
  if (!verified.valid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type') || '';
  const date = searchParams.get('date');

  const result = await buildPreview(params.id, type, date);
  if (!result) {
    return NextResponse.json({ error: 'Unknown email type or order not found' }, { status: 400 });
  }

  return new NextResponse(result.html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const cookie = cookies().get(ADMIN_SESSION_COOKIE)?.value ?? null;
  const verified = await verifyAdminToken(cookie);
  if (!verified.valid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const type = body?.type;
  const to = body?.to;
  if (!type || !to) {
    return NextResponse.json({ error: 'Missing type or "to" email address' }, { status: 400 });
  }

  const result = await buildPreview(params.id, type, body?.date);
  if (!result) {
    return NextResponse.json({ error: 'Unknown email type or order not found' }, { status: 400 });
  }

  const sendResult = await sendEmail({ to, subject: `[TEST] ${result.subject}`, html: result.html });
  if (!sendResult.success) {
    return NextResponse.json({ error: 'error' in sendResult ? sendResult.error : 'Send failed' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
