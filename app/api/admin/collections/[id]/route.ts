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

const slugify = (s: string) =>
  s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');

// GET — one collection plus the ids of the products currently in it, for
// the edit dialog's product picker.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = getSupabaseAdmin();

  try {
    const { data: collection, error } = await admin
      .from('collections')
      .select('*')
      .eq('id', params.id)
      .maybeSingle();
    if (error) throw error;
    if (!collection) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const { data: links, error: linksErr } = await admin
      .from('collection_products')
      .select('product_id, excluded_variant_slugs')
      .eq('collection_id', params.id)
      .order('position', { ascending: true });
    if (linksErr) throw linksErr;

    // Only include entries that actually exclude something, so the client
    // doesn't have to special-case an empty array per product.
    const variantExclusions: Record<string, string[]> = {};
    for (const l of links ?? []) {
      if (l.excluded_variant_slugs && l.excluded_variant_slugs.length > 0) {
        variantExclusions[l.product_id] = l.excluded_variant_slugs;
      }
    }

    return NextResponse.json({
      collection,
      product_ids: (links ?? []).map((l) => l.product_id),
      variant_exclusions: variantExclusions,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load collection';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// PUT — update name/slug/description/is_active and/or fully replace the
// product list (simplest correct approach: delete all links, re-insert the
// submitted list in order, so reordering/adding/removing all work the same
// way from one save).
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const admin = getSupabaseAdmin();

  try {
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (typeof body?.name === 'string' && body.name.trim()) updates.name = body.name.trim();
    if (typeof body?.description === 'string') updates.description = body.description.trim() || null;
    if (body?.description === null) updates.description = null;
    if (typeof body?.is_active === 'boolean') updates.is_active = body.is_active;
    if (typeof body?.show_on_homepage === 'boolean') updates.show_on_homepage = body.show_on_homepage;
    if (typeof body?.show_bogo_badge === 'boolean') updates.show_bogo_badge = body.show_bogo_badge;

    if (typeof body?.slug === 'string' && body.slug.trim()) {
      const baseSlug = slugify(body.slug.trim());
      let slug = baseSlug;
      let suffix = 1;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const [{ data: collisionCollection }, { data: collisionVendor }] = await Promise.all([
          admin.from('collections').select('id').eq('slug', slug).neq('id', params.id).maybeSingle(),
          admin.from('vendors').select('id').eq('storefront_slug', slug).maybeSingle(),
        ]);
        if (!collisionCollection && !collisionVendor) break;
        suffix += 1;
        slug = `${baseSlug}-${suffix}`;
      }
      updates.slug = slug;
    }

    const { data: collection, error } = await admin
      .from('collections')
      .update(updates)
      .eq('id', params.id)
      .select('*')
      .single();
    if (error) throw error;

    if (Array.isArray(body?.product_ids)) {
      const productIds: string[] = body.product_ids.filter((id: unknown) => typeof id === 'string');
      // Per-product list of excluded variation slugs ('base' for the
      // product's own colour, otherwise a `product_variants.slug`) — lets
      // the admin drop specific colour variations from a product without
      // dropping the whole product. See the picker in collections-panel.tsx.
      const variantExclusions: Record<string, unknown> =
        body?.variant_exclusions && typeof body.variant_exclusions === 'object' ? body.variant_exclusions : {};

      const { error: deleteErr } = await admin.from('collection_products').delete().eq('collection_id', params.id);
      if (deleteErr) throw deleteErr;
      if (productIds.length > 0) {
        const rows = productIds.map((product_id, idx) => {
          const raw = variantExclusions[product_id];
          const excluded_variant_slugs = Array.isArray(raw)
            ? raw.filter((s: unknown): s is string => typeof s === 'string')
            : [];
          return {
            collection_id: params.id,
            product_id,
            position: idx,
            excluded_variant_slugs,
          };
        });
        const { error: insertErr } = await admin.from('collection_products').insert(rows);
        if (insertErr) throw insertErr;
      }
    }

    const { count } = await admin
      .from('collection_products')
      .select('product_id', { count: 'exact', head: true })
      .eq('collection_id', params.id);

    revalidatePath('/');
    return NextResponse.json({ success: true, collection: { ...collection, product_count: count ?? 0 } });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update collection';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE — removes the collection; collection_products rows cascade.
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = getSupabaseAdmin();

  try {
    const { error } = await admin.from('collections').delete().eq('id', params.id);
    if (error) throw error;
    revalidatePath('/');
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to delete collection';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
