import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAdminToken, ADMIN_SESSION_COOKIE } from '@/lib/admin-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

/**
 * GET /api/admin/product-vendors
 *
 * Lightweight lookup used by the Manage Products catalog to show which
 * vendor sourced each product, without touching the shared customer-facing
 * `useProducts()` fetch (which only returns live products and has no vendor
 * join). Returns only products that actually have a vendor_id — in-house
 * catalog items are simply absent from the map.
 */
export async function GET() {
  const cookie = cookies().get(ADMIN_SESSION_COOKIE)?.value ?? null;
  const verified = await verifyAdminToken(cookie);
  if (!verified.valid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('products')
      .select('id, vendor_id, vendors(id, business_name, owner_name)')
      .not('vendor_id', 'is', null);
    if (error) throw error;

    const rows = (data ?? []).map((p: any) => ({
      product_id: p.id as string,
      vendor_id: p.vendor_id as string,
      vendor_name:
        (p.vendors?.business_name as string | undefined) ||
        (p.vendors?.owner_name as string | undefined) ||
        'Vendor',
    }));

    return NextResponse.json({ rows });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load vendor info';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
