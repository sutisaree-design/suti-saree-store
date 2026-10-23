import { supabase } from '@/lib/supabase';
import { Product } from '@/lib/types';

// ---------------------------------------------------------------------
// Section settings — one JSON row in the generic `settings` table, same
// pattern as `price_range_filters` (see lib/settings-api.ts). No extra
// migration needed for this part; `discover_picks` (the manual curated
// list) is the only new table — see the 20260930030000 migration.
// ---------------------------------------------------------------------

export type DiscoverSectionMode = 'auto' | 'manual';
export type DiscoverSectionSort = 'popularity' | 'newest';

export interface DiscoverSectionSettings {
  enabled: boolean;
  title: string;
  subtitle: string | null;
  mode: DiscoverSectionMode;
  sort: DiscoverSectionSort;
  page_size: number;
  show_category_filter: boolean;
  show_price_filter: boolean;
}

export const DEFAULT_DISCOVER_SETTINGS: DiscoverSectionSettings = {
  enabled: true,
  title: 'Discover Products For You',
  subtitle: null,
  mode: 'auto',
  sort: 'popularity',
  page_size: 12,
  show_category_filter: true,
  show_price_filter: true,
};

const DISCOVER_SETTINGS_KEY = 'discover_section_settings';

export async function fetchDiscoverSettingsAdmin(): Promise<DiscoverSectionSettings> {
  const { data, error } = await supabase
    .from('settings')
    .select('value')
    .eq('key', DISCOVER_SETTINGS_KEY)
    .maybeSingle();
  if (error || !data) return DEFAULT_DISCOVER_SETTINGS;
  const value = data.value as Partial<DiscoverSectionSettings> | null;
  if (!value || typeof value !== 'object') return DEFAULT_DISCOVER_SETTINGS;
  return { ...DEFAULT_DISCOVER_SETTINGS, ...value };
}

export async function saveDiscoverSettings(settings: DiscoverSectionSettings): Promise<void> {
  const { error } = await supabase
    .from('settings')
    .upsert({ key: DISCOVER_SETTINGS_KEY, value: settings }, { onConflict: 'key' });
  if (error) throw error;
}

// ---------------------------------------------------------------------
// Manual picks — admin management (Admin > Discover Products tab)
// ---------------------------------------------------------------------

export interface DiscoverPickRow {
  id: string;
  product_id: string;
  position: number;
  is_active: boolean;
  created_at?: string;
  // Joined display fields for the admin table — populated by the
  // /api/admin/discover-products GET route.
  product_name?: string;
  product_image?: string | null;
  product_price?: number | null;
  product_slug?: string | null;
}

export async function fetchDiscoverPicksAdmin(): Promise<DiscoverPickRow[]> {
  const res = await fetch('/api/admin/discover-products');
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'Failed to load discover picks');
  return (body.picks ?? []) as DiscoverPickRow[];
}

async function adminDiscoverRequest(url: string, options: RequestInit) {
  const res = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'Request failed');
  return body;
}

export async function addDiscoverPick(product_id: string): Promise<void> {
  await adminDiscoverRequest('/api/admin/discover-products', {
    method: 'POST',
    body: JSON.stringify({ product_id }),
  });
}

export async function removeDiscoverPick(id: string): Promise<void> {
  await adminDiscoverRequest(`/api/admin/discover-products/${id}`, { method: 'DELETE' });
}

