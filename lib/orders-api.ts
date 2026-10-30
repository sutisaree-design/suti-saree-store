import { getSupabaseAdmin } from './supabase-admin';
import { sendEmail } from './email';
import { orderStatusUpdateEmail } from './email-templates';
import { isInPaymentRequestFlow } from './order-payment-events';
import { refundOrderPayment } from './payment-refund';
import { awardLoyaltyPointsForDeliveredOrder } from './loyalty-award';

// SECURITY NOTE: this now uses the service-role client instead of the
// anon-key client. Both callers of this file (app/api/admin/orders and
// app/api/admin/orders/[id]) already verify the admin session cookie via
// verifyAdminToken() before calling these functions, so authorization is
// unchanged. What changes is that this file no longer depends on `orders`
// having a wide-open anon RLS policy to work -- so orders' RLS can be
// safely locked down to "customers can only see their own orders"
// without breaking the admin dashboard.

// Attaches, on each order, a `_item_sources` map keyed by product_id ->
// { source_name, whatsapp_name, whatsapp_number, buy_price } — purely
// for the admin Orders panel to show "this item's product came from
// supplier X" at a glance. Reads the hidden product_sourcing /
// product_sources tables (service_role only, zero anon RLS policies —
// see 20260910000000_hidden_product_sources.sql). Never touches, and is
// never called from, anything customer-facing.
async function attachItemSources(supabase: ReturnType<typeof getSupabaseAdmin>, orders: any[]) {
  const productIds = new Set<string>();
  for (const order of orders) {
    const items = Array.isArray(order.items) ? order.items : [];
    for (const item of items) {
      if (item?.product_id) productIds.add(item.product_id);
    }
  }
  if (productIds.size === 0) return orders;

  const { data: sourcingRows, error: sourcingError } = await supabase
    .from('product_sourcing')
    .select('product_id, buy_price, product_source_id')
    .in('product_id', Array.from(productIds));
  if (sourcingError || !sourcingRows || sourcingRows.length === 0) return orders;

  const sourceIds = Array.from(
    new Set(sourcingRows.map((r) => r.product_source_id).filter((id): id is string => !!id))
  );
  let sourcesById = new Map<string, any>();
  if (sourceIds.length > 0) {
    const { data: sources } = await supabase
      .from('product_sources')
      .select('id, name, whatsapp_name, whatsapp_number')
      .in('id', sourceIds);
    sourcesById = new Map((sources ?? []).map((s) => [s.id, s]));
  }

  const byProductId = new Map(
    sourcingRows.map((r) => [
      r.product_id,
      {
        buy_price: r.buy_price,
        source_name: r.product_source_id ? sourcesById.get(r.product_source_id)?.name ?? null : null,
        whatsapp_name: r.product_source_id ? sourcesById.get(r.product_source_id)?.whatsapp_name ?? null : null,
        whatsapp_number: r.product_source_id ? sourcesById.get(r.product_source_id)?.whatsapp_number ?? null : null,
      },
    ])
  );

  return orders.map((order) => {
    const items = Array.isArray(order.items) ? order.items : [];
    const map: Record<string, any> = {};
    for (const item of items) {
      if (item?.product_id && byProductId.has(item.product_id)) {
        map[item.product_id] = byProductId.get(item.product_id);
      }
    }
    return Object.keys(map).length > 0 ? { ...order, _item_sources: map } : order;
  });
}

