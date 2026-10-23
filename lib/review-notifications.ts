// Shared logic for the two review-nudge emails:
//   1. "Rate & Review"  -- sent once, REVIEW_REQUEST_DELAY_DAYS after the
//      order is marked delivered.
//   2. "Reminder"       -- sent once more, REVIEW_REMINDER_DELAY_DAYS after
//      the request, but ONLY if the customer still hasn't reviewed
//      anything from the order.
//
// Used by:
//   - lib/cron-jobs.ts (runReviewRequestEmailsJob / runReviewReminderEmailsJob)
//     -- the real, automatic path. Both are daily-cadence scans over
//     already-delivered orders (see those functions for the exact
//     "how many days ago" windows), and both check the *_sent_at columns
//     first so nothing is ever double-sent.
//   - app/api/admin/orders/[id]/delivery-test/route.ts -- Admin > Orders
//     "Test" panel, so an admin can fire either one on demand (with
//     `force: true` to resend even if it already went out).
import { getSupabaseAdmin } from './supabase-admin';
import { sendEmail } from './email';
import { reviewRequestEmail, reviewReminderEmail } from './email-templates';

type NotifyResult = { sent: boolean; skipped?: string };

async function getOrder(id: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('orders')
    .select(
      'id, user_id, customer_name, customer_email, status, items, delivered_email_sent_at, review_request_email_sent_at, review_reminder_email_sent_at'
    )
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// True if the customer has left at least one review (rating-only counts)
// against any product in this order. Matched by user_id when the order has
// one (the normal, logged-in-checkout case); guest orders with no user_id
// have no reliable way to match a review back to them, so they're treated
// as "not yet reviewed" -- worst case they get one reminder they didn't
// strictly need, which is a fair trade for not silently skipping every
// guest order.
export async function hasOrderBeenReviewed(order: { user_id?: string | null; items?: any[] }): Promise<boolean> {
  if (!order.user_id) return false;
  const productIds = Array.from(
    new Set((order.items || []).map((it: any) => it.product_id).filter(Boolean))
  );
  if (productIds.length === 0) return false;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('reviews')
    .select('id')
    .eq('user_id', order.user_id)
    .in('product_id', productIds)
    .limit(1);
  if (error) throw error;
  return (data?.length || 0) > 0;
}

export async function sendReviewRequestNotification(
  orderId: string,
  opts: { force?: boolean } = {}
): Promise<NotifyResult> {
  const supabase = getSupabaseAdmin();
  const order = await getOrder(orderId);
  if (!order) return { sent: false, skipped: 'Order not found' };
  if (!order.customer_email) return { sent: false, skipped: 'No customer email on this order' };
  if (order.status !== 'delivered') return { sent: false, skipped: `Order is not delivered yet (status: ${order.status})` };
  if (order.review_request_email_sent_at && !opts.force) {
    return { sent: false, skipped: 'Already sent' };
  }

  const { subject, html } = await reviewRequestEmail({
    id: order.id,
    customer_name: order.customer_name,
    items: order.items,
  });
  const result = await sendEmail({ to: order.customer_email, subject, html });
  if (result.success) {
    await supabase
      .from('orders')
      .update({ review_request_email_sent_at: new Date().toISOString() })
      .eq('id', orderId);
  }
  return { sent: result.success };
}

export async function sendReviewReminderNotification(
  orderId: string,
  opts: { force?: boolean } = {}
): Promise<NotifyResult> {
  const supabase = getSupabaseAdmin();
  const order = await getOrder(orderId);
  if (!order) return { sent: false, skipped: 'Order not found' };
  if (!order.customer_email) return { sent: false, skipped: 'No customer email on this order' };
  if (order.status !== 'delivered') return { sent: false, skipped: `Order is not delivered yet (status: ${order.status})` };
  if (!order.review_request_email_sent_at) {
    return { sent: false, skipped: 'Review request has not been sent yet' };
  }
  if (order.review_reminder_email_sent_at && !opts.force) {
    return { sent: false, skipped: 'Already sent' };
  }

  if (!opts.force) {
    const alreadyReviewed = await hasOrderBeenReviewed(order);
    if (alreadyReviewed) {
      return { sent: false, skipped: 'Customer already reviewed this order' };
    }
  }

  const { subject, html } = await reviewReminderEmail({
    id: order.id,
    customer_name: order.customer_name,
    items: order.items,
  });
  const result = await sendEmail({ to: order.customer_email, subject, html });
  if (result.success) {
    await supabase
      .from('orders')
      .update({ review_reminder_email_sent_at: new Date().toISOString() })
      .eq('id', orderId);
  }
  return { sent: result.success };
}
