import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAdminToken, ADMIN_SESSION_COOKIE } from '@/lib/admin-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

async function requireAdmin() {
  const cookie = cookies().get(ADMIN_SESSION_COOKIE)?.value ?? null;
  const verified = await verifyAdminToken(cookie);
  return verified.valid;
}

// POST — add a size row (stock_quantity / price_override) to a variant
export async function POST(req: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { variantId, size, stockQuantity, priceOverride, sku } = body || {};

  if (!variantId || !size || stockQuantity == null) {
    return NextResponse.json({ error: 'variantId, size and stockQuantity are required' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  try {
    const { data, error } = await supabase
      .from('product_variant_sizes')
      .insert({
        variant_id: variantId,
        size,
        stock_quantity: stockQuantity,
        price_override: priceOverride ?? null,
        sku: sku ?? null,
      })
      .select('*')
      .single();
    if (error) throw error;
    return NextResponse.json({ size: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to add size';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
