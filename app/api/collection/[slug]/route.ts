import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { mapRowToProduct, CUSTOMER_SAFE_PRODUCT_COLUMNS } from '@/lib/products-api-server';
import { ProductRow } from '@/lib/types';

// No cookies()/headers()/searchParams here, so without this Next's App
// Router would cache this route's response indefinitely after the first
// hit post-deploy — an admin adding/removing a product from a collection
// (or flipping is_active) wouldn't show up here until the next deploy.
// Same reasoning as /api/promotions/active.
export const dynamic = 'force-dynamic';

/** Weighted rating/review total across a set of products, computed from the
 *  live `reviews` table (approved only) -- the same source the single-
 *  product page uses. A product with no live approved reviews yet falls
 *  back to its admin-set seed rating/reviews (same rule the product page
 *  uses), so freshly-seeded products still contribute. */
async function computeRatingSummary(
  admin: ReturnType<typeof getSupabaseAdmin>,
  productRows: ProductRow[]
): Promise<{ rating: number | null; reviewCount: number | null }> {
  if (productRows.length === 0) return { rating: null, reviewCount: null };

  const productIds = productRows.map((p) => p.id);
  const { data: liveReviews, error: reviewsErr } = await admin
    .from('reviews')
    .select('product_id, rating')
    .in('product_id', productIds)
    .eq('is_approved', true);

  if (reviewsErr) throw reviewsErr;

  const liveByProduct = new Map<string, { count: number; sum: number }>();
  for (const r of liveReviews ?? []) {
    const entry = liveByProduct.get(r.product_id) ?? { count: 0, sum: 0 };
    entry.count += 1;
    entry.sum += Number(r.rating) || 0;
    liveByProduct.set(r.product_id, entry);
  }

  let totalCount = 0;
  let weightedSum = 0;
  for (const p of productRows) {
    const live = liveByProduct.get(p.id);
    if (live && live.count > 0) {
      totalCount += live.count;
      weightedSum += live.sum;
    } else if ((p.reviews ?? 0) > 0) {
      totalCount += p.reviews ?? 0;
      weightedSum += (p.rating ?? 0) * (p.reviews ?? 0);
    }
  }

  return {
    reviewCount: totalCount,
    rating: totalCount > 0 ? weightedSum / totalCount : null,
  };
}

/**
 * GET /api/collection/[slug]
 *
 * Public collection page, backing /collection/[slug]. Two kinds of
 * collection share this one URL space (checked in this order):
 *
 *  1. A vendor's auto-generated collection -- their live products, keyed
 *     by `vendors.storefront_slug` (see the storefront migration). The
 *     rating summary here respects the vendor's `show_public_rating`
 *     toggle (Admin > Vendors) -- off means no rating block at all.
 *
 *  2. An admin-curated collection -- a hand-picked set of products keyed
 *     by `collections.slug` (see the admin-collections migration),
 *     managed from Admin > Collections. Inactive ones 404 just like a
 *     missing vendor slug. These always show their rating summary (no
 *     per-collection toggle -- there's no vendor to hide it on behalf
 *     of), computed the same way.
 *
 * Both branches compute their rating/review total from the live
 * `reviews` table (approved only), NOT the `products.rating` /
 * `products.reviews` columns, which are just admin-set seed numbers that
 * go stale once a product has real reviews.
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

    if (vendorErr) throw vendorErr;

    if (vendor) {
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
        ({ rating, reviewCount } = await computeRatingSummary(admin, productRows));
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
    }

    // Not a vendor slug -- try an admin-curated collection instead.
    const { data: collection, error: collectionErr } = await admin
      .from('collections')
      .select('id, name, slug, is_active, created_at')
      .eq('slug', params.slug)
      .eq('is_active', true)
      .maybeSingle();

    if (collectionErr) throw collectionErr;
    if (!collection) {
      return NextResponse.json({ vendor: null }, { status: 404 });
    }

    const { data: links, error: linksErr } = await admin
      .from('collection_products')
      .select('product_id')
      .eq('collection_id', collection.id)
      .order('position', { ascending: true });

    if (linksErr) throw linksErr;

    const orderedIds = (links ?? []).map((l) => l.product_id);
    if (orderedIds.length === 0) {
      return NextResponse.json({
        vendor: { id: collection.id, name: collection.name, slug: collection.slug, since: collection.created_at },
        showRating: false,
        rating: null,
        reviewCount: null,
        products: [],
      });
    }

    const { data: rows, error: rowsErr } = await admin
      .from('products')
      .select(CUSTOMER_SAFE_PRODUCT_COLUMNS)
      .in('id', orderedIds)
      .eq('approval_status', 'live');

    if (rowsErr) throw rowsErr;

    const rowsById = new Map(((rows ?? []) as unknown as ProductRow[]).map((r) => [r.id, r]));
    const productRows = orderedIds.map((id) => rowsById.get(id)).filter((r): r is ProductRow => !!r);
    const products = productRows.map(mapRowToProduct);

    const { rating, reviewCount } = await computeRatingSummary(admin, productRows);

    return NextResponse.json({
      vendor: {
        id: collection.id,
        name: collection.name,
        slug: collection.slug,
        since: collection.created_at,
      },
      showRating: true,
      rating,
      reviewCount,
      products,
    });
  } catch (err) {
    console.error('[collection]', params.slug, 'failed', err);
    return NextResponse.json({ vendor: null }, { status: 500 });
  }
}
