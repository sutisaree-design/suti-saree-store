import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAdminToken, ADMIN_SESSION_COOKIE } from '@/lib/admin-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

// SECURITY: this whole feature (product_sources / product_sourcing tables)
// has zero RLS policies for anon/authenticated — see the migration comment
// in 20260910000000_hidden_product_sources.sql. Every route here also
// re-checks the admin session cookie on top of that, same convention as
// every other /api/admin/* route in this codebase. Nothing here is ever
// called from a customer-facing page, the sitemap, or the merchant feed.

async function requireAdmin() {
  const cookie = cookies().get(ADMIN_SESSION_COOKIE)?.value ?? null;
  const verified = await verifyAdminToken(cookie);
  return verified.valid;
}

// GET — list all sources, newest first. Supports:
//   ?q=       free-text search over name / whatsapp_name / whatsapp_number
//   ?from=    ISO date — only sources with source_date >= from
//   ?to=      ISO date — only sources with source_date <= to
// Each row also gets `product_count` (how many products currently point
// at it) so the panel can show it without a second round trip.
export async function GET(req: NextRequest) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q')?.trim() || '';
  const from = searchParams.get('from');
  const to = searchParams.get('to');

  const supabase = getSupabaseAdmin();

  try {
    let query = supabase.from('product_sources').select('*').order('source_date', { ascending: false });

    if (q) {
      const escaped = q.replace(/[%_]/g, (m) => `\\${m}`);
      query = query.or(
        `name.ilike.%${escaped}%,whatsapp_name.ilike.%${escaped}%,whatsapp_number.ilike.%${escaped}%`
      );
    }
    if (from) query = query.gte('source_date', from);
    if (to) query = query.lte('source_date', to);

    const { data: sources, error } = await query;
    if (error) throw error;

    const ids = (sources ?? []).map((s) => s.id);
    let counts: Record<string, number> = {};
    if (ids.length > 0) {
      const { data: links, error: linkError } = await supabase
        .from('product_sourcing')
        .select('product_source_id')
        .in('product_source_id', ids);
      if (linkError) throw linkError;
      counts = (links ?? []).reduce((acc: Record<string, number>, row: any) => {
        if (row.product_source_id) acc[row.product_source_id] = (acc[row.product_source_id] || 0) + 1;
        return acc;
      }, {});
    }

    const withCounts = (sources ?? []).map((s) => ({ ...s, product_count: counts[s.id] || 0 }));
    return NextResponse.json({ sources: withCounts });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load product sources';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST — create a new source (the "Add New" button)
export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const name = String(body.name || '').trim();
  if (!name) {
    return NextResponse.json({ error: 'Source name is required' }, { status: 400 });
  }

  const payload = {
    name,
    whatsapp_name: body.whatsapp_name ? String(body.whatsapp_name).trim() : null,
    whatsapp_number: body.whatsapp_number ? String(body.whatsapp_number).trim() : null,
    source_date: body.source_date ? new Date(body.source_date).toISOString() : new Date().toISOString(),
    notes: body.notes ? String(body.notes).trim() : null,
  };

  const supabase = getSupabaseAdmin();
  try {
    const { data, error } = await supabase.from('product_sources').insert(payload).select('*').single();
    if (error) throw error;
    return NextResponse.json({ source: { ...data, product_count: 0 } });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create product source';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
