import type { SupabaseClient } from '@supabase/supabase-js';

/** Lowercase, hyphenated, alnum-only slug from a display name. */
export const slugifyName = (s: string) =>
  s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');

/**
 * Finds a unique slug for the shared /collection/[slug] URL space (both
 * vendor storefronts and admin-curated collections live there -- see
 * app/api/collection/[slug]/route.ts). Always prefers the clean
 * name-derived slug; only appends `-2`, `-3`, ... on an actual collision,
 * instead of unconditionally tacking on a random id suffix.
 *
 * `excludeVendorId` lets a vendor keep its own already-assigned slug when
 * re-checking (e.g. re-approving after a suspension).
 */
export async function generateUniqueCollectionSlug(
  admin: SupabaseClient,
  name: string,
  opts?: { excludeVendorId?: string }
): Promise<string> {
  const base = slugifyName(name) || 'store';
  let slug = base;
  let suffix = 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const [{ data: vendorHit }, { data: collectionHit }] = await Promise.all([
      admin.from('vendors').select('id').eq('storefront_slug', slug).maybeSingle(),
      admin.from('collections').select('id').eq('slug', slug).maybeSingle(),
    ]);
    const vendorClash = vendorHit && vendorHit.id !== opts?.excludeVendorId;
    if (!vendorClash && !collectionHit) return slug;
    suffix += 1;
    slug = `${base}-${suffix}`;
  }
}
