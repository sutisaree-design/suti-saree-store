import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAdminToken, ADMIN_SESSION_COOKIE } from '@/lib/admin-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

async function requireAdmin() {
  const cookie = cookies().get(ADMIN_SESSION_COOKIE)?.value ?? null;
  const verified = await verifyAdminToken(cookie);
  return verified.valid;
}

// PATCH — full edit, or a partial toggle (is_active / show_on_product_page)
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const update: Record<string, unknown> = {};

  if (body.code !== undefined) update.code = String(body.code).trim().toUpperCase();
  if (body.discount_type !== undefined) update.discount_type = body.discount_type;
  if (body.discount_value !== undefined) update.discount_value = body.discount_value;
  if (body.min_order_value !== undefined) update.min_order_value = body.min_order_value;
  if (body.usage_limit !== undefined) update.usage_limit = body.usage_limit;
  if (body.expires_at !== undefined) update.expires_at = body.expires_at;
  if (body.is_active !== undefined) update.is_active = body.is_active;
  if (body.show_on_product_page !== undefined) update.show_on_product_page = body.show_on_product_page;
  if (body.show_in_google_promotions !== undefined) update.show_in_google_promotions = body.show_in_google_promotions;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  try {
    const { error } = await supabase.from('coupons').update(update).eq('id', params.id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update coupon';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  try {
    const { error } = await supabase.from('coupons').delete().eq('id', params.id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to delete coupon';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
