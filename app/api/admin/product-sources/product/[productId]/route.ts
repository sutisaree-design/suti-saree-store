import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAdminToken, ADMIN_SESSION_COOKIE } from '@/lib/admin-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

// Bridges the (public-safe) `products` table and the hidden
// `product_sourcing` table for exactly one product. Used by the admin
// Products form: GET when the edit dialog opens (to prefill the Source /
// Buy Price fields), PUT when the form is saved.

async function requireAdmin() {
  const cookie = cookies().get(ADMIN_SESSION_COOKIE)?.value ?? null;
  const verified = await verifyAdminToken(cookie);
  return verified.valid;
}

// GET — existing sourcing for this product, or nulls if never set.
export async function GET(_req: Request, { params }: { params: { productId: string } }) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  try {
    const { data, error } = await supabase
      .from('product_sourcing')
      .select('product_source_id, buy_price')
      .eq('product_id', params.productId)
      .maybeSingle();
    if (error) throw error;
    return NextResponse.json({
      product_source_id: data?.product_source_id ?? null,
      buy_price: data?.buy_price ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load product sourcing';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// PUT — set/replace the source + buy price for this product. Sending
// both as null clears the assignment (row is kept with null fields
// rather than deleted, so it's a no-op idempotent upsert either way).
export async function PUT(req: Request, { params }: { params: { productId: string } }) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const product_source_id = body.product_source_id || null;
  const buy_price =
    body.buy_price === '' || body.buy_price === null || body.buy_price === undefined
      ? null
      : Number(body.buy_price);

  const supabase = getSupabaseAdmin();
  try {
    const { error } = await supabase
      .from('product_sourcing')
      .upsert(
        {
          product_id: params.productId,
          product_source_id,
          buy_price,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'product_id' }
      );
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save product sourcing';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
