import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { getServerSupabase } from '@/lib/supabase-server';
import { fetchProductsServer } from '@/lib/products-api-server';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.aruhihandlooms.com';

// Google Merchant Center "Product reviews" feed (XML, schema v2.3).
//
// Add this URL in Merchant Center -> Data sources -> Product review sources
// -> Add product reviews -> "Add product reviews from a file" ->
// "Enter a link to your file":
//   https://www.aruhihandlooms.com/api/product-reviews-feed
//
// Only APPROVED reviews that have written text are included (Google needs
// review text; star-only ratings are skipped). Each review is linked to the
// product through <skus> = the same ids the product feed (/api/merchant-feed)
// uses as <g:id>, so Google can match a review to its product listing.
export const dynamic = 'force-dynamic';

const MAX_SKUS_PER_PRODUCT = 200;

function escapeXml(input: string): string {
  return input
    // strip characters that are illegal in XML 1.0
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

interface ReviewRow {
  id: string;
  product_id: string;
  customer_name: string | null;
  rating: number;
  title: string | null;
  comment: string | null;
  created_at: string;
}

interface VariantRow {
  id: string;
  product_id: string;
  product_variant_sizes: { size: string }[] | null;
}

export async function GET() {
  const admin = getSupabaseAdmin();

  const { data: reviewData, error } = await admin
    .from('reviews')
    .select('id, product_id, customer_name, rating, title, comment, created_at')
    .eq('is_approved', true)
    .order('created_at', { ascending: false })
    .limit(10000);

  if (error) {
    return new NextResponse(`Failed to load reviews: ${error.message}`, { status: 500 });
  }

  // Keep only reviews that have some text.
  const reviews = ((reviewData ?? []) as ReviewRow[]).filter(
    (r) => (r.comment && r.comment.trim()) || (r.title && r.title.trim())
  );

  const products = await fetchProductsServer();
  const productById = new Map(products.map((p) => [p.id, p]));
  const productIds = Array.from(new Set(reviews.map((r) => r.product_id))).filter((id) => productById.has(id));

  // Same ids as /api/merchant-feed uses for <g:id>:
  //   product with no variants          -> product id
  //   variant with no sizes             -> variant id
  //   variant with sizes                -> `${variant id}-${size without spaces, max 10 chars}`
  const skusByProduct = new Map<string, string[]>();
  if (productIds.length > 0) {
    const supabase = getServerSupabase();
    const { data: variants, error: vErr } = await supabase
      .from('product_variants')
      .select('id, product_id, product_variant_sizes(size)')
      .in('product_id', productIds);
    if (vErr) {
      return new NextResponse(`Failed to load variants: ${vErr.message}`, { status: 500 });
    }
    for (const v of (variants ?? []) as unknown as VariantRow[]) {
      const list = skusByProduct.get(v.product_id) ?? [];
      const sizes = v.product_variant_sizes ?? [];
      if (sizes.length === 0) list.push(v.id);
      else for (const s of sizes) list.push(`${v.id}-${s.size.replace(/\s+/g, '').slice(0, 10)}`);
      skusByProduct.set(v.product_id, list);
    }
  }

  const reviewXml = reviews
    .map((r) => {
      const p = productById.get(r.product_id);
      if (!p) return '';
      const rating = Math.min(5, Math.max(1, Math.round(Number(r.rating) || 0)));
      const title = (r.title ?? '').trim();
      const content = (r.comment ?? '').trim() || title;
      const skus = (skusByProduct.get(p.id) ?? [p.id]).slice(0, MAX_SKUS_PER_PRODUCT);
      const url = `${SITE_URL}/product/${p.slug}`;
      const name = (r.customer_name ?? '').trim();
      const reviewer = name
        ? `<name>${escapeXml(name)}</name>`
        : `<name is_anonymous="true">Anonymous</name>`;

      return `
    <review>
      <review_id>${escapeXml(r.id)}</review_id>
      <reviewer>
        ${reviewer}
      </reviewer>
      <review_timestamp>${new Date(r.created_at).toISOString().replace(/\.\d{3}Z$/, 'Z')}</review_timestamp>${
        title ? `\n      <title>${escapeXml(title)}</title>` : ''
      }
      <content>${escapeXml(content)}</content>
      <review_url type="singleton">${escapeXml(url)}</review_url>
      <ratings>
        <overall min="1" max="5">${rating}</overall>
      </ratings>
      <products>
        <product>
          <product_ids>
            <skus>${skus.map((s) => `<sku>${escapeXml(s)}</sku>`).join('')}</skus>
          </product_ids>
          <product_name>${escapeXml(p.name)}</product_name>
          <product_url>${escapeXml(url)}</product_url>
        </product>
      </products>
    </review>`;
    })
    .join('');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:vc="http://www.w3.org/2007/XMLSchema-versioning"
      xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
      xsi:noNamespaceSchemaLocation="http://www.google.com/shopping/reviews/schema/product/2.3/product_reviews.xsd">
  <version>2.3</version>
  <publisher>
    <name>AruhiHandlooms</name>
  </publisher>
  <reviews>${reviewXml}
  </reviews>
</feed>`;

  return new NextResponse(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=300, stale-while-revalidate=60',
    },
  });
}