// Attaches, on each order, the latest linked `returns` row's status and
// refund_status (as `_return_status` / `_return_refund_status`) — purely
// for the admin Orders panel's Refund column. Needed because a return's
// refund only ever updates the `returns` row (see
// lib/return-automation.ts / app/api/admin/returns/[id]/refund), never
// orders.refund_status — that column is exclusively written by the
// customer self-CANCELLATION flow (app/api/orders/[id]/cancel). Showing
// only orders.refund_status in the admin panel would silently miss every
// refund that came through a return/exchange instead of a cancellation.
// "Latest" = most recently created return for that order, since an order
// can in principle have more than one return row (e.g. a rejected return
// followed by a fresh one) and the admin only cares about the current one.
async function attachReturnRefundStatus(supabase: ReturnType<typeof getSupabaseAdmin>, orders: any[]) {
  const orderIds = orders.map((o) => o.id).filter(Boolean);
  if (orderIds.length === 0) return orders;

  const { data: returns, error } = await supabase
    .from('returns')
    .select('order_id, status, refund_status, created_at')
    .in('order_id', orderIds)
    .order('created_at', { ascending: false });
  if (error || !returns || returns.length === 0) return orders;

  const latestByOrderId = new Map<string, { status: string; refund_status: string | null }>();
  for (const r of returns) {
    // Already ordered newest-first, so the first one seen per order_id wins.
    if (!latestByOrderId.has(r.order_id)) {
      latestByOrderId.set(r.order_id, { status: r.status, refund_status: r.refund_status ?? null });
    }
  }

  return orders.map((order) => {
    const match = latestByOrderId.get(order.id);
    return match ? { ...order, _return_status: match.status, _return_refund_status: match.refund_status } : order;
  });
}

// Attaches, on each order, a `_review_rewards` array -- one entry per
// (order, product) that has earned a "leave a review" discount coupon
// via app/api/review-link/[token]/route.ts -> issueReviewReward(). A
// single order can carry more than one of these (one per reviewed
// product), unlike the five fixed lifecycle columns below, which is why
// this is a join rather than another *_sent_at column on `orders`
// itself. Powers the extra "Review Reward" row(s) in Admin -> Orders ->
// Email Log (see EmailLog() in components/admin/orders-panel.tsx) --
// specifically email_sent_at / email_error, written back by that same
// route right after it calls sendEmail() with reviewRewardIssuedEmail()
// (see 20261011000000_review_reward_email_tracking.sql). Product name
// for display comes from the order's own `items` (already loaded),
// keyed by product_id -- no extra products-table join needed here.
async function attachReviewRewards(supabase: ReturnType<typeof getSupabaseAdmin>, orders: any[]) {
  const orderIds = orders.map((o) => o.id).filter(Boolean);
  if (orderIds.length === 0) return orders;

  const { data: rewards, error } = await supabase
    .from('review_rewards')
    .select('id, order_id, product_id, rating, email_sent_at, email_error, created_at, coupons(code, discount_type, discount_value, expires_at)')
    .in('order_id', orderIds);
  if (error || !rewards || rewards.length === 0) return orders;

  const byOrderId = new Map<string, any[]>();
  for (const r of rewards) {
    const list = byOrderId.get(r.order_id) ?? [];
    list.push({
      id: r.id,
      product_id: r.product_id,
      rating: r.rating,
      email_sent_at: r.email_sent_at,
      email_error: r.email_error,
      created_at: r.created_at,
      code: (r as any).coupons?.code ?? null,
      discount_type: (r as any).coupons?.discount_type ?? null,
      discount_value: (r as any).coupons?.discount_value ?? null,
    });
    byOrderId.set(r.order_id, list);
  }

  return orders.map((order) => {
    const list = byOrderId.get(order.id);
    return list && list.length > 0 ? { ...order, _review_rewards: list } : order;
  });
}

export async function fetchOrders() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  const withSources = await attachItemSources(supabase, data ?? []);
  const withReturns = await attachReturnRefundStatus(supabase, withSources);
  const withRewards = await attachReviewRewards(supabase, withReturns);
  return attachShipments(supabase, withRewards);
}

// Adds `_shipments` (every parcel of the order, oldest first) to each order
// for the Admin > Orders UI. Quietly returns orders untouched if the
// order_shipments table doesn't exist yet (migration not applied).
async function attachShipments<T extends { id: string }>(supabase: any, orders: T[]): Promise<(T & { _shipments: any[] })[]> {
  if (orders.length === 0) return [];
  const { data, error } = await supabase
    .from('order_shipments')
    .select('*')
    .in('order_id', orders.map((o) => o.id))
    .order('shipment_no', { ascending: true });
  const byOrder = new Map<string, any[]>();
  if (!error) {
    for (const row of data ?? []) {
      const list = byOrder.get(row.order_id) ?? [];
      list.push(row);
      byOrder.set(row.order_id, list);
    }
  }
  return orders.map((o) => ({ ...o, _shipments: byOrder.get(o.id) ?? [] }));
}

