import { NextResponse } from 'next/server';
import { getCurrentUser, getSupabaseServer } from '@/lib/supabase-server-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { generateVariantSku, generateSizeSku } from '@/lib/sku';

const slugify = (s: string) =>
  s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');

function randomSuffix(len = 5) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

/** Confirms the caller is an approved vendor and returns their vendor row. */
async function requireApprovedVendor() {
  const user = await getCurrentUser();
  if (!user) return { error: NextResponse.json({ error: 'Please log in first' }, { status: 401 }) };

  const supabase = await getSupabaseServer();
  const { data: vendor, error } = await supabase
    .from('vendors')
    .select('id, status')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error || !vendor) {
    return { error: NextResponse.json({ error: 'No vendor profile found for this account' }, { status: 403 }) };
  }
  if (vendor.status === 'suspended') {
    return { error: NextResponse.json({ error: 'Your vendor account has been suspended' }, { status: 403 }) };
  }
  if (vendor.status !== 'approved') {
    return { error: NextResponse.json({ error: 'Only approved vendors can manage variants' }, { status: 403 }) };
  }
  return { vendor };
}

/**
 * GET /api/vendor/variants?product_id=...
 * Lists colour variants (with sizes) for a product the vendor owns.
 */
export async function GET(req: Request) {
  const auth = await requireApprovedVendor();
  if (auth.error) return auth.error;

  const { searchParams } = new URL(req.url);
  const productId = searchParams.get('product_id');
  if (!productId) return NextResponse.json({ error: 'product_id is required' }, { status: 400 });

  const admin = getSupabaseAdmin();

  // Ownership check — vendor can only see variants of their own products
  const { data: product } = await admin
    .from('products')
    .select('id, vendor_id')
    .eq('id', productId)
    .eq('vendor_id', auth.vendor.id)
    .maybeSingle();
  if (!product) return NextResponse.json({ error: 'Product not found' }, { status: 404 });

  const { data: variants, error } = await admin
    .from('product_variants')
    .select('*, product_variant_sizes(*)')
    .eq('product_id', productId)
    .order('created_at', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const shaped = (variants ?? []).map((v: any) => {
    const { product_variant_sizes, ...rest } = v;
    return { ...rest, sizes: product_variant_sizes ?? [] };
  });

  return NextResponse.json({ variants: shaped });
}

/**
 * POST /api/vendor/variants
 * Creates a new colour variant (+ its sizes) for a product the vendor owns.
 * Only allowed once the product is 'live' — variants are an add-on to an
 * already-approved listing, not part of the initial submission.
 *
 * Body: { product_id, color, images: string[], price_override?: number,
 *         sizes: { size: string, stock_quantity: number }[] }
 */
export async function POST(req: Request) {
  const auth = await requireApprovedVendor();
  if (auth.error) return auth.error;

  const body = await req.json().catch(() => ({}));
  const { product_id, color, images, price_override, sizes } = body;

  if (!product_id || typeof product_id !== 'string') {
    return NextResponse.json({ error: 'product_id is required' }, { status: 400 });
  }
  if (!color || typeof color !== 'string' || !color.trim()) {
    return NextResponse.json({ error: 'Colour name is required' }, { status: 400 });
  }
  if (!Array.isArray(images) || images.length === 0) {
    return NextResponse.json({ error: 'At least one image is required' }, { status: 400 });
  }
  if (!Array.isArray(sizes) || sizes.length === 0) {
    return NextResponse.json({ error: 'At least one size/stock row is required' }, { status: 400 });
  }

  const admin = getSupabaseAdmin();

  // Ownership + status check
  const { data: product } = await admin
    .from('products')
    .select('id, vendor_id, name, sku, approval_status')
    .eq('id', product_id)
    .eq('vendor_id', auth.vendor.id)
    .maybeSingle();

  if (!product) return NextResponse.json({ error: 'Product not found' }, { status: 404 });
  if (product.approval_status !== 'live') {
    return NextResponse.json(
      { error: 'Variants can only be added once the product is live on the site' },
      { status: 400 }
    );
  }

  const baseSku: string = product.sku || product.name || 'PRD';
  const variantSku = generateVariantSku(baseSku, color.trim());
  const baseSlug = slugify(`${product.name}-${color}`) || 'variant';
  const slug = `${baseSlug}-${randomSuffix()}`;

  const { data: variant, error: variantErr } = await admin
    .from('product_variants')
    .insert({
      product_id,
      color: color.trim(),
      slug,
      images,
      price_override: price_override != null && price_override !== '' ? Number(price_override) : null,
      sku: variantSku,
      is_default: false,
    })
    .select('*')
    .single();

  if (variantErr || !variant) {
    return NextResponse.json({ error: variantErr?.message || 'Failed to create variant' }, { status: 500 });
  }

  const sizeRows = sizes.map((s: { size: string; stock_quantity: number }) => ({
    variant_id: variant.id,
    size: (s.size || 'Free Size').trim(),
    stock_quantity: Math.max(0, Number(s.stock_quantity) || 0),
    sku: generateSizeSku(variantSku, s.size || 'FREE'),
  }));

  const { data: insertedSizes, error: sizesErr } = await admin
    .from('product_variant_sizes')
    .insert(sizeRows)
    .select('*');

  if (sizesErr) {
    // Roll back the orphaned variant so the vendor doesn't end up with a
    // colour that has no sizes attached.
    await admin.from('product_variants').delete().eq('id', variant.id);
    return NextResponse.json({ error: sizesErr.message }, { status: 500 });
  }

  return NextResponse.json({ variant: { ...variant, sizes: insertedSizes ?? [] } });
}
