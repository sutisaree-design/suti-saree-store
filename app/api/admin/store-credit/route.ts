import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAdminToken, ADMIN_SESSION_COOKIE } from '@/lib/admin-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

async function requireAdmin() {
  const cookie = cookies().get(ADMIN_SESSION_COOKIE)?.value ?? null;
  const verified = await verifyAdminToken(cookie);
  return verified.valid;
}

// GET — every customer with a non-zero store credit row, for the
// Admin > Store Credit tab, plus the total outstanding liability.
export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();

  try {
    const { data: credits, error } = await supabase
      .from('store_credits')
      .select('user_id, balance, updated_at')
      .order('updated_at', { ascending: false });
    if (error) throw error;

    const rows = credits ?? [];
    const totalOutstanding = rows.reduce((sum, r) => sum + (Number(r.balance) || 0), 0);

    // Balances live keyed by auth user id — resolve emails for display.
    const { data: userList } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    const emailById = new Map((userList?.users ?? []).map((u) => [u.id, u.email ?? null]));

    const customers = rows.map((r) => ({
      user_id: r.user_id as string,
      email: emailById.get(r.user_id as string) ?? null,
      balance: Number(r.balance) || 0,
      updated_at: r.updated_at as string,
    }));

    return NextResponse.json({ totalOutstanding, customers });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to load store credit data' }, { status: 500 });
  }
}

// POST — issue or adjust a customer's balance by email. Positive amount
// credits (refund / goodwill), negative amount debits (correction).
// Upserts the store_credits row and always appends a ledger entry so
// the change is auditable, same shape as loyalty's adjust flow.
export async function POST(req: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  const amount = typeof body?.amount === 'number' ? Math.round(body.amount * 100) / 100 : 0;
  const reason = typeof body?.reason === 'string' ? body.reason : null;

  if (!email) {
    return NextResponse.json({ error: 'Customer email is required' }, { status: 400 });
  }
  if (!amount) {
    return NextResponse.json({ error: 'A non-zero amount is required' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  try {
    const { data: userList } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    const match = userList?.users.find((u) => u.email?.toLowerCase() === email);
    if (!match) {
      return NextResponse.json({ error: 'No customer account found with that email' }, { status: 404 });
    }

    const { data: existing } = await supabase
      .from('store_credits')
      .select('balance')
      .eq('user_id', match.id)
      .maybeSingle();

    const currentBalance = Number(existing?.balance) || 0;
    const newBalance = Math.max(0, Math.round((currentBalance + amount) * 100) / 100);

    const { error: upsertErr } = await supabase
      .from('store_credits')
      .upsert({ user_id: match.id, balance: newBalance, updated_at: new Date().toISOString() });
    if (upsertErr) throw upsertErr;

    await supabase.from('store_credit_ledger').insert({
      user_id: match.id,
      amount,
      type: amount > 0 ? 'issue' : 'adjust',
      reason,
    });

    return NextResponse.json({ ok: true, balance: newBalance });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to update store credit' }, { status: 500 });
  }
}