// Called from Admin -> Orders whenever the admin changes an order's status
// (the dropdown in the orders table, or the order detail view). Besides
// writing the new status, this sends the customer a "your order status
// changed" email (best-effort -- a failed/unconfigured email provider
// never blocks the status update itself). The order_status_history table
// is populated separately by a DB trigger, so this function doesn't need
// to touch that.
//
// REFUND: moving a *paid online* order to 'cancelled' from here used to be
// a silent no-op on the money side -- only the customer-facing self-cancel
// route (app/api/orders/[id]/cancel) actually called Razorpay. The email
// copy for 'cancelled' has always promised "any eligible refund will be
// processed", so that promise needs to hold true here too. This mirrors
// that route's logic (same auto_refund_enabled setting, same refund_status
// values) so admin-initiated cancellations refund automatically as well.
export async function updateOrderStatus(id: string, status: string) {
  const supabase = getSupabaseAdmin();

  // Fetch first so we know the customer's email + previous status. Also
  // lets us skip the email entirely if the status isn't actually changing
  // (e.g. the admin re-selects the same value).
  const { data: existing, error: fetchError } = await supabase
    .from('orders')
    .select(
      'id, status, customer_email, customer_name, tracking_number, courier_name, items, total_amount, payment_method, razorpay_payment_id, payment_gateway, cashfree_order_id, advance_amount, advance_paid_at, advance_refund_id'
    )
    .eq('id', id)
    .maybeSingle();
  if (fetchError) throw fetchError;

  const { data, error } = await supabase.from('orders').update({ status }).eq('id', id);
  if (error) throw error;

  // Only orders that actually had money captured need a refund -- same
  // gating as the customer self-cancel route. Checked against `existing`
  // (the pre-update row), so this only fires on the paid -> cancelled
  // transition, not e.g. pending -> cancelled or a re-cancel of an
  // already-cancelled order.
  // Partial Pay: only the advance was ever captured, so only the advance is refunded (an
  // admin-initiated cancel is the store's call, so unlike an RTO it IS refunded).
  const isPartialAdvancePaid =
    existing?.payment_method === 'partial' &&
    !!existing.advance_paid_at &&
    !!existing.razorpay_payment_id &&
    !existing.advance_refund_id;
  const refundAmount = isPartialAdvancePaid ? Number(existing!.advance_amount) : Number(existing?.total_amount);
  const needsRefund =
    status === 'cancelled' &&
    existing?.status === 'paid' &&
    ((existing.payment_method === 'online' && !!existing.razorpay_payment_id) || isPartialAdvancePaid);

  let refundOutcome: {
    status: 'not_applicable' | 'refunded' | 'pending_manual' | 'failed';
    amount?: number;
    razorpay_refund_id?: string | null;
  } = { status: 'not_applicable' };

  if (needsRefund) {
    const { data: refundSettingRow } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'refund_automation')
      .maybeSingle();
    const autoRefundEnabled =
      (refundSettingRow?.value as { auto_refund_enabled?: boolean } | null)?.auto_refund_enabled ?? true;

    if (!autoRefundEnabled) {
      await supabase.from('orders').update({ refund_status: 'pending_manual' }).eq('id', id);
      refundOutcome = { status: 'pending_manual', amount: refundAmount };
    } else {
      const refundResult = await refundOrderPayment(existing as any, refundAmount);
      if (refundResult.success) {
        await supabase
          .from('orders')
          .update({
            refund_status: 'refunded',
            razorpay_refund_id: refundResult.refundId,
            ...(isPartialAdvancePaid ? { advance_refund_id: refundResult.refundId } : {}),
          })
          .eq('id', id);
        refundOutcome = {
          status: 'refunded',
          amount: refundAmount,
          razorpay_refund_id: refundResult.refundId,
        };
      } else {
        // Order stays cancelled even if the refund call failed -- we just
        // flag it so the admin can see it needs a manual refund instead of
        // it silently getting missed.
        await supabase.from('orders').update({ refund_status: 'failed' }).eq('id', id);
        refundOutcome = { status: 'failed', amount: refundAmount };
      }
    }
  }

  // Loyalty points are credited only once the order is actually delivered.
  // Best-effort and idempotent -- never blocks the status update.
  if (status === 'delivered' && existing?.status !== 'delivered') {
    awardLoyaltyPointsForDeliveredOrder(id).catch((err) => {
      console.error('[updateOrderStatus] loyalty award failed:', err);
    });
  }

  if (existing && existing.status !== status && existing.customer_email) {
    // Same gating as verify-payment: only orders from Admin > "Request
    // Online Payment" get the made/kept-ready-on-demand apology copy when
    // moved to 'paid' -- e.g. an admin marking a COD/manually-confirmed
    // order as paid shouldn't send that line either.
    const isPaymentRequestFlow = status === 'paid' ? await isInPaymentRequestFlow(existing.id).catch(() => false) : false;
    const { subject, html } = orderStatusUpdateEmail({
      id: existing.id,
      customer_name: existing.customer_name,
      status,
      tracking_number: existing.tracking_number,
      courier_name: existing.courier_name,
      items: existing.items,
      total_amount: existing.total_amount,
      isPaymentRequestFlow,
      payment_method: existing.payment_method,
      advance_amount: existing.advance_amount,
      refund: needsRefund ? refundOutcome : undefined,
    });
    // Best-effort -- never let a slow/broken email provider fail the
    // admin's status update.
    sendEmail({ to: existing.customer_email, subject, html })
      .then((result) => {
        // Fills in the Email Log's "Delivered" row for the real path (admin
        // dropdown or the auto-detect cron, both funnel through here).
        // Other status transitions (paid/cancelled/etc) also send this same
        // template but don't have their own dedicated *_sent_at column --
        // out of scope for the Email Log, which only tracks the fixed
        // lifecycle (Confirmed/Shipped/Arriving/Out for Delivery/Delivered).
        if (result.success && status === 'delivered') {
          return supabase
            .from('orders')
            .update({ delivered_email_sent_at: new Date().toISOString() })
            .eq('id', id);
        }
      })
      .catch((err) => {
        console.error('[updateOrderStatus] status-change email failed:', err);
      });
  }

  return data;
}

