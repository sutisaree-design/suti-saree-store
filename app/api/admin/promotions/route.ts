import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { verifyAdminToken, ADMIN_SESSION_COOKIE } from '@/lib/admin-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { syncHomepageTileForPromotion, fetchLinkedTilePromotionIds } from '@/lib/promotion-homepage-tile-sync';

async function requireAdmin() {
  const cookie = cookies().get(ADMIN_SESSION_COOKIE)?.value ?? null;
  const verified = await verifyAdminToken(cookie);
  return verified.valid;
}

// GET — list all promotions (admin panel table)
export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  try {
    const { data, error } = await supabase
      .from('promotions')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;

    // Part 4a: tell the panel which promotions currently own an
    // auto-linked homepage tile, so the "Show as homepage tile"
    // checkbox reflects real state instead of resetting on reload.
    const linkedIds = await fetchLinkedTilePromotionIds(supabase);
    const promotions = (data ?? []).map((p) => ({
      ...p,
      show_as_homepage_tile: linkedIds.has(p.id),
    }));

    return NextResponse.json({ promotions });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load promotions';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST — create a new promotion
export async function POST(req: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const {
    name,
    offer_type,
    buy_qty,
    get_qty,
    free_item_discount_percent,
    scope,
    collection_id,
    is_active,
    starts_at,
    ends_at,
    show_as_homepage_tile,
  } = body || {};

  if (!name || !String(name).trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }
  if (!buy_qty || buy_qty < 1 || !get_qty || get_qty < 1) {
    return NextResponse.json({ error: 'buy_qty and get_qty must be at least 1' }, { status: 400 });
  }
  if (scope === 'collection' && !collection_id) {
    return NextResponse.json(
      { error: 'collection_id is required when scope is "collection"' },
      { status: 400 }
    );
  }

  const supabase = getSupabaseAdmin();
  try {
    const resolvedScope = scope || 'all';
    const resolvedIsActive = is_active ?? true;

    const { data: inserted, error } = await supabase
      .from('promotions')
      .insert({
        name: String(name).trim(),
        offer_type: offer_type || 'buy_x_get_y',
        buy_qty,
        get_qty,
        free_item_discount_percent: free_item_discount_percent ?? 100,
        scope: resolvedScope,
        collection_id: resolvedScope === 'collection' ? collection_id : null,
        is_active: resolvedIsActive,
        starts_at: starts_at ?? null,
        ends_at: ends_at ?? null,
      })
      .select('id')
      .single();
    if (error) throw error;

    // Part 4a: auto-create the linked homepage tile if the checkbox
    // was checked. A failure here shouldn't fail the promotion save —
    // the admin can still flip it on later from the Promotions panel.
    if (inserted && show_as_homepage_tile) {
      try {
        await syncHomepageTileForPromotion(
          supabase,
          {
            id: inserted.id,
            buy_qty,
            get_qty,
            free_item_discount_percent: free_item_discount_percent ?? 100,
            scope: resolvedScope,
            is_active: resolvedIsActive,
          },
          true
        );
      } catch {
        // Non-fatal — see comment above.
      }
    }

    revalidatePath('/');
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create promotion';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
