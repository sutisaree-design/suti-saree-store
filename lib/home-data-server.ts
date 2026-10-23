import { getServerSupabase } from './supabase-server';
import { getSupabaseAdmin } from './supabase-admin';
import { fetchProductsServer, fetchCategoriesServer } from './products-api-server';
import { fetchPublicCollectionsServer, PublicCollectionRow } from './collections-api-server';
import { Product, CategoryRow } from './types';
import { HomepageTile } from './homepage-tiles-api';
import { HeroBanner } from './hero-banners-api';
import { fetchDiscoverProductsServer, fetchDiscoverCategoryCountsServer, DiscoverSectionSettings, DEFAULT_DISCOVER_SETTINGS } from './discover-products-api';

export interface HomeBanner {
  image_url: string;
  link_url?: string;
}

export interface HomeData {
  products: Product[];
  categories: CategoryRow[];
  banner: HomeBanner | null;
  freeShippingThreshold: number | null;
  collections: PublicCollectionRow[];
  tiles: HomepageTile[];
  heroBanners: HeroBanner[];
  collectionSlugById: Record<string, string>;
  /** Part 4b: promotion id -> collection slug, for tiles with
   *  link_type='promotion' to route "Shop Now" straight to the
   *  promotion's collection page. */
  promotionCollectionSlugById: Record<string, string>;
  /** "Discover Products For You" section (Admin > Discover Products) —
   *  settings plus its first page of products/hasMore, fetched server
   *  side so the section renders on first load with no loading flash.
   *  The client-side DiscoverProductsSection re-fetches further
   *  pages/filters from /api/discover-products. */
  discoverSettings: DiscoverSectionSettings;
  discoverInitialProducts: Product[];
  discoverInitialHasMore: boolean;
  /** Category -> live product count across the whole Discover Products
   *  set, used to hide empty category pills from that section's filter
   *  bar (see fetchDiscoverCategoryCountsServer). */
  discoverCategoryCounts: Record<string, number>;
}

async function fetchHomeBanner(): Promise<HomeBanner | null> {
  try {
    const supabase = getServerSupabase();
    const { data } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'site_banner')
      .maybeSingle();
    const banner = data?.value as Partial<HomeBanner> | undefined;
    if (!banner?.image_url) return null;
    return { image_url: banner.image_url, link_url: banner.link_url };
  } catch {
    return null;
  }
}

async function fetchHomeFreeShippingThreshold(): Promise<number | null> {
  try {
    const supabase = getServerSupabase();
    const { data } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'shipping')
      .maybeSingle();
    const threshold = (data?.value as { free_shipping_threshold?: number } | undefined)
      ?.free_shipping_threshold;
    return threshold || null;
  } catch {
    return null;
  }
}

// Server-only read of the homepage grid tiles (Part 3b2) — deliberately
// does NOT reuse fetchActiveHomepageTiles from lib/homepage-tiles-api.ts,
// since that one goes through the browser-only client in lib/supabase.ts
// and isn't safe to call from a server component. Same "fail quiet"
// approach as fetchHomeBanner above: a tiles failure should never break
// the rest of the homepage.
async function fetchHomeTiles(): Promise<HomepageTile[]> {
  try {
    const supabase = getServerSupabase();
    const { data, error } = await supabase
      .from('homepage_tiles')
      .select('*')
      .eq('is_active', true)
      .order('position', { ascending: true });
    if (error) throw error;
    return (data ?? []) as HomepageTile[];
  } catch {
    return [];
  }
}

// Server-only read of the hero banner carousel — deliberately does NOT
// reuse fetchActiveHeroBanners from lib/hero-banners-api.ts, since that
// one goes through the browser-only client in lib/supabase.ts and isn't
// safe to call from a server component. Same "fail quiet" approach as
// fetchHomeBanner/fetchHomeTiles above: a banners failure should never
// break the rest of the homepage.
async function fetchHeroBanners(): Promise<HeroBanner[]> {
  try {
    const supabase = getServerSupabase();
    const { data, error } = await supabase
      .from('hero_banners')
      .select('*')
      .eq('is_active', true)
      .order('position', { ascending: true });
    if (error) throw error;
    return (data ?? []) as HeroBanner[];
  } catch {
    return [];
  }
}

