// Shared logic for the three automatic delivery-lifecycle emails:
//   1. "Arriving <date>"      -- as soon as we learn the expected delivery date
//   2. "Out for delivery"     -- as soon as the courier marks it out for delivery
//   3. "Delivered"            -- as soon as the courier (or admin) marks it delivered
//
// Used by:
//   - lib/cron-jobs.ts (runForwardShipmentTrackingJob) -- the real, automatic
//     path. Never resends (checks the *_email_sent_at columns first).
//   - app/api/admin/orders/[id]/delivery-test/route.ts -- the Admin > Orders
//     "Test" panel, so you can trigger any of these on a real (or test) order
//     to see exactly what the customer would receive, with `force: true` to
//     resend even if it already went out once.
import { getSupabaseAdmin } from './supabase-admin';
import { sendEmail } from './email';
import { orderArrivingEmail, orderOutForDeliveryEmail, orderStatusUpdateEmail } from './email-templates';
import { updateOrderStatus } from './orders-api';

type NotifyResult = { sent: boolean; skipped?: string };

async function getOrder(id: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('orders')
    .select(
      'id, customer_name, customer_email, status, tracking_number, courier_name, expected_delivery_date, arriving_email_sent_at, out_for_delivery_email_sent_at, out_for_delivery, items, total_amount'
    )
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// Step 1 -- "Arriving <date>". Call whenever you learn/refresh the expected
// delivery date (normally from the courier's tracking response). Pass
// `expectedDeliveryDate` explicitly so the admin test panel can set one on
// orders that don't have live courier tracking yet.
export async function sendArrivingNotification(
  orderId: string,
  opts: { expectedDeliveryDate?: string; force?: boolean } = {}
): Promise<NotifyResult> {
  const supabase = getSupabaseAdmin();
  const order = await getOrder(orderId);
  if (!order) return { sent: false, skipped: 'Order not found' };
  if (!order.customer_email) return { sent: false, skipped: 'No customer email on this order' };

  const expected = opts.expectedDeliveryDate || order.expected_delivery_date;
  if (!expected) return { sent: false, skipped: 'No expected delivery date set' };

  if (order.arriving_email_sent_at && !opts.force) {
    return { sent: false, skipped: 'Already sent' };
  }
  if (['delivered', 'cancelled', 'failed'].includes(order.status)) {
    return { sent: false, skipped: `Order is already ${order.status}` };
  }

  const { subject, html } = orderArrivingEmail({
    id: order.id,
    customer_name: order.customer_name,
    expected_delivery_date: expected,
    courier_name: order.courier_name,
    tracking_number: order.tracking_number,
    items: order.items,
    total_amount: order.total_amount,
  });
  await sendEmail({ to: order.customer_email, subject, html });

  await supabase
    .from('orders')
    .update({ expected_delivery_date: expected, arriving_email_sent_at: new Date().toISOString() })
    .eq('id', orderId);

  return { sent: true };
}

// Step 2 -- "Out for delivery today". This is the practical stand-in for
// "email me half an hour before it's delivered" -- Delhivery's polling API
// doesn't give a precise ETA, but "out for delivery" is the same-day signal
// that it's genuinely close, and the cron job checks every ~15 minutes so
// this typically goes out within minutes of the courier updating status.
export async function sendOutForDeliveryNotification(
  orderId: string,
  opts: { force?: boolean } = {}
): Promise<NotifyResult> {
  const supabase = getSupabaseAdmin();
  const order = await getOrder(orderId);
  if (!order) return { sent: false, skipped: 'Order not found' };
  if (!order.customer_email) return { sent: false, skipped: 'No customer email on this order' };

  if (order.out_for_delivery_email_sent_at && !opts.force) {
    return { sent: false, skipped: 'Already sent' };
  }
  if (['delivered', 'cancelled', 'failed'].includes(order.status)) {
    return { sent: false, skipped: `Order is already ${order.status}` };
  }

  const { subject, html } = orderOutForDeliveryEmail({
    id: order.id,
    customer_name: order.customer_name,
    courier_name: order.courier_name,
    tracking_number: order.tracking_number,
    items: order.items,
    total_amount: order.total_amount,
  });
  await sendEmail({ to: order.customer_email, subject, html });

  await supabase
    .from('orders')
    .update({ out_for_delivery: true, out_for_delivery_email_sent_at: new Date().toISOString() })
    .eq('id', orderId);

  return { sent: true };
}

// Step 3 -- "Delivered". Normally this rides on updateOrderStatus() (used by
// both the admin status dropdown and the auto-detect cron job), which
// already dedupes by only emailing when order.status actually changes. The
// `force` option (admin test panel only) bypasses that so you can resend a
// preview even when the order is already marked delivered.
export async function sendDeliveredNotification(
  orderId: string,
  opts: { force?: boolean } = {}
): Promise<NotifyResult> {
  const supabase = getSupabaseAdmin();
  const order = await getOrder(orderId);
  if (!order) return { sent: false, skipped: 'Order not found' };
  if (!order.customer_email) return { sent: false, skipped: 'No customer email on this order' };

  if (order.status !== 'delivered') {
    // Real path: flip status, which sends the email as a side effect.
    await updateOrderStatus(orderId, 'delivered');
    return { sent: true };
  }

  if (!opts.force) {
    return { sent: false, skipped: 'Order is already delivered (use force to resend)' };
  }

  const { subject, html } = orderStatusUpdateEmail({
    id: order.id,
    customer_name: order.customer_name,
    status: 'delivered',
    tracking_number: order.tracking_number,
    courier_name: order.courier_name,
    items: order.items,
    total_amount: order.total_amount,
  });
  const result = await sendEmail({ to: order.customer_email, subject, html });
  if (result.success) {
    await supabase
      .from('orders')
      .update({ delivered_email_sent_at: new Date().toISOString() })
      .eq('id', orderId);
  }
  return { sent: true };
}