// Lets Admin > Orders fix a customer's email / phone / shipping address on
// an order that hasn't shipped yet -- e.g. the customer messaged asking for
// a corrected pincode after checkout. Deliberately separate from
// updateOrderStatus() (different concern, no status-change email to send)
// and server-side-gated against edits after a shipment already exists, so
// this can't be used to quietly change the destination on a package that's
// already with the courier -- even if a stale admin UI somehow still shows
// the Edit button.
export async function updateOrderContactDetails(
  id: string,
  updates: {
    customer_email?: string;
    customer_phone?: string;
    shipping_address?: Record<string, any>;
  }
) {
  const supabase = getSupabaseAdmin();

  const { data: existing, error: fetchError } = await supabase
    .from('orders')
    .select('id, tracking_number, status')
    .eq('id', id)
    .maybeSingle();
  if (fetchError) throw fetchError;

  const alreadyShipped =
    !!existing?.tracking_number || existing?.status === 'shipped' || existing?.status === 'delivered';
  if (alreadyShipped) {
    const err: any = new Error('Order already has a shipment -- contact/address can no longer be edited');
    err.code = 'ORDER_ALREADY_SHIPPED';
    throw err;
  }

  const patch: Record<string, any> = {};
  if (updates.customer_email !== undefined) patch.customer_email = updates.customer_email;
  if (updates.customer_phone !== undefined) patch.customer_phone = updates.customer_phone;
  if (updates.shipping_address !== undefined) patch.shipping_address = updates.shipping_address;

  const { data, error } = await supabase.from('orders').update(patch).eq('id', id).select().maybeSingle();
  if (error) throw error;
  return data;
}

// Bulk delete -- used by the admin "select rows -> Delete Selected" action.
// Related rows (returns, tracking events, etc.) are cleaned up automatically
// by the ON DELETE CASCADE / SET NULL constraints already defined on the
// orders foreign keys, so a plain delete here is safe.
export async function deleteOrders(ids: string[]) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from('orders').delete().in('id', ids).select('id');
  if (error) throw error;
  return data;
}
