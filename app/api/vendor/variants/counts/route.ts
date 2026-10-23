import { NextResponse } from 'next/server';
import { getCurrentUser, getSupabaseServer } from '@/lib/supabase-server-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

/**
 * GET /api/vendor/variants/counts
 *
 * Returns { counts: { [product_id]: number } } — the number of colour
 * variants each of the calling vendor's own products has. Used by the
 * vendor Products list to show a "3 variations" badge and decide whether
 * the expand arrow has anything to show, without a separate request per
 * product.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Please log in first' }, { status: 401 });

  const supabase = await getSupabaseServer();
  const { data: vendor, error: vendorErr } = await supabase
    .from('vendors')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (vendorErr || !vendor) {
    return NextResponse.json({ error: 'No vendor profile found for this account' }, { status: 403 });
  }

  const admin = getSupabaseAdmin();

  const { data: myProducts, error: prodErr } = await admin
    .from('products')
    .select('id')
    .eq('vendor_id', vendor.id);
  if (prodErr) return NextResponse.json({ error: prodErr.message }, { status: 500 });

  const productIds = (myProducts ?? []).map((p) => p.id);
  if (productIds.length === 0) return NextResponse.json({ counts: {} });

  const { data: variants, error: varErr } = await admin
    .from('product_variants')
    .select('product_id')
    .in('product_id', productIds);
  if (varErr) return NextResponse.json({ error: varErr.message }, { status: 500 });

  const counts: Record<string, number> = {};
  for (const v of variants ?? []) {
    counts[v.product_id] = (counts[v.product_id] ?? 0) + 1;
  }

  return NextResponse.json({ counts });
}
