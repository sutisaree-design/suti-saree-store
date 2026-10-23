import { NextResponse } from 'next/server';
import { getCurrentUser, getSupabaseServer } from '@/lib/supabase-server-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { trackDelhiveryShipment } from '@/lib/delhivery-api';

// ---------------------------------------------------------------------
// Deterministic (non-AI) order lookup used by the chat widget's
// "Track my order" quick reply and as a fallback whenever the free-text
// AI model is unavailable/rate-limited. Always answers from real data,
// never invents anything.
//
// Logged-in shopper -> uses their own RLS-scoped orders, no extra info
// needed.
// Guest / not logged in -> needs order ID + the email used at checkout;
// both must match before any order details are returned.
// ---------------------------------------------------------------------

const MAX_ORDERS = 6;

function shortId(id: string) {
  return `#${String(id).slice(0, 8).toUpperCase()}`;
}

async function withTracking(order: any) {
  let currentLocation: string | undefined;
  let expectedDeliveryDate: string | undefined;
  let liveStatus: string | undefined;

  if (order.tracking_number) {
    try {
      // Live courier lookups can be slow — never let one hang the chat reply.
      const result = await Promise.race([
        trackDelhiveryShipment(order.tracking_number),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 6000)),
      ]);
      if (result && result.tracked) {
        currentLocation = result.currentLocation || undefined;
        expectedDeliveryDate = result.expectedDeliveryDate || undefined;
        liveStatus = result.currentStatus || undefined;
      }
    } catch {
      // Fall back silently to whatever's stored on the order row.
    }
  }

  return {
    id: order.id,
    shortId: shortId(order.id),
    status: order.status,
    liveStatus: liveStatus || null,
    createdAt: order.created_at,
    totalAmount: order.total_amount,
    items: Array.isArray(order.items)
      ? order.items.map((i: any) => ({ name: i?.product_name, quantity: i?.quantity }))
      : [],
    courierName: order.courier_name || null,
    trackingNumber: order.tracking_number || null,
    currentLocation: currentLocation || null,
    expectedDeliveryDate: expectedDeliveryDate || null,
  };
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const rawOrderId = typeof body?.orderId === 'string' ? body.orderId.trim() : '';
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';

  try {
    const user = await getCurrentUser();

    if (user) {
      const supabase = await getSupabaseServer();
      const { data: orders, error } = await supabase
        .from('orders')
        .select('id, status, items, total_amount, created_at, tracking_number, courier_name, customer_email')
        .or(`user_id.eq.${user.id},customer_email.eq.${user.email}`)
        .order('created_at', { ascending: false })
        .limit(MAX_ORDERS);

      if (error) throw error;

      if (!orders || orders.length === 0) {
        return NextResponse.json({ ok: true, loggedIn: true, orders: [] });
      }

      // If they also gave a specific order id, narrow to that one.
      const cleanedId = rawOrderId.replace(/^#/, '').toUpperCase();
      const filtered = cleanedId
        ? orders.filter((o: any) => String(o.id).toUpperCase().startsWith(cleanedId))
        : orders;

      const target = filtered.length > 0 ? filtered : orders.slice(0, 1);
      const enriched = await Promise.all(target.slice(0, 3).map(withTracking));

      return NextResponse.json({ ok: true, loggedIn: true, orders: enriched });
    }

    // Guest path — must supply both order ID and the checkout email.
    if (!rawOrderId || !email) {
      return NextResponse.json({
        ok: true,
        loggedIn: false,
        needsDetails: true,
        message: 'Please log in, or share your Order ID and the email used at checkout so I can look it up.',
      });
    }

    const cleanedId = rawOrderId.replace(/^#/, '').toUpperCase();
    const supabase = getSupabaseAdmin();
    const { data: orders, error } = await supabase
      .from('orders')
      .select('id, status, items, total_amount, created_at, tracking_number, courier_name, customer_email')
      .eq('customer_email', email)
      .order('created_at', { ascending: false })
      .limit(30);

    if (error) throw error;

    const match = (orders || []).find((o: any) => String(o.id).toUpperCase().startsWith(cleanedId));

    if (!match) {
      return NextResponse.json({
        ok: true,
        loggedIn: false,
        orders: [],
        message: "I couldn't find an order with that Order ID and email combination. Please double-check both and try again, or continue on WhatsApp with our team.",
      });
    }

    const enriched = await withTracking(match);
    return NextResponse.json({ ok: true, loggedIn: false, orders: [enriched] });
  } catch (err) {
    console.error('[chat/order-lookup] error:', err);
    return NextResponse.json(
      { ok: false, error: 'Could not fetch order details right now. Please try again shortly.' },
      { status: 200 }
    );
  }
}
