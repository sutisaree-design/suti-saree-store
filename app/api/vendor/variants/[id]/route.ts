import { NextResponse } from 'next/server';
import { getCurrentUser, getSupabaseServer } from '@/lib/supabase-server-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

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
  if (vendor.status !== 'approved') {
    return { error: NextResponse.json({ error: 'Only approved vendors can manage variants' }, { status: 403 }) };
  }
  return { vendor };
}

/** Loads a variant and confirms its parent product belongs to this vendor. */
async function loadOwnedVariant(admin: ReturnType<typeof getSupabaseAdmin>, variantId: string, vendorId: string) {
  const { data: variant } = await admin
    .from('product_variants')
    .select('*, products!inner(vendor_id)')
    .eq('id', variantId)
    .eq('products.vendor_id', vendorId)
    .maybeSingle();
  return variant;
}

/**
 * PATCH /api/vendor/variants/[id]
 * Body: { color?, images?, price_override?, sizes?: [{ id?, size, stock_quantity }] }
 * Sizes, if provided, fully replace the existing set (deletes any removed rows).
 */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireApprovedVendor();
  if (auth.error) return auth.error;

  const admin = getSupabaseAdmin();
  const variant = await loadOwnedVariant(admin, params.id, auth.vendor.id);
  if (!variant) return NextResponse.json({ error: 'Variant not found' }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const updates: Record<string, unknown> = {};
  if (typeof body.color === 'string' && body.color.trim()) updates.color = body.color.trim();
  if (Array.isArray(body.images)) updates.images = body.images;
  if ('price_override' in body) {
    updates.price_override = body.price_override != null && body.price_override !== '' ? Number(body.price_override) : null;
  }

  if (Object.keys(updates).length > 0) {
    const { error } = await admin.from('product_variants').update(updates).eq('id', params.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (Array.isArray(body.sizes)) {
    // Simplest safe approach: replace the whole size set for this variant.
    await admin.from('product_variant_sizes').delete().eq('variant_id', params.id);
    const rows = body.sizes.map((s: { size: string; stock_quantity: number }) => ({
      variant_id: params.id,
      size: (s.size || 'Free Size').trim(),
      stock_quantity: Math.max(0, Number(s.stock_quantity) || 0),
    }));
    if (rows.length > 0) {
      const { error: sizeErr } = await admin.from('product_variant_sizes').insert(rows);
      if (sizeErr) return NextResponse.json({ error: sizeErr.message }, { status: 500 });
    }
  }

  const { data: fresh } = await admin
    .from('product_variants')
    .select('*, product_variant_sizes(*)')
    .eq('id', params.id)
    .single();
  const { product_variant_sizes, ...rest } = (fresh ?? {}) as any;
  return NextResponse.json({ variant: { ...rest, sizes: product_variant_sizes ?? [] } });
}

/** DELETE /api/vendor/variants/[id] */
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireApprovedVendor();
  if (auth.error) return auth.error;

  const admin = getSupabaseAdmin();
  const variant = await loadOwnedVariant(admin, params.id, auth.vendor.id);
  if (!variant) return NextResponse.json({ error: 'Variant not found' }, { status: 404 });

  const { error } = await admin.from('product_variants').delete().eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
