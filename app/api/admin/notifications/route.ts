import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAdminToken, ADMIN_SESSION_COOKIE } from '@/lib/admin-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

// Aggregates "needs attention" events from across the admin panel (new
// orders, contact messages, support tickets, return requests, restock
// requests, abandoned carts) into a single feed for the top-right
// notification bell. The client polls this endpoint every ~20s and diffs
// against a locally-stored "last seen" timestamp to figure out the unread
// count, so nothing here needs a dedicated read/unread column.
export type AdminNotification = {
  id: string;
  type:
    | 'order'
    | 'order_paid'
    | 'order_delivered'
    | 'contact_message'
    | 'support_ticket'
    | 'return'
    | 'restock'
    | 'abandoned_cart'
    | 'vendor_pickup'
    | 'vendor_return_pending'
    | 'review'
    | 'vendor_application'
    | 'new_reseller'
    | 'new_affiliate';
  title: string;
  message: string;
  section: string;
  // Id of the specific item (order, ticket, review, ...) so the bell can
  // deep-link straight to it instead of just opening the whole section.
  ref?: string;
  created_at: string;
};

export async function GET() {
  const cookie = cookies().get(ADMIN_SESSION_COOKIE)?.value ?? null;
  const verified = await verifyAdminToken(cookie);
  if (!verified.valid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();

  try {
    const [ordersRes, paidRes, contactRes, ticketsRes, returnsRes, restockRes, cartsRes, pickupRes, vendorReturnRes, reviewsRes, vendorAppsRes, resellersRes, affiliatesRes, deliveredRes] = await Promise.all([
      supabase
        .from('orders')
        .select('id, customer_name, customer_email, total_amount, created_at')
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(20),
      // COD -> prepaid: the moment a customer actually pays an order that
      // went through Admin > Orders > "Request Online Payment", verify-payment
      // logs a 'payment_verified' event (only orders in that flow are ever
      // logged there -- see lib/order-payment-events.ts). Without this, the
      // order's "New order received" bell entry just vanished when its status
      // flipped pending -> paid, and nothing told the admin the money arrived.
      // Latest 10 only, same "recent arrivals" pattern as reviews below.
      supabase
        .from('order_payment_request_events')
        .select('id, created_at, orders(id, customer_name, customer_email, total_amount, online_payment_discount)')
        .eq('event_type', 'payment_verified')
        .order('created_at', { ascending: false })
        .limit(10),
      supabase
        .from('contact_messages')
        .select('id, name, subject, created_at')
        .eq('status', 'new')
        .order('created_at', { ascending: false })
        .limit(20),
      supabase
        .from('support_tickets')
        .select('id, customer_name, customer_email, subject, created_at')
        .eq('status', 'open')
        .order('created_at', { ascending: false })
        .limit(20),
      supabase
        .from('returns')
        .select('id, type, reason, created_at')
        .eq('status', 'requested')
        .order('created_at', { ascending: false })
        .limit(20),
      supabase
        .from('stock_notifications')
        .select('id, email, phone, created_at, products(name)')
        .eq('notified', false)
        .order('created_at', { ascending: false })
        .limit(20),
      supabase
        .from('abandoned_carts')
        .select('id, email, cart_value, last_activity_at')
        .eq('recovered', false)
        .order('last_activity_at', { ascending: false })
        .limit(10),
      // Phase 3B — vendor tapped "Request Pickup". Stays a task until the
      // item moves past vendor_accepted (i.e. courier actually picked it
      // up), same filter the vendor's own dashboard uses to show/hide the
      // upload-handoff-photo step.
      supabase
        .from('order_items')
        .select('id, product_name, quantity, pickup_requested_at, vendors(id, business_name, pickup_address)')
        .eq('stage', 'vendor_accepted')
        .not('pickup_requested_at', 'is', null)
        .order('pickup_requested_at', { ascending: false })
        .limit(20),
      // Return to Vendor queue — same-product-returned-2x, unsold past
      // the vendor's hold window, never-sold, etc. One task per pending
      // row, with "how many days it's been sitting" baked into the
      // message so the bell doubles as the days-pending indicator.
      supabase
        .from('return_to_vendor_queue')
        .select('id, reason, note, created_at, vendors(business_name), products(name), order_items(product_name)')
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(30),
      // New reviews/ratings — auto-published 5s after submission (see
      // scheduleAutoPublish in lib/reviews-api.ts), so this isn't a
      // "pending action" queue like the others; it's just the latest
      // arrivals so an admin notices right away and can Hide one from
      // the Reviews panel if needed. Newest 10 only, so the bell doesn't
      // fill up with old reviews once caught up.
      supabase
        .from('reviews')
        .select('id, customer_name, rating, comment, title, created_at, product_id, products(name)')
        .order('created_at', { ascending: false })
        .limit(10),
      // New vendor applications waiting on Approve/Reject (Vendors panel,
      // "Pending Applications" tab in the screenshot). This IS a real
      // pending-action queue, like orders/returns/tickets above.
      supabase
        .from('vendors')
        .select('id, business_name, owner_name, created_at')
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(20),
      // Reseller & affiliate signups are both self-serve / auto-approved
      // (no pending state to gate on — see lib/reseller-api.ts and the
      // `status: 'approved'` insert in app/api/affiliate/route.ts), so
      // like reviews these are just "latest arrivals" rather than a
      // to-do queue. Newest 5 each keeps the bell from filling up once
      // an admin is caught up.
      supabase
        .from('reseller_profiles')
        .select('id, user_id, business_name, created_at')
        .order('created_at', { ascending: false })
        .limit(5),
      supabase
        .from('affiliates')
        .select('id, user_id, code, created_at')
        .order('created_at', { ascending: false })
        .limit(5),
      // Orders that just got delivered (auto-detected by the courier-tracking
      // cron or set manually from Admin > Orders). `delivered_email_sent_at`
      // is stamped by updateOrderStatus() the moment the "Delivered" email
      // goes out, so it doubles as the delivery time. Latest 10 only, same
      // "recent arrivals" pattern as reviews / COD-paid above.
      supabase
        .from('orders')
        .select('id, customer_name, customer_email, total_amount, delivered_email_sent_at')
        .eq('status', 'delivered')
        .not('delivered_email_sent_at', 'is', null)
        .order('delivered_email_sent_at', { ascending: false })
        .limit(10),
    ]);

    // reseller_profiles / affiliates don't carry the person's name --
    // resolved the same way the admin Resellers/Affiliates panels do,
    // via `profiles.full_name` keyed by user_id.
    const nameLookupIds = [
      ...(resellersRes.data || []).map((r: any) => r.user_id),
      ...(affiliatesRes.data || []).map((a: any) => a.user_id),
    ].filter(Boolean);
    const { data: nameProfiles } = nameLookupIds.length
      ? await supabase.from('profiles').select('id, full_name').in('id', nameLookupIds)
      : { data: [] as any[] };
    const nameByUserId = new Map((nameProfiles || []).map((p: any) => [p.id, p.full_name]));

    const notifications: AdminNotification[] = [];

    (ordersRes.data || []).forEach((o: any) => {
      notifications.push({
        id: `order-${o.id}`,
        type: 'order',
        title: 'New order received',
        message: `${o.customer_name || o.customer_email || 'A customer'} placed order #${String(o.id).slice(0, 8).toUpperCase()} for ₹${o.total_amount}`,
        section: 'orders',
        ref: o.id,
        created_at: o.created_at,
      });
    });

    (paidRes.data || []).forEach((e: any) => {
      const o = Array.isArray(e.orders) ? e.orders[0] : e.orders;
      if (!o) return;
      const total = Number(o.total_amount ?? 0);
      const discount = Number(o.online_payment_discount ?? 0);
      const shortId = String(o.id).slice(0, 8).toUpperCase();
      notifications.push({
        id: `order-paid-${e.id}`,
        type: 'order_paid',
        title: 'COD order paid online ✅',
        message: `${o.customer_name || o.customer_email || 'A customer'} paid ₹${total} online${
          discount > 0 ? ` (was ₹${total + discount} COD)` : ''
        } — order #${shortId} is now prepaid, ready to process`,
        section: 'orders',
        ref: o.id,
        created_at: e.created_at,
      });
    });

    (contactRes.data || []).forEach((m: any) => {
      notifications.push({
        id: `contact-${m.id}`,
        type: 'contact_message',
        title: 'New contact message',
        message: `${m.name} — ${m.subject}`,
        section: 'contact-messages',
        ref: m.id,
        created_at: m.created_at,
      });
    });

    (ticketsRes.data || []).forEach((t: any) => {
      notifications.push({
        id: `ticket-${t.id}`,
        type: 'support_ticket',
        title: 'Support ticket opened',
        message: `${t.customer_name || t.customer_email} — ${t.subject}`,
        section: 'support-tickets',
        ref: t.id,
        created_at: t.created_at,
      });
    });

    (returnsRes.data || []).forEach((r: any) => {
      notifications.push({
        id: `return-${r.id}`,
        type: 'return',
        title: r.type === 'exchange' ? 'New exchange request' : 'New return request',
        message: r.reason,
        section: 'returns',
        ref: r.id,
        created_at: r.created_at,
      });
    });

    (restockRes.data || []).forEach((s: any) => {
      notifications.push({
        id: `restock-${s.id}`,
        type: 'restock',
        title: 'Restock request',
        message: `${s.email || (s.phone ? `WhatsApp +${s.phone}` : 'A customer')} wants "${s.products?.name || 'a product'}" back in stock`,
        section: 'restock-alerts',
        ref: s.id,
        created_at: s.created_at,
      });
    });

    (cartsRes.data || []).forEach((c: any) => {
      notifications.push({
        id: `cart-${c.id}`,
        type: 'abandoned_cart',
        title: 'Cart abandoned',
        message: `${c.email || 'A shopper'} left ₹${c.cart_value} in their cart`,
        section: 'abandoned-carts',
        ref: c.id,
        created_at: c.last_activity_at,
      });
    });

    (pickupRes.data || []).forEach((p: any) => {
      notifications.push({
        id: `pickup-${p.id}`,
        type: 'vendor_pickup',
        title: 'Vendor requested pickup',
        message: `Book pickup for "${p.product_name}" (qty ${p.quantity}) — ${p.vendors?.business_name || 'vendor'} at ${p.vendors?.pickup_address || 'address on file'}`,
        section: 'vendors',
        ref: p.vendors?.id,
        created_at: p.pickup_requested_at,
      });
    });

    const RTV_REASON_LABEL: Record<string, string> = {
      never_sold_90d: 'Never sold 90+ din',
      cancelled_returned_60d: 'Cancelled/Returned 60+ din',
      offboarding: 'Vendor off-boarded',
      returned_2x_consent: 'Returned/RTO 2x — same product',
      unsold_after_return: "Unsold past vendor's hold window",
    };

    (vendorReturnRes.data || []).forEach((r: any) => {
      const daysPending = Math.max(
        0,
        Math.floor((Date.now() - new Date(r.created_at).getTime()) / 86_400_000)
      );
      const productName = r.products?.name || r.order_items?.product_name || 'a product';
      const reasonLabel = RTV_REASON_LABEL[r.reason] || r.reason;
      notifications.push({
        id: `vendor-return-${r.id}`,
        type: 'vendor_return_pending',
        title: 'Return to Vendor — pending',
        message: `${productName} (${r.vendors?.business_name || 'vendor'}) — ${reasonLabel} · pending ${daysPending} din`,
        section: 'vendor-ops',
        ref: r.id,
        created_at: r.created_at,
      });
    });

    (reviewsRes.data || []).forEach((r: any) => {
      const stars = '★'.repeat(Math.max(0, Math.min(5, r.rating || 0)));
      const productName = r.products?.name || 'a product';
      const hasWritten = Boolean((r.title && r.title.trim()) || (r.comment && r.comment.trim()));
      notifications.push({
        id: `review-${r.id}`,
        type: 'review',
        title: hasWritten ? 'New review received' : 'New rating received',
        message: `${r.customer_name || 'A customer'} rated "${productName}" ${stars} (${r.rating}/5)${
          hasWritten ? ` — "${(r.title || r.comment || '').slice(0, 60)}"` : ''
        }`,
        section: 'reviews',
        ref: r.id,
        created_at: r.created_at,
      });
    });

    (vendorAppsRes.data || []).forEach((v: any) => {
      notifications.push({
        id: `vendor-app-${v.id}`,
        type: 'vendor_application',
        title: 'New vendor application',
        message: `${v.business_name || 'A vendor'}${v.owner_name ? ` (${v.owner_name})` : ''} applied — waiting on Approve/Reject`,
        section: 'vendors',
        ref: v.id,
        created_at: v.created_at,
      });
    });

    (resellersRes.data || []).forEach((r: any) => {
      const name = nameByUserId.get(r.user_id) || r.business_name || 'A customer';
      notifications.push({
        id: `reseller-${r.id}`,
        type: 'new_reseller',
        title: 'New reseller joined',
        message: `${name} joined the Reseller Program`,
        section: 'resellers',
        ref: r.id,
        created_at: r.created_at,
      });
    });

    (affiliatesRes.data || []).forEach((a: any) => {
      const name = nameByUserId.get(a.user_id) || 'A customer';
      notifications.push({
        id: `affiliate-${a.id}`,
        type: 'new_affiliate',
        title: 'New affiliate joined',
        message: `${name} joined the Affiliate Program (code ${a.code})`,
        section: 'affiliates',
        ref: a.id,
        created_at: a.created_at,
      });
    });

    (deliveredRes.data || []).forEach((o: any) => {
      const shortId = String(o.id).slice(0, 8).toUpperCase();
      notifications.push({
        id: `order-delivered-${o.id}`,
        type: 'order_delivered',
        title: 'Order delivered 📦',
        message: `${o.customer_name || o.customer_email || 'A customer'}'s order #${shortId} (₹${o.total_amount}) was delivered`,
        section: 'orders',
        ref: o.id,
        created_at: o.delivered_email_sent_at,
      });
    });

    notifications.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return NextResponse.json({ notifications: notifications.slice(0, 50) });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to load notifications' }, { status: 500 });
  }
}
