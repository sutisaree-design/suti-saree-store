import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAdminToken, ADMIN_SESSION_COOKIE } from '@/lib/admin-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { generateVariantSeoContent } from '@/lib/variant-seo-content';

// SECURITY: variant create/update/delete used to go straight from the
// browser to Supabase using the anon key (lib/variants-api.ts via
// getSupabaseBrowser()), protected only by an RLS policy that allowed
// ANY anon/authenticated caller to write to `product_variants` /
// `product_variant_sizes` (`anon_write_variants` / `anon_write_variant_sizes`
// ... USING (true) WITH CHECK (true)`). That meant anyone could open the
// browser console and change any product's price_override or
// stock_quantity directly — a real ₹1-order / stock-manipulation risk.
// Writes are now server-side only, gated by the same admin session
// cookie every other /api/admin/* route already checks. Reads
// (product_variants SELECT) stay open — that's public storefront data.

async function requireAdmin() {
  const cookie = cookies().get(ADMIN_SESSION_COOKIE)?.value ?? null;
  const verified = await verifyAdminToken(cookie);
  return verified.valid;
}

interface VariantSizeInput {
  size: string;
  stockQuantity: number;
  priceOverride?: number | null;
  sku?: string | null;
}

// POST — create a variant, optionally with its initial sizes
export async function POST(req: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const {
    productId,
    color,
    colorHex,
    slug,
    images,
    video,
    priceOverride,
    metaTitle,
    metaDescription,
    styleNote,
    isDefault,
    sku,
    rating,
    reviews,
    sizes,
  } = body || {};

  if (!productId || !color || !slug) {
    return NextResponse.json({ error: 'productId, color and slug are required' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  try {
    // SEO SAFEGUARD: if the admin/vendor left meta_title/meta_description/
    // style_note blank (the common case -- these are optional fields on
    // the form), auto-generate them here instead of leaving all colours on
    // identical fallback text. Without this, every colour of a product can
    // render the same <title> and the same on-page description, which
    // reads as duplicate content to Google and is why most variant URLs
    // were stuck on "Discovered - currently not indexed" instead of being
    // crawled and indexed individually. See lib/variant-seo-content.ts.
    let seoDefaults: { metaTitle: string; metaDescription: string; styleNote: string } | null = null;
    if (!metaTitle || !metaDescription || !styleNote) {
      const { data: productRow } = await supabase
        .from('products')
        .select('name, fabric, category_name, occasion')
        .eq('id', productId)
        .maybeSingle();

      seoDefaults = generateVariantSeoContent({
        productName: productRow?.name ?? color,
        fabric: productRow?.fabric ?? null,
        category: productRow?.category_name ?? null,
        occasion: productRow?.occasion ?? null,
        color,
      });
    }

    const { data: variant, error } = await supabase
      .from('product_variants')
      .insert({
        product_id: productId,
        color,
        color_hex: colorHex ?? null,
        slug,
        images: images ?? [],
        video: video ?? null,
        price_override: priceOverride ?? null,
        meta_title: metaTitle || seoDefaults?.metaTitle || null,
        meta_description: metaDescription || seoDefaults?.metaDescription || null,
        style_note: styleNote || seoDefaults?.styleNote || null,
        is_default: isDefault ?? false,
        sku: sku ?? null,
        rating: rating ?? null,
        reviews: reviews ?? null,
      })
      .select('*')
      .single();
    if (error) throw error;

    const sizeRows: VariantSizeInput[] = Array.isArray(sizes) ? sizes : [];
    if (sizeRows.length > 0) {
      const { error: sizeError } = await supabase.from('product_variant_sizes').insert(
        sizeRows.map((s) => ({
          variant_id: variant.id,
          size: s.size,
          stock_quantity: s.stockQuantity,
          price_override: s.priceOverride ?? null,
          sku: s.sku ?? null,
        }))
      );
      if (sizeError) throw sizeError;
    }

    return NextResponse.json({ variant });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create variant';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
