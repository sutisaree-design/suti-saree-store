import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAdminToken, ADMIN_SESSION_COOKIE } from '@/lib/admin-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

// ---------------------------------------------------------------------
// GET /api/admin/products/search?q=saree
//
// Lightweight product search for the "Suggest a product" picker in
// Admin > Support Tickets (components/admin/support-tickets-panel.tsx).
// Returns just enough for a picker row + the snapshot that gets stored
// on the ticket (support_tickets.suggested_product).
// ---------------------------------------------------------------------

export async function GET(req: Request) {
  const cookie = cookies().get(ADMIN_SESSION_COOKIE)?.value ?? null;
  const verified = await verifyAdminToken(cookie);
  if (!verified.valid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const q = (searchParams.get('q') || '').trim();
  if (!q) {
    return NextResponse.json({ products: [] });
  }

  const supabase = getSupabaseAdmin();
  try {
    const { data, error } = await supabase
      .from('products')
      .select('id, name, slug, images, price, mrp, in_stock')
      .ilike('name', `%${q}%`)
      .order('name', { ascending: true })
      .limit(8);

    if (error) throw error;

    const products = (data || []).map((p) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      image: p.images?.[0] || null,
      price: p.price,
      mrp: p.mrp,
      inStock: p.in_stock,
    }));

    return NextResponse.json({ products });
  } catch (err) {
    console.error('[admin/products/search] error:', err);
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }
}
