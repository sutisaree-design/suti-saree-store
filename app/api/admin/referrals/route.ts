import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAdminToken, ADMIN_SESSION_COOKIE } from '@/lib/admin-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { DEFAULT_REFERRAL_SETTINGS, type ReferralSettings } from '@/lib/referrals-api';

async function requireAdmin() {
  const cookie = cookies().get(ADMIN_SESSION_COOKIE)?.value ?? null;
  const verified = await verifyAdminToken(cookie);
  return verified.valid;
}

// GET — settings + every referral row, with referrer/referred name+email
// resolved from their most recent order (profiles has no email column;
// orders already captures it) — same resolution trick as /api/admin/loyalty.
export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();

  try {
    const { data: settingsRow } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'referral_program')
      .maybeSingle();
    const settings: ReferralSettings = {
      ...DEFAULT_REFERRAL_SETTINGS,
      ...((settingsRow?.value as Partial<ReferralSettings>) ?? {}),
    };

    const { data: referrals, error: referralsErr } = await supabase
      .from('referrals')
      .select(
        'id, referrer_user_id, referred_user_id, code, status, referrer_reward_points, referred_reward_points, created_at, completed_at'
      )
      .order('created_at', { ascending: false });
    if (referralsErr) throw referralsErr;

    const userIds = Array.from(
      new Set((referrals ?? []).flatMap((r) => [r.referrer_user_id, r.referred_user_id]))
    );

    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', userIds.length ? userIds : ['00000000-0000-0000-0000-000000000000']);
    const nameByUser = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));

    const { data: orders } = await supabase
      .from('orders')
      .select('user_id, customer_name, customer_email, created_at')
      .in('user_id', userIds.length ? userIds : ['00000000-0000-0000-0000-000000000000'])
      .order('created_at', { ascending: false });

    const contactByUser = new Map<string, { name: string; email: string | null }>();
    for (const o of orders ?? []) {
      if (!o.user_id || contactByUser.has(o.user_id)) continue;
      contactByUser.set(o.user_id, { name: o.customer_name || 'Customer', email: o.customer_email ?? null });
    }

    const resolve = (userId: string) => {
      const contact = contactByUser.get(userId);
      return {
        name: contact?.name || nameByUser.get(userId) || 'Customer',
        email: contact?.email ?? null,
      };
    };

    const rows = (referrals ?? []).map((r) => {
      const referrer = resolve(r.referrer_user_id);
      const referred = resolve(r.referred_user_id);
      return {
        id: r.id,
        referrerName: referrer.name,
        referrerEmail: referrer.email,
        referredName: referred.name,
        referredEmail: referred.email,
        code: r.code,
        status: r.status,
        referrerRewardPoints: r.referrer_reward_points,
        referredRewardPoints: r.referred_reward_points,
        createdAt: r.created_at,
        completedAt: r.completed_at,
      };
    });

    const totalReferrers = new Set((referrals ?? []).map((r) => r.referrer_user_id)).size;
    const totalCompleted = (referrals ?? []).filter((r) => r.status === 'completed').length;
    const totalPending = (referrals ?? []).filter((r) => r.status === 'pending').length;

    return NextResponse.json({ settings, referrals: rows, totalReferrers, totalCompleted, totalPending });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load referral data';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// PUT — save referral program settings (reward amounts, on/off)
export async function PUT(req: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const settings = body?.settings as ReferralSettings | undefined;
  if (!settings) {
    return NextResponse.json({ error: 'Missing settings' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  try {
    const { error } = await supabase
      .from('settings')
      .upsert({ key: 'referral_program', value: settings }, { onConflict: 'key' });
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save settings';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
