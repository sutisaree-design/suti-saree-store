import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAdminToken, ADMIN_SESSION_COOKIE } from '@/lib/admin-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

/**
 * GET /api/admin/product-variant-counts
 *
 * Returns { counts: { [product_id]: number }, colors: { [product_id]:
 * { color: string; color_hex: string | null }[] } } for every product that
 * has at least one colour variant. Used by the Manage Products catalog to
 * show which colour(s) a product has right in the list row, without
 * needing to open the product or its palette/variants dialog.
 */
export async function GET() {
  const cookie = cookies().get(ADMIN_SESSION_COOKIE)?.value ?? null;
  const verified = await verifyAdminToken(cookie);
  if (!verified.valid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('product_variants')
      .select('product_id, color, color_hex')
      .order('created_at', { ascending: true });
    if (error) throw error;

    const counts: Record<string, number> = {};
    const colors: Record<string, { color: string; color_hex: string | null }[]> = {};
    for (const row of data ?? []) {
      counts[row.product_id] = (counts[row.product_id] ?? 0) + 1;
      if (!colors[row.product_id]) colors[row.product_id] = [];
      colors[row.product_id].push({ color: row.color, color_hex: row.color_hex ?? null });
    }

    return NextResponse.json({ counts, colors });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load variant counts';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
