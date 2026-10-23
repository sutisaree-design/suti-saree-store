import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAdminToken, ADMIN_SESSION_COOKIE } from '@/lib/admin-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

// Bulk version of /product-sources/product/[productId] — instead of one
// row, returns { [product_id]: { source_id, source_name, whatsapp_name,
// whatsapp_number } } for every product that has a source assigned. Used
// by the admin Products list (components/admin/products-panel.tsx) so
// each row can show its source name/number without an N+1 fetch per
// product. Same admin-only, zero-RLS tables as the rest of this feature —
// nothing here is ever reachable from the storefront.

async function requireAdmin() {
  const cookie = cookies().get(ADMIN_SESSION_COOKIE)?.value ?? null;
  const verified = await verifyAdminToken(cookie);
  return verified.valid;
}

export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  try {
    const { data: links, error: linkError } = await supabase
      .from('product_sourcing')
      .select('product_id, product_source_id')
      .not('product_source_id', 'is', null);
    if (linkError) throw linkError;

    const sourceIds = Array.from(
      new Set((links ?? []).map((r: any) => r.product_source_id).filter(Boolean))
    );

    let sourcesById: Record<string, { name: string; whatsapp_name: string | null; whatsapp_number: string | null }> = {};
    if (sourceIds.length > 0) {
      const { data: sources, error: sourceError } = await supabase
        .from('product_sources')
        .select('id, name, whatsapp_name, whatsapp_number')
        .in('id', sourceIds);
      if (sourceError) throw sourceError;
      sourcesById = (sources ?? []).reduce((acc: any, s: any) => {
        acc[s.id] = { name: s.name, whatsapp_name: s.whatsapp_name, whatsapp_number: s.whatsapp_number };
        return acc;
      }, {});
    }

    const map: Record<
      string,
      { source_id: string; source_name: string; whatsapp_name: string | null; whatsapp_number: string | null }
    > = {};
    for (const row of links ?? []) {
      const src = sourcesById[row.product_source_id];
      if (!src) continue;
      map[row.product_id] = {
        source_id: row.product_source_id,
        source_name: src.name,
        whatsapp_name: src.whatsapp_name,
        whatsapp_number: src.whatsapp_number,
      };
    }

    return NextResponse.json({ map });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load product sourcing map';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
