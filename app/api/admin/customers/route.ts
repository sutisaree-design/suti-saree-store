import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAdminToken, ADMIN_SESSION_COOKIE } from '@/lib/admin-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

const REVENUE_STATUSES = ['paid', 'shipped', 'delivered'];

export async function GET() {
  const cookie = cookies().get(ADMIN_SESSION_COOKIE)?.value ?? null;
  const verified = await verifyAdminToken(cookie);
  if (!verified.valid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = getSupabaseAdmin();

    const { data: orders, error: ordersErr } = await supabase
      .from('orders')
      .select(
        'id, items, total_amount, status, customer_name, customer_email, customer_phone, user_id, session_id, created_at'
      )
      .order('created_at', { ascending: false });
    if (ordersErr) throw ordersErr;

    type CustomerAgg = {
      key: string;
      name: string;
      email: string | null;
      phone: string | null;
      userId: string | null;
      sessionIds: Set<string>;
      orderCount: number;
      totalSpent: number;
      lastOrderAt: string;
      lastOrderItems: any[];
      orders: { id: string; total_amount: number; status: string; created_at: string; items: any[] }[];
    };

    const customers = new Map<string, CustomerAgg>();

    for (const o of orders ?? []) {
      const email = (o.customer_email || '').trim().toLowerCase() || null;
      const phone = (o.customer_phone || '').trim() || null;
      const key = o.user_id || email || phone || o.id; // fall back to order id (no identity at all)

      const existing = customers.get(key);
      const isRevenue = REVENUE_STATUSES.includes(o.status);
      if (existing) {
        existing.orderCount += 1;
        if (isRevenue) existing.totalSpent += o.total_amount || 0;
        if (o.session_id) existing.sessionIds.add(o.session_id);
        if (new Date(o.created_at) > new Date(existing.lastOrderAt)) {
          existing.lastOrderAt = o.created_at;
          existing.lastOrderItems = o.items;
        }
        existing.orders.push({
          id: o.id,
          total_amount: o.total_amount,
          status: o.status,
          created_at: o.created_at,
          items: o.items,
        });
      } else {
        customers.set(key, {
          key,
          name: o.customer_name || 'Guest',
          email,
          phone,
          userId: o.user_id ?? null,
          sessionIds: new Set(o.session_id ? [o.session_id] : []),
          orderCount: 1,
          totalSpent: isRevenue ? o.total_amount || 0 : 0,
          lastOrderAt: o.created_at,
          lastOrderItems: o.items,
          orders: [
            { id: o.id, total_amount: o.total_amount, status: o.status, created_at: o.created_at, items: o.items },
          ],
        });
      }
    }

    // ---------------- Pull browsing behaviour for these customers ----------------
    const allSessionIds = Array.from(new Set(Array.from(customers.values()).flatMap((c) => Array.from(c.sessionIds))));
    const allUserIds = Array.from(
      new Set(Array.from(customers.values()).map((c) => c.userId).filter(Boolean))
    ) as string[];

    let events: any[] = [];
    if (allSessionIds.length > 0 || allUserIds.length > 0) {
      const orFilters: string[] = [];
      if (allSessionIds.length > 0) orFilters.push(`session_id.in.(${allSessionIds.map((s) => `"${s}"`).join(',')})`);
      if (allUserIds.length > 0) orFilters.push(`user_id.in.(${allUserIds.join(',')})`);
      const { data, error } = await supabase
        .from('activity_events')
        .select('session_id, user_id, event_type, page_path, product_id, created_at')
        .or(orFilters.join(','))
        .order('created_at', { ascending: false })
        .limit(2000);
      if (error) throw error;
      events = data ?? [];
    }

    const result = Array.from(customers.values())
      .map((c) => {
        const relatedEvents = events.filter(
          (e) => (c.userId && e.user_id === c.userId) || c.sessionIds.has(e.session_id)
        );
        const pagesVisited = Array.from(
          new Set(relatedEvents.filter((e) => e.event_type === 'page_view').map((e) => e.page_path))
        ).slice(0, 25);
        const productsViewed = relatedEvents.filter((e) => e.event_type === 'product_view').length;
        const addedToCart = relatedEvents.some((e) => e.event_type === 'add_to_cart');
        const startedCheckout = relatedEvents.some((e) => e.event_type === 'checkout_start');

        return {
          id: c.key,
          name: c.name,
          email: c.email,
          phone: c.phone,
          isRegistered: !!c.userId,
          orderCount: c.orderCount,
          totalSpent: c.totalSpent,
          lastOrderAt: c.lastOrderAt,
          lastOrderItems: c.lastOrderItems,
          orders: c.orders.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
          behavior: {
            pagesVisited,
            pagesVisitedCount: pagesVisited.length,
            productsViewed,
            addedToCart,
            startedCheckout,
            converted: c.orderCount > 0,
          },
        };
      })
      .sort((a, b) => b.totalSpent - a.totalSpent);

    return NextResponse.json({ customers: result });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to load customers' }, { status: 500 });
  }
}
