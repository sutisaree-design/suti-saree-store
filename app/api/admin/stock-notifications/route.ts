import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAdminToken, ADMIN_SESSION_COOKIE } from '@/lib/admin-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

// SECURITY: stock_notifications had `anon_select_stock_notifications` /
// `anon_delete_stock_notifications` policies (USING (true)) — any
// visitor with the public anon key could read every customer's email
// (who's waiting for which out-of-stock product) or mass-delete every
// signup so those customers never get notified. Listing/deleting is
// now server-side only. The public "notify me" upsert (INSERT/UPDATE
// by the customer's own product_id+email pair) is left untouched.

async function requireAdmin() {
  const cookie = cookies().get(ADMIN_SESSION_COOKIE)?.value ?? null;
  const verified = await verifyAdminToken(cookie);
  return verified.valid;
}

export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  try {
    const { data, error } = await supabase
      .from('stock_notifications')
      .select('*, products(name, slug, in_stock, images, colors)')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return NextResponse.json({ notifications: data ?? [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load notifications';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
