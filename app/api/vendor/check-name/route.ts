import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { slugifyName } from '@/lib/collection-slug';

/**
 * GET /api/vendor/check-name?name=...
 *
 * Public, unauthenticated -- backs the live "this name is already in use"
 * warning on the /sell-with-us application form. Compares the slugified
 * form of `name` against every approved vendor's business name and every
 * active admin collection's name (both would end up sharing the same
 * base /collection/[slug] slug). Only ever returns the same name+slug
 * that's already publicly visible on that vendor's/collection's own page
 * -- nothing more sensitive.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const name = (searchParams.get('name') || '').trim();
  const base = slugifyName(name);
  if (!base) {
    return NextResponse.json({ conflict: null });
  }

  const admin = getSupabaseAdmin();

  try {
    const { data: vendors, error: vendorsErr } = await admin
      .from('vendor_public_profiles')
      .select('business_name, storefront_slug');
    if (vendorsErr) throw vendorsErr;

    const vendorHit = (vendors ?? []).find((v) => slugifyName(v.business_name) === base);
    if (vendorHit) {
      return NextResponse.json({
        conflict: { name: vendorHit.business_name, slug: vendorHit.storefront_slug, type: 'vendor' },
      });
    }

    const { data: collections, error: collectionsErr } = await admin
      .from('collections')
      .select('name, slug')
      .eq('is_active', true);
    if (collectionsErr) throw collectionsErr;

    const collectionHit = (collections ?? []).find((c) => slugifyName(c.name) === base);
    if (collectionHit) {
      return NextResponse.json({
        conflict: { name: collectionHit.name, slug: collectionHit.slug, type: 'collection' },
      });
    }

    return NextResponse.json({ conflict: null });
  } catch {
    // Never block the form on this check failing.
    return NextResponse.json({ conflict: null });
  }
}
