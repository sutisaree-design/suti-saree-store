import { AdminCollectionRow } from './types';

/** A collection tile for the public storefront (homepage "Shop by
 *  Collection" row) — only ever contains active collections that have
 *  at least one live product, each with a thumbnail pulled from that
 *  product. See app/api/collections/route.ts. */
export interface PublicCollectionRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  product_count: number;
  thumbnail: string | null;
}

/** Public, unauthenticated — every active collection with ≥1 live
 *  product. Safe to call from the homepage for any visitor. */
export async function fetchPublicCollections(): Promise<PublicCollectionRow[]> {
  const res = await fetch('/api/collections', { cache: 'no-store' });
  if (!res.ok) return [];
  const body = await res.json().catch(() => ({ collections: [] }));
  return (body.collections as PublicCollectionRow[]) ?? [];
}


/** One vendor's automatic "<Vendor>'s Collection" page -- read-only here;
 *  managed by approving/suspending the vendor on Admin > Vendors instead. */
export interface AdminVendorCollectionRow {
  id: string;
  name: string;
  slug: string;
  product_count: number;
  created_at: string;
}

/** Every approved vendor's auto-generated storefront collection, with a
 *  live product count each. */
export async function fetchAdminVendorCollections(): Promise<AdminVendorCollectionRow[]> {
  const res = await fetch('/api/admin/vendor-collections', { cache: 'no-store' });
  if (!res.ok) return parseError(res, 'Failed to load vendor collections');
  const body = await res.json();
  return body.collections as AdminVendorCollectionRow[];
}

async function parseError(res: Response, fallback: string): Promise<never> {
  const body = await res.json().catch(() => ({}));
  throw new Error(body?.error || fallback);
}

/** Every admin-managed collection, with a live product count each. */
export async function fetchAdminCollections(): Promise<AdminCollectionRow[]> {
  const res = await fetch('/api/admin/collections', { cache: 'no-store' });
  if (!res.ok) return parseError(res, 'Failed to load collections');
  const body = await res.json();
  return body.collections as AdminCollectionRow[];
}

/** One collection plus the ids of the products currently in it, and — per
 *  product id that has any — the list of variation slugs excluded from
 *  the collection ('base' for the product's own colour, otherwise a
 *  `product_variants.slug`). Products with no entry here show every
 *  variation they have. */
export async function fetchAdminCollection(
  id: string
): Promise<{
  collection: AdminCollectionRow;
  product_ids: string[];
  variant_exclusions: Record<string, string[]>;
}> {
  const res = await fetch(`/api/admin/collections/${id}`, { cache: 'no-store' });
  if (!res.ok) return parseError(res, 'Failed to load collection');
  const body = await res.json();
  return { ...body, variant_exclusions: body.variant_exclusions ?? {} };
}

export async function createAdminCollection(input: {
  name: string;
  slug?: string;
  description?: string | null;
  is_active?: boolean;
  show_on_homepage?: boolean;
  show_bogo_badge?: boolean;
  product_ids?: string[];
  variant_exclusions?: Record<string, string[]>;
}): Promise<AdminCollectionRow> {
  const res = await fetch('/api/admin/collections', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) return parseError(res, 'Failed to create collection');
  const body = await res.json();
  return body.collection as AdminCollectionRow;
}

export async function updateAdminCollection(
  id: string,
  input: Partial<{
    name: string;
    slug: string;
    description: string | null;
    is_active: boolean;
    show_on_homepage: boolean;
    show_bogo_badge: boolean;
    product_ids: string[];
    variant_exclusions: Record<string, string[]>;
  }>
): Promise<AdminCollectionRow> {
  const res = await fetch(`/api/admin/collections/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) return parseError(res, 'Failed to update collection');
  const body = await res.json();
  return body.collection as AdminCollectionRow;
}

export async function deleteAdminCollection(id: string): Promise<void> {
  const res = await fetch(`/api/admin/collections/${id}`, { method: 'DELETE' });
  if (!res.ok) return parseError(res, 'Failed to delete collection');
}
