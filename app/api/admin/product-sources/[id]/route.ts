import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAdminToken, ADMIN_SESSION_COOKIE } from '@/lib/admin-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

async function requireAdmin() {
  const cookie = cookies().get(ADMIN_SESSION_COOKIE)?.value ?? null;
  const verified = await verifyAdminToken(cookie);
  return verified.valid;
}

// GET — one source + every product currently assigned to it (this powers
// "click a source -> see all its products" in the panel).
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  try {
    const { data: source, error: sourceError } = await supabase
      .from('product_sources')
      .select('*')
      .eq('id', params.id)
      .maybeSingle();
    if (sourceError) throw sourceError;
    if (!source) {
      return NextResponse.json({ error: 'Product source not found' }, { status: 404 });
    }

    const { data: links, error: linksError } = await supabase
      .from('product_sourcing')
      .select('product_id, buy_price, updated_at')
      .eq('product_source_id', params.id);
    if (linksError) throw linksError;

    const productIds = (links ?? []).map((l) => l.product_id);
    let products: any[] = [];
    if (productIds.length > 0) {
      const { data: rows, error: productsError } = await supabase
        .from('products')
        .select('id, name, slug, sku, images, price, stock_quantity, in_stock')
        .in('id', productIds);
      if (productsError) throw productsError;
      products = rows ?? [];
    }

    const buyPriceByProduct = new Map((links ?? []).map((l) => [l.product_id, l.buy_price]));
    const merged = products.map((p) => ({ ...p, buy_price: buyPriceByProduct.get(p.id) ?? null }));

    return NextResponse.json({ source, products: merged });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load product source';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// PATCH — edit a source's details
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const update: Record<string, unknown> = {};
  if (body.name !== undefined) update.name = String(body.name).trim();
  if (body.whatsapp_name !== undefined) update.whatsapp_name = body.whatsapp_name ? String(body.whatsapp_name).trim() : null;
  if (body.whatsapp_number !== undefined) update.whatsapp_number = body.whatsapp_number ? String(body.whatsapp_number).trim() : null;
  if (body.source_date !== undefined) update.source_date = body.source_date ? new Date(body.source_date).toISOString() : null;
  if (body.notes !== undefined) update.notes = body.notes ? String(body.notes).trim() : null;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }
  update.updated_at = new Date().toISOString();

  const supabase = getSupabaseAdmin();
  try {
    const { data, error } = await supabase
      .from('product_sources')
      .update(update)
      .eq('id', params.id)
      .select('*')
      .single();
    if (error) throw error;
    return NextResponse.json({ source: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update product source';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE — removes the source. Any products pointing at it keep their
// row in product_sourcing (so buy_price history isn't lost) but
// product_source_id falls back to NULL via the FK's ON DELETE SET NULL.
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  try {
    const { error } = await supabase.from('product_sources').delete().eq('id', params.id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to delete product source';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
