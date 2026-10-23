import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/supabase-server-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

async function getAffiliateProfile(supabase: ReturnType<typeof getSupabaseAdmin>, userId: string) {
  const { data, error } = await supabase
    .from('affiliates')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// GET — orders referred by this affiliate (someone placed an order after
// landing on the site via their ?aff=CODE link). Mirrors
// app/api/reseller/orders/route.ts's GET.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Please log in first' }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();

  try {
    const profile = await getAffiliateProfile(supabase, user.id);
    if (!profile) {
      return NextResponse.json({ orders: [] });
    }

    const { data: orders, error } = await supabase
      .from('orders')
      .select('id, total_amount, status, affiliate_commission_amount, affiliate_payout_status, created_at')
      .eq('affiliate_id', profile.id)
      .order('created_at', { ascending: false });
    if (error) throw error;

    const rows = (orders ?? []).map((o) => ({
      id: o.id,
      createdAt: o.created_at,
      totalAmount: o.total_amount,
      status: o.status,
      commissionAmount: o.affiliate_commission_amount,
      commissionStatus: o.affiliate_payout_status,
    }));

    return NextResponse.json({ orders: rows });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load referred orders';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
