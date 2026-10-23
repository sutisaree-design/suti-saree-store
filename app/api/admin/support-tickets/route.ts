import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAdminToken, ADMIN_SESSION_COOKIE } from '@/lib/admin-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

// Support tickets raised by shoppers from the AI chat widget ("Raise a
// support ticket" action) or manually by the team. Lists newest first
// with a bit of order context attached, same pattern as /api/admin/returns.
export async function GET() {
  const cookie = cookies().get(ADMIN_SESSION_COOKIE)?.value ?? null;
  const verified = await verifyAdminToken(cookie);
  if (!verified.valid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();

  try {
    const { data: tickets, error } = await supabase
      .from('support_tickets')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;

    const orderIds = Array.from(
      new Set((tickets || []).map((t) => t.order_id).filter(Boolean))
    );
    let ordersById: Record<string, any> = {};
    if (orderIds.length > 0) {
      const { data: orders } = await supabase
        .from('orders')
        .select('id, customer_name, customer_email, status, total_amount')
        .in('id', orderIds);
      ordersById = Object.fromEntries((orders || []).map((o) => [o.id, o]));
    }

    const enriched = (tickets || []).map((t) => ({
      ...t,
      order: t.order_id ? ordersById[t.order_id] || null : null,
    }));

    return NextResponse.json({ tickets: enriched });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to load support tickets' }, { status: 500 });
  }
}
