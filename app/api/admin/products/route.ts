import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { verifyAdminToken, ADMIN_SESSION_COOKIE } from '@/lib/admin-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

// SECURITY: admin catalog product create/update/delete used to go straight
// from the browser to Supabase using the anon key (lib/products-api.ts via
// getSupabaseBrowser(), called from components/admin/products-panel.tsx).
// The 20260829040000 migration correctly locked `products` INSERT/UPDATE to
// `service_role` for admin-owned rows (vendor-owned rows keep their own
// scoped own_insert_vendor_products / own_update_vendor_products policies —
// unaffected by this change) and DELETE to `service_role` entirely, but no
// server route was added at the same time — so admin "Add Product" /
// "Save Changes" started failing against RLS (0 rows back from
// `.select('*').single()` surfaces as Postgrest's "Cannot coerce the
// result to a single JSON object"). Writes are now server-side only,
// gated by the same admin session cookie every other /api/admin/* route
// already checks. Reads stay unchanged (SELECT is public storefront data).

async function requireAdmin() {
  const cookie = cookies().get(ADMIN_SESSION_COOKIE)?.value ?? null;
  const verified = await verifyAdminToken(cookie);
  return verified.valid;
}

// POST — create an admin catalog product (no vendor_id / negotiation --
// price is used directly as final_price, same as the old client-side insert).
export async function POST(req: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const input = await req.json().catch(() => ({}));

  const payload = {
    name: input.name,
    slug: input.slug,
    description: input.description,
    price: input.price,
    // See the comment on this same line in the old lib/products-api.ts
    // createProduct(): final_price is NOT NULL and admin catalog products
    // have no vendor negotiation, so it always mirrors price.
    final_price: input.price,
    mrp: input.mrp,
    category_id: input.category_id,
    category_name: input.category_name,
    fabric: input.fabric,
    origin: input.origin,
    colors: input.colors ?? [],
    sizes: input.sizes ?? ['Free Size'],
    occasion: input.occasion ?? [],
    gender: input.gender ?? 'female',
    age_group: input.age_group ?? 'adult',
    material: input.material ?? null,
    pattern: input.pattern ?? null,
    images: input.images ?? [],
    video_url: input.video_url ?? null,
    autoplay_video_in_catalog: input.autoplay_video_in_catalog ?? false,
    sku: input.sku ?? null,
    highlights: input.highlights ?? {},
    stock_quantity: input.stock_quantity ?? 0,
    low_stock_threshold: input.low_stock_threshold ?? 5,
    // Do NOT default this to 4.5 -- that fabricates a trust signal for a
    // product that has zero real reviews, which is exactly what Google's
    // Misrepresentation policy flags. Only store a rating if one was
    // explicitly provided (e.g. migrating existing reviews); otherwise 0.
    rating: input.rating ?? 0,
    reviews: input.reviews ?? 0,
    featured: input.featured ?? false,
    in_stock: input.in_stock ?? true,
  };

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('products')
    .insert(payload)
    .select('*')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // See app/api/admin/products/[id]/route.ts for why this is needed --
  // category pages are ISR-cached, so a brand-new product could otherwise
  // take up to 60s to appear there.
  revalidatePath('/');
  revalidatePath('/category/[slug]', 'page');
  revalidatePath('/shop');
  revalidatePath('/search');

  return NextResponse.json({ product: data });
}
