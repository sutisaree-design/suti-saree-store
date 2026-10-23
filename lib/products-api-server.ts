import { getServerSupabase } from './supabase-server';
import { Product, ProductRow, CategoryRow, Category } from './types';

// Phase 2: keep in sync with CUSTOMER_SAFE_PRODUCT_COLUMNS in
// products-api.ts. mapRowToProduct() already drops vendor_id since it's
// not on the Product type, but selecting it explicitly here too means
// it's never even fetched for SSR'd customer pages.
export const CUSTOMER_SAFE_PRODUCT_COLUMNS = [
  'id', 'name', 'slug', 'description', 'price', 'mrp',
  'category_id', 'category_name', 'fabric', 'origin', 'colors', 'sizes',
  'occasion', 'gender', 'age_group', 'material', 'pattern', 'images',
  'video_url', 'autoplay_video_in_catalog', 'sku', 'highlights', 'stock_quantity', 'low_stock_threshold',
  'rating', 'reviews', 'featured', 'in_stock', 'created_at', 'updated_at',
].join(', ');

/** Pick the default colour variant off the embedded `product_variants` list
 *  (falls back to the first variant if none is explicitly marked default),
 *  so cards/listings can show and link to it instead of the base product. */
function resolveDefaultVariant(row: ProductRow) {
  const variants = row.product_variants ?? [];
  if (variants.length === 0) return null;
  return variants.find((v) => v.is_default) ?? variants[0];
}

/**
 * Every distinct colour this product comes in: the base product's own
 * `colors` entry plus every colour recorded on a `product_variants` row,
 * de-duplicated case-insensitively. Kept in sync with the identical helper
 * in lib/products-api.ts. A vendor's originally-listed colour only ever
 * lives on the `products` row itself -- never in `product_variants` -- so
 * without merging the two here, a product's card on shop/category pages
 * would only ever show colours added *after* the initial listing, silently
 * dropping the very first one.
 */
function resolveAllColors(row: ProductRow): string[] {
  const seen = new Set<string>();
  const all: string[] = [];
  for (const c of row.colors ?? []) {
    const key = c.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    all.push(c);
  }
  for (const v of row.product_variants ?? []) {
    const c = v.color;
    if (!c) continue;
    const key = c.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    all.push(c);
  }
  return all;
}

/** A colour variant's real stock: sum of its size rows. undefined when the size
 *  rows weren't loaded/don't exist (caller then falls back to the product's own flag). */
function variantInStock(v?: { product_variant_sizes?: { stock_quantity: number }[] | null } | null): boolean | undefined {
  const sizes = v?.product_variant_sizes;
  if (!Array.isArray(sizes) || sizes.length === 0) return undefined;
  return sizes.reduce((sum, s) => sum + (s.stock_quantity ?? 0), 0) > 0;
}

export function mapRowToProduct(row: ProductRow): Product {
  const defaultVariant = resolveDefaultVariant(row);
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    category: (row.category_name as Category) || 'Silk Sarees',
    price: row.price,
    mrp: row.mrp ?? undefined,
    description: row.description ?? '',
    fabric: row.fabric ?? '',
    origin: row.origin ?? '',
    colors: row.colors ?? [],
    all_colors: resolveAllColors(row),
    // Without this, productMatchesQuery() (lib/search-utils.ts) has no
    // per-variant colour/slug/image to match against on server-rendered
    // pages, so a search like "yellow saree" would find the product (via
    // all_colors) but could never resolve *which* variant is yellow --
    // silently falling back to the product's default variant image/slug
    // instead of the one the shopper actually searched for.
    variant_list: (row.product_variants ?? [])
      .filter((v) => !!v.color)
      .map((v) => ({ slug: v.slug, color: v.color as string, image: v.images?.[0] ?? null, inStock: variantInStock(v) })),
    sizes: row.sizes ?? ['Free Size'],
    occasion: row.occasion ?? [],
    gender: row.gender || 'female',
    age_group: row.age_group || 'adult',
    material: row.material ?? null,
    pattern: row.pattern ?? null,
    images: row.images ?? [],
    all_images: resolveAllImages(row),
    video_url: row.video_url ?? null,
    autoplay_video_in_catalog: row.autoplay_video_in_catalog ?? false,
    sku: row.sku ?? null,
    highlights: row.highlights ?? null,
    default_variant_slug: defaultVariant?.slug ?? null,
    default_variant_image: defaultVariant?.images?.[0] ?? null,
    default_variant_color: defaultVariant?.color ?? null,
    default_variant_in_stock: variantInStock(defaultVariant),
    // Preserve a real 0 (no reviews yet) instead of falling back to a fake
    // 4.5 -- `|| 4.5` was overriding a legit 0 because 0 is falsy in JS.
    rating: row.rating != null ? Number(row.rating) : 0,
    reviews: row.reviews ?? 0,
    featured: row.featured,
    stock_quantity: row.stock_quantity,
    low_stock_threshold: row.low_stock_threshold ?? 5,
    inStock: row.in_stock,
    created_at: row.created_at,
  };
}

/**
 * Every photo this product has anywhere: the base product's own `images`
 * plus every image on every `product_variants` row, de-duplicated. Kept in
 * sync with the identical helper in lib/products-api.ts. Without this, the
 * server-rendered /shop and /category pages would have no way to show or
 * link to a matched colour variant's own photo -- see `variant_list` below.
 */
