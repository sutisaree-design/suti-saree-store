import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAdminToken, ADMIN_SESSION_COOKIE } from '@/lib/admin-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

async function requireAdmin() {
  const cookie = cookies().get(ADMIN_SESSION_COOKIE)?.value ?? null;
  const verified = await verifyAdminToken(cookie);
  return verified.valid;
}

// GET — every reseller with their order/earnings totals, resolved contact
// info via their most recent order (same trick used by /api/admin/loyalty
// and /api/admin/referrals, since `profiles` has no email column).
export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();

  try {
    const { data: resellers, error } = await supabase
      .from('reseller_profiles')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;

    const userIds = (resellers ?? []).map((r) => r.user_id);
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, phone')
      .in('id', userIds.length ? userIds : ['00000000-0000-0000-0000-000000000000']);
    const profileByUser = new Map((profiles ?? []).map((p) => [p.id, p]));

    const { data: orders, error: ordersErr } = await supabase
      .from('orders')
      .select('reseller_id, user_id, customer_email, total_amount, reseller_profit, status, created_at')
      .not('reseller_id', 'is', null);
    if (ordersErr) throw ordersErr;

    const emailByUser = new Map<string, string>();
    for (const o of orders ?? []) {
      if (o.user_id && !emailByUser.has(o.user_id) && o.customer_email) {
        emailByUser.set(o.user_id, o.customer_email);
      }
    }

    const rows = (resellers ?? []).map((r) => {
      const myOrders = (orders ?? []).filter((o) => o.reseller_id === r.id);
      const totalOrders = myOrders.length;
      const totalSales = myOrders.reduce((s, o) => s + (o.total_amount || 0), 0);
      const totalProfit = myOrders.reduce((s, o) => s + (o.reseller_profit || 0), 0);
      const profile = profileByUser.get(r.user_id);
      return {
        id: r.id,
        userId: r.user_id,
        name: profile?.full_name || 'Reseller',
        email: emailByUser.get(r.user_id) || null,
        phone: profile?.phone || null,
        status: r.status,
        defaultMarkupAmount: r.default_markup_amount,
        createdAt: r.created_at,
        totalOrders,
        totalSales,
        totalProfit,
      };
    });

    return NextResponse.json({
      resellers: rows,
      totalResellers: rows.length,
      totalOrders: rows.reduce((s, r) => s + r.totalOrders, 0),
      totalSales: rows.reduce((s, r) => s + r.totalSales, 0),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load resellers';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// PUT — suspend/reactivate a reseller (admin control).
export async function PUT(req: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const id = body?.id as string | undefined;
  const status = body?.status as string | undefined;
  if (!id || !status || !['active', 'suspended'].includes(status)) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  try {
    const { error } = await supabase
      .from('reseller_profiles')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update reseller';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
