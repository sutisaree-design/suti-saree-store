import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { mapRowToProduct, CUSTOMER_SAFE_PRODUCT_COLUMNS } from '@/lib/products-api-server';
import { ProductRow } from '@/lib/types';

/**
 * GET /api/store/[slug]
 *
 * Public storefront for one vendor: /store/[slug] renders this. Reads
 * only from `vendor_public_profiles` (approved vendors, safe columns
 * only -- see the storefront migration) plus each of the vendor's live
 * products.
 *
 * The aggregate rating/review count is computed as a reviews-weighted
 * average across the vendor's own products (each product already
 * carries its own `rating`/`reviews` aggregate, so this reuses those
 * rather than re-scanning the raw `reviews` table). It's only included
 * in the response when the vendor's `show_public_rating` toggle
 * (Admin > Vendors) is on -- when it's off, `rating`/`reviewCount` come
 * back null and the page shows the plain product listing with no
 * rating summary block.
 */
export async function GET(
  _req: Request,
  { params }: { params: { slug: string } }
) {
  const admin = getSupabaseAdmin();

  try {
    const { data: vendor, error: vendorErr } = await admin
      .from('vendor_public_profiles')
      .select('id, business_name, storefront_slug, show_public_rating, created_at')
      .eq('storefront_slug', params.slug)
      .maybeSingle();

    if (vendorErr || !vendor) {
      return NextResponse.json({ vendor: null }, { status: 404 });
    }

    const { data: rows, error: rowsErr } = await admin
      .from('products')
      .select(CUSTOMER_SAFE_PRODUCT_COLUMNS)
      .eq('vendor_id', vendor.id)
      .eq('approval_status', 'live')
      .order('created_at', { ascending: false });

    if (rowsErr) throw rowsErr;

    const productRows = (rows ?? []) as unknown as ProductRow[];
    const products = productRows.map(mapRowToProduct);

    let rating: number | null = null;
    let reviewCount: number | null = null;
    if (vendor.show_public_rating) {
      const totalReviews = productRows.reduce((sum, p) => sum + (p.reviews ?? 0), 0);
      reviewCount = totalReviews;
      rating =
        totalReviews > 0
          ? productRows.reduce((sum, p) => sum + (p.rating ?? 0) * (p.reviews ?? 0), 0) / totalReviews
          : null;
    }

    return NextResponse.json({
      vendor: {
        id: vendor.id,
        name: vendor.business_name,
        slug: vendor.storefront_slug,
        since: vendor.created_at,
      },
      showRating: vendor.show_public_rating,
      rating,
      reviewCount,
      products,
    });
  } catch (err) {
    console.error('[store]', params.slug, 'failed', err);
    return NextResponse.json({ vendor: null }, { status: 500 });
  }
}
