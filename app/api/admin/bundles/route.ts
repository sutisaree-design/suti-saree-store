import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAdminToken, ADMIN_SESSION_COOKIE } from '@/lib/admin-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

// SECURITY: product_bundles create/delete used to go straight from the
// browser to Supabase using the anon key (lib/bundles-api.ts via the plain
// anon `supabase` client), protected only by an RLS policy that allowed
// ANY anon/authenticated caller to insert/update/delete ANY bundle link
// (`anon_write_product_bundles`, `FOR ALL`, `USING (true) WITH CHECK
// (true)`) — anyone could curate fake "frequently bought together" pairs
// on any product. Writes are now server-side only, gated by the same
// admin session cookie every other /api/admin/* route checks. Reads
// (product_bundles SELECT, used both by the admin panel and the public
// "frequently bought together" widget) are unchanged.

async function requireAdmin() {
  const cookie = cookies().get(ADMIN_SESSION_COOKIE)?.value ?? null;
  const verified = await verifyAdminToken(cookie);
  return verified.valid;
}

// POST — add a bundle link. Body: { product_id, bundle_product_id, position }
export async function POST(req: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { product_id, bundle_product_id, position } = body || {};

  if (!product_id || !bundle_product_id) {
    return NextResponse.json(
      { error: 'product_id and bundle_product_id are required' },
      { status: 400 }
    );
  }

  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('product_bundles')
    .insert({ product_id, bundle_product_id, position: position ?? 0 });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
