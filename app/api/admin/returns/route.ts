import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAdminToken, ADMIN_SESSION_COOKIE } from '@/lib/admin-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { getReturnRiskForPhones } from '@/lib/return-risk-api';

export async function GET() {
  const cookie = cookies().get(ADMIN_SESSION_COOKIE)?.value ?? null;
  const verified = await verifyAdminToken(cookie);
  if (!verified.valid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();

  try {
    const { data: returns, error } = await supabase
      .from('returns')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;

    // Attach a bit of order context (customer + total) so the admin panel
    // doesn't need a second round trip per row.
    const orderIds = Array.from(new Set((returns || []).map((r) => r.order_id)));
    let ordersById: Record<string, any> = {};
    if (orderIds.length > 0) {
      const { data: orders } = await supabase
        .from('orders')
        .select('id, customer_name, customer_email, customer_phone, total_amount, items, payment_method')
        .in('id', orderIds);
      ordersById = Object.fromEntries((orders || []).map((o) => [o.id, o]));
    }

    // Return/RTO risk per customer phone — powers the "2 returns -> 15
    // day COD cooldown" badge on each return card (see
    // lib/return-risk-api.ts for the rule).
    const phones = Object.values(ordersById)
      .map((o: any) => o.customer_phone)
      .filter((p): p is string => !!p);
    const riskByPhone = await getReturnRiskForPhones(supabase, phones);

    const enriched = (returns || []).map((r) => {
      const order = ordersById[r.order_id] || null;
      const risk = order?.customer_phone ? riskByPhone[order.customer_phone] || null : null;
      return { ...r, order, return_risk: risk };
    });

    return NextResponse.json({ returns: enriched });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to load returns' }, { status: 500 });
  }
}