export async function setDiscoverPickActive(id: string, is_active: boolean): Promise<void> {
  await adminDiscoverRequest(`/api/admin/discover-products/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ is_active }),
  });
}

// Persists a new order for all (or a subset of) picks in one batch call —
// used by the up/down reorder buttons in the admin panel.
export async function reorderDiscoverPicks(orderedIds: string[]): Promise<void> {
  await adminDiscoverRequest('/api/admin/discover-products/reorder', {
    method: 'PATCH',
    body: JSON.stringify({ orderedIds }),
  });
}

// ---------------------------------------------------------------------
// Storefront (public) — used by /api/discover-products (server route) and
// by the SSR home-data loader for the first page. Mirrors the query
// conditions lib/products-api-server.ts already uses for "live" products
// (approval_status = 'live'), and reuses that file's row -> Product
// mapper so this can never drift out of sync with the rest of the site.
// ---------------------------------------------------------------------

export interface FetchDiscoverProductsParams {
  category?: string;
  priceMin?: number;
  priceMax?: number;
  page?: number; // 1-based
  pageSize?: number;
}

export interface FetchDiscoverProductsResult {
  products: Product[];
  hasMore: boolean;
  settings: DiscoverSectionSettings;
}

/**
 * Server-only — call this from app/api/discover-products/route.ts and
 * from the homepage's server-side data loader (lib/home-data-server.ts).
 * Not imported by client components directly (it uses the server
 * Supabase client), same convention as fetchProductsServer() etc. in
 * lib/products-api-server.ts.
 */
export async function fetchDiscoverProductsServer(
  params: FetchDiscoverProductsParams = {}
): Promise<FetchDiscoverProductsResult> {
  // Imported lazily inside the function body (not at module top-level)
  // so this file stays safe to import from client components too — only
  // this function pulls in server-only Supabase code.
  const { getServerSupabase } = await import('@/lib/supabase-server');
  const { mapRowToProduct, CUSTOMER_SAFE_PRODUCT_COLUMNS } = await import(
    '@/lib/products-api-server'
  );

  const settings = await fetchDiscoverSettingsAdminServer();
  const page = Math.max(1, params.page ?? 1);
  const pageSize = params.pageSize ?? settings.page_size ?? 12;
  const from = (page - 1) * pageSize;
  const to = from + pageSize; // fetch one extra row to know if there's more

  const db = getServerSupabase();

  if (settings.mode === 'manual') {
    let query = db
      .from('discover_picks')
      .select(
        `position, products!inner(${CUSTOMER_SAFE_PRODUCT_COLUMNS}, product_variants(slug, images, is_default, color, product_variant_sizes(stock_quantity)))`
      )
      .eq('is_active', true)
      .eq('products.approval_status', 'live')
      .order('position', { ascending: true });

    if (params.category) query = query.eq('products.category_name', params.category);
    if (params.priceMin !== undefined) query = query.gte('products.price', params.priceMin);
    if (params.priceMax !== undefined) query = query.lte('products.price', params.priceMax);

    const { data, error } = await query;
    if (error) throw error;
    const rows = (data ?? []).map((r: any) => r.products).filter(Boolean);
    const page_rows = rows.slice(from, to);
    const products = page_rows.map((row: any) => mapRowToProduct(row));
    return { products, hasMore: rows.length > to, settings };
  }

  // 'auto' mode
  let query = db
    .from('products')
    .select(`${CUSTOMER_SAFE_PRODUCT_COLUMNS}, product_variants(slug, images, is_default, color, product_variant_sizes(stock_quantity))`)
    .eq('approval_status', 'live')
    .eq('in_stock', true);

  if (params.category) query = query.eq('category_name', params.category);
  if (params.priceMin !== undefined) query = query.gte('price', params.priceMin);
  if (params.priceMax !== undefined) query = query.lte('price', params.priceMax);

  if (settings.sort === 'newest') {
    query = query.order('created_at', { ascending: false });
  } else {
    // 'popularity' — same ordering the rest of the storefront uses when it
    // doesn't have a dedicated popularity table to join (see
    // fetchFeaturedProductsServer in lib/products-api-server.ts).
    query = query.order('featured', { ascending: false }).order('rating', { ascending: false });
  }

  query = query.range(from, to); // inclusive range, so `to` gives us 1 extra row

  const { data, error } = await query;
  if (error) throw error;
  const rows = (data ?? []) as any[];
  const hasMore = rows.length > pageSize;
  const products = rows.slice(0, pageSize).map((row) => mapRowToProduct(row));
  return { products, hasMore, settings };
}

/**
 * Category -> live product count across the *entire* eligible Discover
 * Products set (auto-mode's in-stock/live catalog, or manual mode's active
 * picks) — ignores the category/price filters themselves, same way
 * home-client.tsx's `categoryCounts` ignores the "Shop by Category" row's
 * own filters. Used to hide any category pill from the Discover section's
 * filter bar that would otherwise land the shopper on an empty grid (see
 * DiscoverProductsSection's `visibleCategoryNames`).
 */
export async function fetchDiscoverCategoryCountsServer(): Promise<Record<string, number>> {
  const { getServerSupabase } = await import('@/lib/supabase-server');
  const db = getServerSupabase();
  const settings = await fetchDiscoverSettingsAdminServer();
  const counts: Record<string, number> = {};

  try {
    if (settings.mode === 'manual') {
      const { data, error } = await db
        .from('discover_picks')
        .select('products!inner(category_name, approval_status)')
        .eq('is_active', true)
        .eq('products.approval_status', 'live');
      if (error) throw error;
      for (const row of (data ?? []) as any[]) {
        const name = row.products?.category_name as string | undefined;
        if (!name) continue;
        counts[name] = (counts[name] ?? 0) + 1;
      }
      return counts;
    }

    const { data, error } = await db
      .from('products')
      .select('category_name')
      .eq('approval_status', 'live')
      .eq('in_stock', true);
    if (error) throw error;
    for (const row of (data ?? []) as any[]) {
      const name = row.category_name as string | undefined;
      if (!name) continue;
      counts[name] = (counts[name] ?? 0) + 1;
    }
    return counts;
  } catch {
    // Fail quiet — an empty map just means the filter bar shows every
    // category, same as before this feature existed.
    return {};
  }
}

/** Server-side settings read (service-role bypasses the anon RLS read,
 *  and this needs to work even before the storefront anon-write policy
 *  exists for this key on a fresh DB). Falls back to the client-safe
 *  fetchDiscoverSettingsAdmin() shape either way. */
async function fetchDiscoverSettingsAdminServer(): Promise<DiscoverSectionSettings> {
  const { getServerSupabase } = await import('@/lib/supabase-server');
  const db = getServerSupabase();
  const { data, error } = await db
    .from('settings')
    .select('value')
    .eq('key', DISCOVER_SETTINGS_KEY)
    .maybeSingle();
  if (error || !data) return DEFAULT_DISCOVER_SETTINGS;
  const value = data.value as Partial<DiscoverSectionSettings> | null;
  if (!value || typeof value !== 'object') return DEFAULT_DISCOVER_SETTINGS;
  return { ...DEFAULT_DISCOVER_SETTINGS, ...value };
}
