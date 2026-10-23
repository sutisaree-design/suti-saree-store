import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAdminToken, ADMIN_SESSION_COOKIE } from '@/lib/admin-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

// SECURITY: wholesale tier create/update/delete used to go straight from
// the browser to Supabase using the anon key (lib/wholesale-api.ts via the
// plain anon `supabase` client), protected only by an RLS policy that
// allowed ANY anon/authenticated caller to insert/update/delete ANY
// wholesale price tier (`anon_write_wholesale_pricing`, `FOR ALL`,
// `USING (true) WITH CHECK (true)`) — a direct financial-manipulation risk
// (anyone could set a bulk unit_price to ₹1). Writes are now server-side
// only, gated by the same admin session cookie every other /api/admin/*
// route checks. Reads (wholesale_pricing SELECT) are unchanged — that
// policy was never flagged as a leak and stays as-is.

async function requireAdmin() {
  const cookie = cookies().get(ADMIN_SESSION_COOKIE)?.value ?? null;
  const verified = await verifyAdminToken(cookie);
  return verified.valid;
}

export async function POST(req: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const input = await req.json().catch(() => ({}));

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('wholesale_pricing').insert(input);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