// id -> slug lookup for every active collection, used by the homepage
// grid to resolve link_type='collection' tiles to /collection/[slug]
// without shipping the whole collections payload to the client.
async function fetchCollectionSlugMap(): Promise<Record<string, string>> {
  try {
    // collections has no anon/authenticated RLS policy (service-role only
    // by design — see 20260814000000_admin_collections.sql), so this must
    // use the admin client. Using the anon client here silently returns
    // zero rows (RLS filters everything out, no error thrown), which was
    // making every link_type='collection' and link_type='promotion'
    // homepage tile permanently unresolvable/non-clickable.
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('collections')
      .select('id, slug')
      .eq('is_active', true);
    if (error) throw error;
    const map: Record<string, string> = {};
    for (const row of data ?? []) {
      map[row.id as string] = row.slug as string;
    }
    return map;
  } catch {
    return {};
  }
}

// Part 4b: promotion id -> collection slug, so a homepage_tiles row with
// link_type='promotion' (auto-linked in Part 4a via source_promotion_id)
// can route "Shop Now" to the promotion's own collection page instead of
// rendering as a dead/non-clickable card. Only scope='collection'
// promotions ever get shown as a tile (see
// lib/promotion-homepage-tile-sync.ts), so every row read here has a
// collection_id to resolve. Reuses fetchCollectionSlugMap's id->slug map
// rather than joining in SQL, since that map is already being fetched for
// link_type='collection' tiles in the same Promise.all below.
async function fetchPromotionCollectionSlugMap(
  collectionSlugById: Record<string, string>
): Promise<Record<string, string>> {
  try {
    const supabase = getServerSupabase();
    const { data, error } = await supabase
      .from('promotions')
      .select('id, collection_id')
      .eq('scope', 'collection')
      .eq('is_active', true);
    if (error) throw error;
    const map: Record<string, string> = {};
    for (const row of data ?? []) {
      const collectionId = row.collection_id as string | null;
      const slug = collectionId ? collectionSlugById[collectionId] : undefined;
      if (slug) map[row.id as string] = slug;
    }
    return map;
  } catch {
    return {};
  }
}

/**
 * Everything the homepage needs — products, categories, the store banner,
 * the free-shipping threshold, curated collections, and the homepage grid
 * tiles (plus the collection id->slug map those tiles link through, and
 * the promotion id->collection-slug map promotion-linked tiles link
 * through) — fetched together server-side in one Promise.all, instead of
 * home-client.tsx firing independent client-side useEffect fetches after
 * hydration (which made the page visibly load in pieces: banner, then
 * collections, then products, each popping in at a different moment). The
 * page now arrives with everything already rendered.
 */
// Server-only read of the Discover Products section's first page — same
// "fail quiet" approach as fetchHomeTiles/fetchHeroBanners above: a
// Discover Products failure (e.g. settings row not created yet on a
// fresh DB) should never break the rest of the homepage, it should just
// fall back to the section's defaults with an empty product list (which
// DiscoverProductsSection/home-client.tsx already render as "nothing").
async function fetchHomeDiscoverProducts(): Promise<{
  settings: DiscoverSectionSettings;
  products: Product[];
  hasMore: boolean;
}> {
  try {
    const result = await fetchDiscoverProductsServer({ page: 1 });
    return result;
  } catch {
    return { settings: DEFAULT_DISCOVER_SETTINGS, products: [], hasMore: false };
  }
}

export async function fetchHomeData(): Promise<HomeData> {
  const [
    products,
    categories,
    banner,
    freeShippingThreshold,
    collections,
    tiles,
    heroBanners,
    collectionSlugById,
    discover,
    discoverCategoryCounts,
  ] = await Promise.all([
    fetchProductsServer(),
    fetchCategoriesServer(),
    fetchHomeBanner(),
    fetchHomeFreeShippingThreshold(),
    fetchPublicCollectionsServer(),
    fetchHomeTiles(),
    fetchHeroBanners(),
    fetchCollectionSlugMap(),
    fetchHomeDiscoverProducts(),
    fetchDiscoverCategoryCountsServer(),
  ]);

  const promotionCollectionSlugById = await fetchPromotionCollectionSlugMap(collectionSlugById);

  return {
    products,
    categories,
    banner,
    freeShippingThreshold,
    collections,
    tiles,
    heroBanners,
    collectionSlugById,
    promotionCollectionSlugById,
    discoverSettings: discover.settings,
    discoverInitialProducts: discover.products,
    discoverInitialHasMore: discover.hasMore,
    discoverCategoryCounts,
  };
}