function resolveAllImages(row: ProductRow): string[] {
  const seen = new Set<string>();
  const all: string[] = [];
  for (const img of row.images ?? []) {
    if (!img || seen.has(img)) continue;
    seen.add(img);
    all.push(img);
  }
  for (const v of row.product_variants ?? []) {
    for (const img of v.images ?? []) {
      if (!img || seen.has(img)) continue;
      seen.add(img);
      all.push(img);
    }
  }
  return all;
}

/**
 * Batch-attaches each product's vendor storefront collection (name + slug)
 * via the `product_collections` view -- kept in sync with the identical
 * helper in lib/products-api.ts. Avoids ever selecting `products.vendor_id`
 * in a customer-facing query. Products with no approved vendor simply get
 * `collection: null`.
 */
async function attachCollectionsServer(products: Product[]): Promise<Product[]> {
  if (products.length === 0) return products;
  const supabase = getServerSupabase();
  const { data, error } = await supabase
    .from('product_collections')
    .select('product_id, business_name, storefront_slug')
    .in('product_id', products.map((p) => p.id));
  if (error || !data) return products.map((p) => ({ ...p, collection: null }));
  const byId = new Map(
    data.map((row: any) => [row.product_id, { name: row.business_name, slug: row.storefront_slug }])
  );
  return products.map((p) => ({ ...p, collection: byId.get(p.id) ?? null }));
}

export async function fetchProductBySlugServer(slug: string): Promise<Product | null> {
  const supabase = getServerSupabase();
  const { data, error } = await supabase
    .from('products')
    .select(`${CUSTOMER_SAFE_PRODUCT_COLUMNS}, product_variants(slug, images, is_default, color, product_variant_sizes(stock_quantity))`)
    .eq('slug', slug)
    .eq('approval_status', 'live')
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const product = mapRowToProduct(data as unknown as ProductRow);
  const [withCollection] = await attachCollectionsServer([product]);
  return withCollection;
}

export async function fetchProductsServer(): Promise<Product[]> {
  const supabase = getServerSupabase();
  const { data, error } = await supabase
    .from('products')
    .select(`${CUSTOMER_SAFE_PRODUCT_COLUMNS}, product_variants(slug, images, is_default, color, product_variant_sizes(stock_quantity))`)
    .eq('approval_status', 'live')
    .order('created_at', { ascending: false });
  if (error) throw error;
  const products = (data as unknown as ProductRow[]).map(mapRowToProduct);
  return attachCollectionsServer(products);
}

/** Live products from a single category, for the "You might also like"
 *  grid at the end of a blog post. Excludes any slugs already featured
 *  as inline product cards earlier in the same post, so the grid adds
 *  new options instead of repeating what the reader already saw. */
export async function fetchProductsByCategoryServer(
  categoryName: string,
  opts: { limit?: number; excludeSlugs?: string[] } = {}
): Promise<Product[]> {
  const { limit = 4, excludeSlugs = [] } = opts;
  const supabase = getServerSupabase();
  let query = supabase
    .from('products')
    .select(`${CUSTOMER_SAFE_PRODUCT_COLUMNS}, product_variants(slug, images, is_default, color, product_variant_sizes(stock_quantity))`)
    .eq('category_name', categoryName)
    .eq('approval_status', 'live')
    .eq('in_stock', true)
    .order('featured', { ascending: false })
    .order('rating', { ascending: false })
    .limit(limit + excludeSlugs.length);
  const { data, error } = await query;
  if (error) throw error;
  const products = (data as unknown as ProductRow[])
    .map(mapRowToProduct)
    .filter((p) => !excludeSlugs.includes(p.slug))
    .slice(0, limit);
  return attachCollectionsServer(products);
}

/** Store-wide fallback for the "You might also like" grid on a blog post
 *  when the post has no `related_category_name` that resolves to a real
 *  category (the AI generator sometimes names a plausible-but-nonexistent
 *  category), or when that category simply has no live stock right now.
 *  Same shape/columns as fetchProductsByCategoryServer, just without the
 *  category filter, so the blog post always has a real catalog grid to
 *  show instead of silently rendering nothing. */
export async function fetchFeaturedProductsServer(
  opts: { limit?: number; excludeSlugs?: string[] } = {}
): Promise<Product[]> {
  const { limit = 4, excludeSlugs = [] } = opts;
  const supabase = getServerSupabase();
  const { data, error } = await supabase
    .from('products')
    .select(`${CUSTOMER_SAFE_PRODUCT_COLUMNS}, product_variants(slug, images, is_default, color, product_variant_sizes(stock_quantity))`)
    .eq('approval_status', 'live')
    .eq('in_stock', true)
    .order('featured', { ascending: false })
    .order('rating', { ascending: false })
    .limit(limit + excludeSlugs.length);
  if (error) throw error;
  const products = (data as unknown as ProductRow[])
    .map(mapRowToProduct)
    .filter((p) => !excludeSlugs.includes(p.slug))
    .slice(0, limit);
  return attachCollectionsServer(products);
}

export async function fetchCategoriesServer(): Promise<CategoryRow[]> {
  const supabase = getServerSupabase();
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .order('name', { ascending: true });
  if (error) throw error;
  return (data ?? []) as CategoryRow[];
}
