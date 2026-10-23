import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAdminToken, ADMIN_SESSION_COOKIE } from '@/lib/admin-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { DEFAULT_LOYALTY_SETTINGS, type LoyaltySettings } from '@/lib/loyalty-api';

async function requireAdmin() {
  const cookie = cookies().get(ADMIN_SESSION_COOKIE)?.value ?? null;
  const verified = await verifyAdminToken(cookie);
  return verified.valid;
}

// GET — settings + every customer who has ever earned/redeemed/been
// adjusted a point, with name/email resolved from their most recent
// order (profiles has no email column; orders already captures it).
export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();

  try {
    const { data: settingsRow } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'loyalty_program')
      .maybeSingle();
    const settings: LoyaltySettings = {
      ...DEFAULT_LOYALTY_SETTINGS,
      ...((settingsRow?.value as Partial<LoyaltySettings>) ?? {}),
    };

    const { data: ledger, error: ledgerErr } = await supabase
      .from('loyalty_points_ledger')
      .select('user_id, points, type')
      .order('created_at', { ascending: false });
    if (ledgerErr) throw ledgerErr;

    const userIds = Array.from(new Set((ledger ?? []).map((l) => l.user_id)));

    // Also include customers who are registered but haven't earned yet,
    // so an admin can still find them to give a manual bonus.
    const { data: profiles, error: profilesErr } = await supabase
      .from('profiles')
      .select('id, full_name, loyalty_balance')
      .order('loyalty_balance', { ascending: false });
    if (profilesErr) throw profilesErr;

    for (const p of profiles ?? []) {
      if (!userIds.includes(p.id)) userIds.push(p.id);
    }

    // Resolve email/name per user from their most recent order.
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

    const balanceByUser = new Map((profiles ?? []).map((p) => [p.id, p.loyalty_balance ?? 0]));
    const nameByUser = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));

    const totals = new Map<string, { earned: number; redeemed: number }>();
    for (const l of ledger ?? []) {
      const t = totals.get(l.user_id) ?? { earned: 0, redeemed: 0 };
      if (l.points > 0) t.earned += l.points;
      else t.redeemed += Math.abs(l.points);
      totals.set(l.user_id, t);
    }

    const customers = userIds.map((userId) => {
      const contact = contactByUser.get(userId);
      const t = totals.get(userId) ?? { earned: 0, redeemed: 0 };
      return {
        userId,
        name: contact?.name || nameByUser.get(userId) || 'Customer',
        email: contact?.email ?? null,
        balance: balanceByUser.get(userId) ?? 0,
        totalEarned: t.earned,
        totalRedeemed: t.redeemed,
      };
    });

    customers.sort((a, b) => b.balance - a.balance);

    return NextResponse.json({ settings, customers });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load loyalty data';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// PUT — save loyalty program settings (rates, min redeem, on/off)
export async function PUT(req: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const settings = body?.settings as LoyaltySettings | undefined;
  if (!settings) {
    return NextResponse.json({ error: 'Missing settings' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  try {
    const { error } = await supabase
      .from('settings')
      .upsert({ key: 'loyalty_program', value: settings }, { onConflict: 'key' });
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save settings';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST — manual points adjustment (bonus / correction) by an admin
export async function POST(req: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { userId, points, reason } = body || {};

  if (!userId || typeof points !== 'number' || points === 0) {
    return NextResponse.json({ error: 'userId and a non-zero points value are required' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  try {
    const { error } = await supabase.from('loyalty_points_ledger').insert({
      user_id: userId,
      points,
      type: 'adjust',
      reason: reason || 'Manual admin adjustment',
    });
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to adjust points';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
