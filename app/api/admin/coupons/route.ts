import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAdminToken, ADMIN_SESSION_COOKIE } from '@/lib/admin-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

// SECURITY: coupon creation/edits used to go straight from the browser
// to Supabase using the anon key, protected only by an RLS policy that
// allowed ANY anon/authenticated caller to write to `coupons`
// (`anon_write_coupons ... USING (true) WITH CHECK (true)`). That meant
// anyone could open the browser console and create their own 100%-off
// coupon. Writes are now server-side only, gated by the same admin
// session cookie every other /api/admin/* route already checks.

async function requireAdmin() {
  const cookie = cookies().get(ADMIN_SESSION_COOKIE)?.value ?? null;
  const verified = await verifyAdminToken(cookie);
  return verified.valid;
}

// GET — list all coupons (admin panel table)
export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  try {
    const { data, error } = await supabase
      .from('coupons')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return NextResponse.json({ coupons: data ?? [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load coupons';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST — create a new coupon
export async function POST(req: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const {
    code,
    discount_type,
    discount_value,
    min_order_value,
    usage_limit,
    expires_at,
    is_active,
    show_on_product_page,
    show_in_google_promotions,
  } = body || {};

  if (!code || !discount_type || discount_value == null) {
    return NextResponse.json({ error: 'code, discount_type and discount_value are required' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  try {
    const { error } = await supabase.from('coupons').insert({
      code: String(code).trim().toUpperCase(),
      discount_type,
      discount_value,
      min_order_value: min_order_value ?? 0,
      usage_limit: usage_limit ?? null,
      expires_at: expires_at ?? null,
      is_active: is_active ?? true,
      show_on_product_page: show_on_product_page ?? false,
      show_in_google_promotions: show_in_google_promotions ?? false,
    });
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create coupon';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
