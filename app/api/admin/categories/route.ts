import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { verifyAdminToken, ADMIN_SESSION_COOKIE } from '@/lib/admin-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

// Category add/rename/delete changes the home page category tiles, the
// /category/[slug] pages, and the /shop filters. Admin writes are rare, so
// purging these few paths costs next to nothing on Vercel's ISR quota.
function revalidateCategories() {
  revalidatePath('/');
  revalidatePath('/category/[slug]', 'page');
  revalidatePath('/shop');
  revalidatePath('/search');
}


// SECURITY: category create/update/delete used to go straight from the
// browser to Supabase using the anon key (lib/products-api.ts via
// getSupabaseBrowser(), called from components/admin/categories-panel.tsx).
// The 20260829040000 migration correctly locked categories INSERT/UPDATE/
// DELETE to `service_role` (SELECT stays open for storefront nav), but no
// server route was added at the same time — so admin "Add Category" /
// "Edit Category" / "Delete Category" all started failing against RLS
// ("Save failed" / PostgREST 0-rows errors). Writes are now server-side
// only, gated by the same admin session cookie every other /api/admin/*
// route already checks. Reads (fetchCategories, countProductsInCategory)
// are unchanged — those still use the anon client, which is fine since
// SELECT is intentionally public.

async function requireAdmin() {
  const cookie = cookies().get(ADMIN_SESSION_COOKIE)?.value ?? null;
  const verified = await verifyAdminToken(cookie);
  return verified.valid;
}

// POST — create a category. Body: { name, slug, description? }
export async function POST(req: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { name, slug, description } = body || {};

  if (!name || !slug) {
    return NextResponse.json({ error: 'name and slug are required' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('categories')
    .insert({ name, slug, description: description ?? null })
    .select('*')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  revalidateCategories();
  return NextResponse.json({ category: data });
}
