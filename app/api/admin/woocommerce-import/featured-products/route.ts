import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAdminToken, ADMIN_SESSION_COOKIE } from '@/lib/admin-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

async function requireAdmin() {
  const cookie = cookies().get(ADMIN_SESSION_COOKIE)?.value ?? null;
  const verified = await verifyAdminToken(cookie);
  return verified.valid;
}

const PRODUCT_COLUMNS = 'id, name, slug, price, mrp, images, category_name, featured, in_stock';

// GET /api/admin/woocommerce-import/featured-products?limit=6&category=Silk%20Sarees
//
// Returns real, in-stock, image-having products from *this* store, plus the
// live list of shoppable categories (each with a real thumbnail pulled from
// one of its own products) — used to build "premium template" campaign
// emails whose category-circle row and product grid mirror the homepage
// exactly, and where every image/link is real (never fake/placeholder).
//
// - No `category` param: featured products first, topped up with the
//   latest in-stock products (same behaviour as before).
// - `category` param: only products from that category (by category_name),
//   newest first — so the template's product grid actually matches the
//   category the admin picked in the panel.
export async function GET(req: NextRequest) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const limitParam = Number(req.nextUrl.searchParams.get('limit'));
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 12) : 6;
  const category = req.nextUrl.searchParams.get('category')?.trim() || null;

  const supabase = getSupabaseAdmin();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || '';

  let products: any[] = [];

  if (category) {
    const { data, error } = await supabase
      .from('products')
      .select(PRODUCT_COLUMNS)
      .eq('category_name', category)
      .eq('in_stock', true)
      .not('images', 'eq', '{}')
      .order('featured', { ascending: false })
      .order('updated_at', { ascending: false })
      .limit(limit);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    products = data ?? [];
  } else {
    const { data: featured, error: featuredError } = await supabase
      .from('products')
      .select(PRODUCT_COLUMNS)
      .eq('featured', true)
      .eq('in_stock', true)
      .not('images', 'eq', '{}')
      .order('updated_at', { ascending: false })
      .limit(limit);
    if (featuredError) return NextResponse.json({ error: featuredError.message }, { status: 500 });
    products = featured ?? [];

    if (products.length < limit) {
      const have = new Set(products.map((p) => p.id));
      const { data: fillIn, error: fillError } = await supabase
        .from('products')
        .select(PRODUCT_COLUMNS)
        .eq('in_stock', true)
        .not('images', 'eq', '{}')
        .order('created_at', { ascending: false })
        .limit(limit * 2); // fetch extra so we still have `limit` after de-duping
      if (fillError) return NextResponse.json({ error: fillError.message }, { status: 500 });
      for (const p of fillIn ?? []) {
        if (products.length >= limit) break;
        if (!have.has(p.id)) {
          products.push(p);
          have.add(p.id);
        }
      }
    }
  }

  // Categories row (mirrors the homepage's "Shop by Category" circles):
  // each category's thumbnail is its own featured product's first image,
  // else its newest in-stock product's first image. Categories with no
  // shoppable product are skipped, same as the homepage does.
  const { data: categoryRows, error: categoryError } = await supabase
    .from('categories')
    .select('id, name, slug')
    .order('name', { ascending: true });
  if (categoryError) {
    return NextResponse.json({ error: categoryError.message }, { status: 500 });
  }

  const categories: { name: string; slug: string; image: string | null; url: string }[] = [];
  for (const c of categoryRows ?? []) {
    const { data: catProducts } = await supabase
      .from('products')
      .select('images, featured')
      .eq('category_name', c.name)
      .eq('in_stock', true)
      .not('images', 'eq', '{}')
      .order('featured', { ascending: false })
      .order('updated_at', { ascending: false })
      .limit(1);
    const thumb = catProducts?.[0]?.images?.[0] ?? null;
    if (thumb) {
      categories.push({
        name: c.name,
        slug: c.slug,
        image: thumb,
        url: `${siteUrl}/category/${c.slug}`,
      });
    }
  }

  const result = products.slice(0, limit).map((p) => ({
    id: p.id,
    name: p.name,
    slug: p.slug,
    price: p.price,
    mrp: p.mrp,
    image: p.images?.[0] || null,
    category_name: p.category_name,
    url: `${siteUrl}/product/${p.slug}`,
  }));

  return NextResponse.json({ products: result, categories });
}
