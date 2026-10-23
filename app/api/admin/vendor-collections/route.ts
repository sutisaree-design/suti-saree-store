import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAdminToken, ADMIN_SESSION_COOKIE } from '@/lib/admin-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

async function requireAdmin() {
  const cookie = cookies().get(ADMIN_SESSION_COOKIE)?.value ?? null;
  const verified = await verifyAdminToken(cookie);
  return verified.valid;
}

/**
 * GET — every approved vendor's automatic "<Vendor>'s Collection" page
 * (see the vendor-public-storefront migration), with a live product
 * count each. Unlike /api/admin/collections (admin-curated groups, which
 * can be created/edited/deleted here), these are read-only from this
 * panel — they're derived straight from an approved vendor + their live
 * products, and are only ever managed by approving/suspending the vendor
 * itself on Admin > Vendors.
 */
export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = getSupabaseAdmin();

  try {
    const { data: vendors, error } = await admin
      .from('vendors')
      .select('id, business_name, storefront_slug, status, created_at')
      .eq('status', 'approved')
      .not('storefront_slug', 'is', null)
      .order('created_at', { ascending: false });
    if (error) throw error;

    const vendorIds = (vendors ?? []).map((v) => v.id);
    const countByVendor = new Map<string, number>();
    if (vendorIds.length > 0) {
      const { data: productRows, error: productsErr } = await admin
        .from('products')
        .select('vendor_id')
        .in('vendor_id', vendorIds)
        .eq('approval_status', 'live');
      if (productsErr) throw productsErr;
      for (const row of productRows ?? []) {
        countByVendor.set(row.vendor_id, (countByVendor.get(row.vendor_id) ?? 0) + 1);
      }
    }

    const collections = (vendors ?? []).map((v) => ({
      id: v.id,
      name: `${v.business_name}'s Collection`,
      slug: v.storefront_slug as string,
      product_count: countByVendor.get(v.id) ?? 0,
      created_at: v.created_at,
    }));

    return NextResponse.json({ collections });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load vendor collections';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
