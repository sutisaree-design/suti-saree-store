import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { verifyAdminToken, ADMIN_SESSION_COOKIE } from '@/lib/admin-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

async function requireAdmin() {
  const cookie = cookies().get(ADMIN_SESSION_COOKIE)?.value ?? null;
  const verified = await verifyAdminToken(cookie);
  return verified.valid;
}

// GET — list all discover picks (admin panel table), joined with the
// product's name/image/price/slug for display.
export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  try {
    const { data, error } = await supabase
      .from('discover_picks')
      .select('id, product_id, position, is_active, created_at, products(name, images, price, slug)')
      .order('position', { ascending: true });
    if (error) throw error;

    const picks = (data ?? []).map((row: any) => ({
      id: row.id,
      product_id: row.product_id,
      position: row.position,
      is_active: row.is_active,
      created_at: row.created_at,
      product_name: row.products?.name ?? '(product not found)',
      product_image: row.products?.images?.[0] ?? null,
      product_price: row.products?.price ?? null,
      product_slug: row.products?.slug ?? null,
    }));

    return NextResponse.json({ picks });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load discover picks';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST — add a product to the curated Discover Products list
export async function POST(req: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { product_id } = body || {};

  if (!product_id || typeof product_id !== 'string') {
    return NextResponse.json({ error: 'product_id is required' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  try {
    const { data: existing } = await supabase
      .from('discover_picks')
      .select('id')
      .eq('product_id', product_id)
      .maybeSingle();
    if (existing) {
      return NextResponse.json({ error: 'This product is already in Discover Products' }, { status: 409 });
    }

    const { data: maxRow } = await supabase
      .from('discover_picks')
      .select('position')
      .order('position', { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextPosition = (maxRow?.position ?? -1) + 1;

    const { error } = await supabase.from('discover_picks').insert({
      product_id,
      position: nextPosition,
      is_active: true,
    });
    if (error) throw error;
    revalidatePath('/');
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to add product';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
