import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { mapRowToProduct, CUSTOMER_SAFE_PRODUCT_COLUMNS } from '@/lib/products-api-server';
import { ProductRow } from '@/lib/types';

// A vendor's public product list doesn't change minute-to-minute, so cache
// each response for 5 minutes to cut down repeated DB round-trips (product
// lookup + vendor lookup + product list) on every product-page view.
const CACHE_HEADERS = {
  'Cache-Control': 's-maxage=300, stale-while-revalidate=600',
};

/**
 * GET /api/vendor-collection/[productId]
 *
 * Public, unauthenticated. Used by the "<Vendor>'s Collection" carousel
 * on a product page: given the product being viewed, finds which vendor
 * listed it and returns that vendor's public name/slug plus their other
 * live, in-stock products (so shoppers can browse more from the same
 * vendor without navigating away).
 *
 * Runs entirely through the service-role client on the server -- the
 * raw `vendor_id` column never reaches the browser. Only vendors with
 * status = 'approved' are ever surfaced here (enforced by joining
 * against `vendor_public_profiles`, see the storefront migration).
 * If the product has no vendor, or the vendor isn't approved, this
 * returns `{ vendor: null, products: [] }` and the widget simply
 * doesn't render.
 */
export async function GET(
  _req: Request,
  { params }: { params: { productId: string } }
) {
  const admin = getSupabaseAdmin();

  try {
    const { data: product, error: productErr } = await admin
      .from('products')
      .select('vendor_id')
      .eq('id', params.productId)
      .maybeSingle();

    if (productErr || !product?.vendor_id) {
      return NextResponse.json({ vendor: null, products: [] }, { headers: CACHE_HEADERS });
    }

    const { data: vendor, error: vendorErr } = await admin
      .from('vendor_public_profiles')
      .select('id, business_name, storefront_slug')
      .eq('id', product.vendor_id)
      .maybeSingle();

    if (vendorErr || !vendor) {
      // Vendor not approved (or gone) -- nothing public to show.
      return NextResponse.json({ vendor: null, products: [] }, { headers: CACHE_HEADERS });
    }

    const { data: rows, error: rowsErr } = await admin
      .from('products')
      .select(CUSTOMER_SAFE_PRODUCT_COLUMNS)
      .eq('vendor_id', vendor.id)
      .eq('approval_status', 'live')
      .neq('id', params.productId)
      .order('created_at', { ascending: false })
      .limit(12);

    if (rowsErr) throw rowsErr;

    const products = ((rows ?? []) as unknown as ProductRow[]).map(mapRowToProduct);

    return NextResponse.json(
      {
        vendor: {
          id: vendor.id,
          name: vendor.business_name,
          slug: vendor.storefront_slug,
        },
        products,
      },
      { headers: CACHE_HEADERS }
    );
  } catch (err) {
    console.error('[vendor-collection] failed', params.productId, err);
    return NextResponse.json({ vendor: null, products: [] });
  }
}
