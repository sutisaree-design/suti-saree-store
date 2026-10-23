import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { verifyAdminToken, ADMIN_SESSION_COOKIE } from '@/lib/admin-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

// SECURITY: see app/api/admin/products/route.ts for the full writeup.

// The category and product storefront pages are ISR-cached (see
// `export const revalidate = 60` on app/category/[slug]/page.tsx and
// app/product/[slug]/page.tsx) so they don't hammer the DB on every visit.
// That's great for performance but on its own means an admin edit/delete
// can take up to 60s to actually disappear from the storefront -- long
// enough that a just-deleted product kept showing on its category page and
// 404'ing when clicked. Purging the specific paths on every write makes the
// change visible immediately instead of waiting out that window.
function revalidateStorefront(slug?: string | null) {
  revalidatePath('/');
  // Dynamic-segment pattern: revalidates every /category/[slug] page in one
  // call. Products don't store a category *slug* (only category_name/id),
  // so revalidating them all is simpler and just as cheap as figuring out
  // which single category this product belonged to.
  revalidatePath('/category/[slug]', 'page');
  revalidatePath('/shop');
  revalidatePath('/search');
  if (slug) revalidatePath(`/product/${slug}`);
}

async function requireAdmin() {
  const cookie = cookies().get(ADMIN_SESSION_COOKIE)?.value ?? null;
  const verified = await verifyAdminToken(cookie);
  return verified.valid;
}

const UPDATABLE_FIELDS = [
  'name', 'slug', 'description', 'price', 'mrp', 'category_id',
  'category_name', 'fabric', 'origin', 'colors', 'sizes', 'occasion', 'images',
  'video_url', 'autoplay_video_in_catalog', 'gender', 'age_group', 'material', 'pattern', 'sku', 'highlights',
  'stock_quantity', 'low_stock_threshold', 'rating', 'reviews', 'featured', 'in_stock',
] as const;

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const input = await req.json().catch(() => ({}));
  const payload: Record<string, unknown> = {};
  for (const key of UPDATABLE_FIELDS) {
    if (input[key] !== undefined) {
      payload[key] = input[key];
    }
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('products')
    .update(payload)
    .eq('id', params.id)
    .select('*')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  revalidateStorefront(data?.slug);
  return NextResponse.json({ product: data });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  // .select() on a delete returns the deleted row(s) -- grabbing the slug
  // here (instead of a bare delete) is what lets us purge that exact
  // /product/[slug] page below.
  const { data, error } = await supabase
    .from('products')
    .delete()
    .eq('id', params.id)
    .select('slug')
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  revalidateStorefront(data?.slug);
  return NextResponse.json({ success: true });
}
