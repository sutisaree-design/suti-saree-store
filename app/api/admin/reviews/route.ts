import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAdminToken, ADMIN_SESSION_COOKIE } from '@/lib/admin-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

// SECURITY: reviews moderation (list-all / approve / reject / delete) used
// to go straight from the browser to Supabase using the anon key
// (lib/reviews-api.ts via getSupabaseBrowser()), protected only by RLS
// policies that allowed ANY anon/authenticated caller to update or delete
// ANY review (`anon_admin_update_reviews` / `anon_admin_delete_reviews`,
// `USING (true) WITH CHECK (true)`). That meant anyone could open the
// browser console and hide, fake-approve, or permanently delete any other
// customer's review. Admin moderation now goes through this route only,
// gated by the same admin session cookie every other /api/admin/* route
// checks. The customer-facing "auto-publish my own review" / "edit my own
// review" flow (lib/reviews-api.ts: approveReview / updateMyReview, called
// from components/product/reviews-section.tsx and
// components/account/delivered-item-review.tsx) is untouched — those still
// go direct to Supabase, now scoped by a new RLS policy that only lets a
// customer touch their OWN review row (auth.uid() = user_id), see
// supabase/migrations/*_lock_reviews_writes.sql.

async function requireAdmin() {
  const cookie = cookies().get(ADMIN_SESSION_COOKIE)?.value ?? null;
  const verified = await verifyAdminToken(cookie);
  return verified.valid;
}

// GET — every review regardless of approval status, newest first, with
// the parent product's name/slug joined in (moderation queue).
export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('reviews')
    .select('*, products(name, slug)')
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const reviews = (data ?? []).map((row: any) => {
    const { products: product, ...review } = row;
    return {
      ...review,
      product_name: product?.name ?? 'Deleted product',
      product_slug: product?.slug ?? '',
    };
  });

  return NextResponse.json({ reviews });
}

// PATCH — approve or reject (hide) a review. Body: { id, approved }
export async function PATCH(req: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { id, approved } = body || {};

  if (!id || typeof approved !== 'boolean') {
    return NextResponse.json({ error: 'id and approved (boolean) are required' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('reviews').update({ is_approved: approved }).eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

// DELETE — permanently remove a review. Query: ?id=<uuid>
export async function DELETE(req: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('reviews').delete().eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
