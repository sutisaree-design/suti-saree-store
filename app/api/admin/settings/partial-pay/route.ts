import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAdminToken, ADMIN_SESSION_COOKIE } from '@/lib/admin-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { normalizePartialPay } from '@/lib/partial-pay';

// The advance a customer pays is derived from this row, so it must only be writable by the
// admin (service role) -- never with the public anon key. See migration 20261024000000.

async function requireAdmin() {
  const cookie = cookies().get(ADMIN_SESSION_COOKIE)?.value ?? null;
  const verified = await verifyAdminToken(cookie);
  return verified.valid;
}

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data, error } = await getSupabaseAdmin()
    .from('settings')
    .select('value')
    .eq('key', 'partial_pay')
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ settings: normalizePartialPay(data?.value as any) });
}

export async function PUT(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Invalid body' }, { status: 400 });

  const percent = Number((body as any).percent);
  if (!Number.isFinite(percent) || percent < 1 || percent > 99) {
    return NextResponse.json({ error: 'Advance % must be between 1 and 99.' }, { status: 400 });
  }
  const settings = normalizePartialPay(body as any);
  if (settings.max_order_value > 0 && settings.max_order_value < settings.min_order_value) {
    return NextResponse.json({ error: 'Maximum order value cannot be lower than the minimum.' }, { status: 400 });
  }

  const { error } = await getSupabaseAdmin()
    .from('settings')
    .upsert({ key: 'partial_pay', value: settings }, { onConflict: 'key' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, settings });
}
