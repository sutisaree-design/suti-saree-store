'use client';

import { supabase } from './supabase';
import { Product, ProductRow, CategoryRow, Category } from './types';

// ---------------------------------------------------------------------
// Phase 2 (vendor listings): `products` now also carries vendor_id,
// barcode, approval_status, vendor_expected_price, ai_suggested_price
// and final_price — all internal-only (admin / order-processing).
// These functions run in the BROWSER, so an explicit column list here
// isn't just tidy: it's the difference between the raw network
// response never containing vendor_id at all, vs. it briefly existing
// in the page's network tab before mapRowToProduct() below discards
// it. Never widen this back to select('*') for customer-facing reads.
// ---------------------------------------------------------------------
const CUSTOMER_SAFE_PRODUCT_COLUMNS = [
  'id', 'name', 'slug', 'description', 'price', 'mrp',
  'category_id', 'category_name', 'category_names', 'fabric', 'origin', 'colors', 'sizes',
  'occasion', 'gender', 'age_group', 'material', 'pattern', 'images',
  'video_url', 'autoplay_video_in_catalog', 'sku', 'highlights', 'stock_quantity', 'low_stock_threshold',
  'rating', 'reviews', 'featured', 'in_stock', 'created_at', 'updated_at', 'gst_rate',
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
 * Every photo this product has anywhere: the base product's own `images`
 * plus every image on every `product_variants` row, de-duplicated. Powers
 * "search by photo" matching against ALL colour variants instead of just
 * the base product's first photo (see lib/image-search.ts).
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
 * Every distinct colour this product comes in: the base product's own
 * `colors` entry plus every colour recorded on a `product_variants` row,
 * de-duplicated case-insensitively. A vendor's originally-listed colour
 * only ever lives on the `products` row itself -- never in
 * `product_variants` -- so without merging the two here, a product's card
 * on shop/category pages would only ever show colours added *after* the
 * initial listing, silently dropping the very first one.
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
    category: (row.category_name as Category) || 'Silk Sarees',    category_names: (row.category_names as string[] | null) ?? [],
    price: row.price,
    mrp: row.mrp ?? undefined,
    description: row.description ?? '',
    fabric: row.fabric ?? '',
    origin: row.origin ?? '',
    colors: row.colors ?? [],
    all_colors: resolveAllColors(row),
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
    gstRate: row.gst_rate != null ? Number(row.gst_rate) : undefined,
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
 * Batch-attaches each product's vendor storefront collection (name + slug)
 * via the `product_collections` view -- a safe, product_id-keyed lookup
 * that avoids ever selecting `products.vendor_id` in a customer-facing
 * query (see the comment on CUSTOMER_SAFE_PRODUCT_COLUMNS above). Mutates
 * nothing; returns new Product objects. Products with no approved vendor
 * (no matching row in the view) simply get `collection: null`.
 */
async function attachCollections(products: Product[]): Promise<Product[]> {
  if (products.length === 0) return products;
  const { data, error } = await supabase
    .from('product_collections')
    .select('product_id, business_name, storefront_slug')
    .in('product_id', products.map((p) => p.id));
  if (error || !data) return products.map((p) => ({ ...p, collection: null }));
  const bySlug = new Map(
    data.map((row: any) => [row.product_id, { name: row.business_name, slug: row.storefront_slug }])
  );
  return products.map((p) => ({ ...p, collection: bySlug.get(p.id) ?? null }));
}

export async function fetchProducts(): Promise<Product[]> {
  const { data, error } = await supabase
    .from('products')
    .select(`${CUSTOMER_SAFE_PRODUCT_COLUMNS}, product_variants(slug, images, is_default, color, product_variant_sizes(stock_quantity))`)
    .eq('approval_status', 'live')
    .order('created_at', { ascending: false });
  if (error) throw error;
  const products = (data as unknown as ProductRow[]).map(mapRowToProduct);
  return attachCollections(products);
}

/**
 * Prices only, for every LIVE product in one category -- used by the
 * product-page "Shop by Price" bar (components/product/price-quick-browse-bar.tsx)
 * to work out which admin-configured price buckets (lib/settings-api.ts:
 * PriceRangeBucket, via getAvailablePriceBuckets) actually have a matching
 * product in *this* product's own category, instead of listing every
 * bucket regardless of category. Selects only `price` -- no images,
 * variants, description, etc -- since that's the only field the bucket
 * check needs, and this fetch runs on every product page view.
 */
export async function fetchCategoryPrices(category: string): Promise<number[]> {
  const { data, error } = await supabase
    .from('products')
    .select('price')
    .eq('category_name', category)
    .eq('approval_status', 'live');
  if (error) throw error;
  return (data ?? []).map((row: { price: number }) => row.price);
}

export async function fetchProductBySlug(slug: string): Promise<Product | null> {
  const { data, error } = await supabase
    .from('products')
    .select(`${CUSTOMER_SAFE_PRODUCT_COLUMNS}, product_variants(slug, images, is_default, color, product_variant_sizes(stock_quantity))`)
    .eq('slug', slug)
    .eq('approval_status', 'live')
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const product = mapRowToProduct(data as unknown as ProductRow);
  const [withCollection] = await attachCollections([product]);
  return withCollection;
}

/** Used by the checkout order-bump (settings store a product id, not a slug). */
export async function fetchProductById(id: string): Promise<Product | null> {
  const { data, error } = await supabase
    .from('products')
    .select(CUSTOMER_SAFE_PRODUCT_COLUMNS)
    .eq('id', id)
    .eq('approval_status', 'live')
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return mapRowToProduct(data as unknown as ProductRow);
}

export async function fetchCategories(): Promise<CategoryRow[]> {
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .order('name', { ascending: true });
  if (error) throw error;
  return (data ?? []) as CategoryRow[];
}

// NOTE: categories INSERT/UPDATE/DELETE are locked to `service_role` by
// the 20260829040000 migration, so these now go through the admin API
// routes (server-side, service-role client) instead of writing directly
// from the browser with the anon key. SELECT (fetchCategories,
// countProductsInCategory below) stays on the anon client -- that's still
// public storefront data.
export async function createCategory(input: {
  name: string;
  slug: string;
  description?: string | null;
}): Promise<CategoryRow> {
  const res = await fetch('/api/admin/categories', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Failed to create category');
  return json.category as CategoryRow;
}

export async function updateCategory(
  id: string,
  input: Partial<{ name: string; slug: string; description: string | null }>
): Promise<CategoryRow> {
  const res = await fetch(`/api/admin/categories/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Failed to update category');
  return json.category as CategoryRow;
}

export async function deleteCategory(id: string): Promise<void> {
  const res = await fetch(`/api/admin/categories/${id}`, { method: 'DELETE' });
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(json.error || 'Failed to delete category');
  }
}

/** How many products currently reference this category — shown before delete. */
export async function countProductsInCategory(categoryId: string): Promise<number> {
  const { count, error } = await supabase
    .from('products')
    .select('id', { count: 'exact', head: true })
    .eq('category_id', categoryId);
  if (error) throw error;
  return count ?? 0;
}

/**
 * Supabase/Postgrest errors are plain objects (never `instanceof Error`),
 * so `err instanceof Error ? err.message : 'Save failed'` in the admin
 * panel was always falling through to the generic fallback and hiding
 * the real constraint/RLS violation message. This pulls a readable
 * message out of any shape we might catch.
 */
export function extractErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === 'object') {
    const anyErr = err as { message?: unknown; error_description?: unknown; details?: unknown; hint?: unknown };
    if (typeof anyErr.message === 'string' && anyErr.message) return anyErr.message;
    if (typeof anyErr.error_description === 'string' && anyErr.error_description) return anyErr.error_description;
    if (typeof anyErr.details === 'string' && anyErr.details) return anyErr.details;
    if (typeof anyErr.hint === 'string' && anyErr.hint) return anyErr.hint;
  }
  if (typeof err === 'string' && err) return err;
  return fallback;
}

// NOTE: `products` INSERT/UPDATE/DELETE (for admin-owned catalog rows) are
// locked to `service_role` by the 20260829040000 migration, so admin
// create/update/delete now go through the admin API routes (server-side,
// service-role client) instead of writing directly from the browser with
// the anon key. Vendor-side create/update (own_insert_vendor_products /
// own_update_vendor_products) are unaffected and still go through
// lib/vendor-api.ts as before. SELECT stays on the anon client -- that's
// still public storefront data.
export async function createProduct(input: Partial<ProductRow>): Promise<Product> {
  const res = await fetch('/api/admin/products', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Failed to create product');
  return mapRowToProduct(json.product as ProductRow);
}

export async function updateProduct(
  id: string,
  input: Partial<ProductRow>
): Promise<Product> {
  const res = await fetch(`/api/admin/products/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Failed to update product');
  return mapRowToProduct(json.product as ProductRow);
}

export async function deleteProduct(id: string): Promise<void> {
  const res = await fetch(`/api/admin/products/${id}`, { method: 'DELETE' });
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(json.error || 'Failed to delete product');
  }
}

export async function uploadProductImage(file: File, seoName?: string, folder?: 'products' | 'variants'): Promise<string> {
  // Routed through a server API route (instead of uploading the raw File
  // straight to Supabase Storage from the browser) so the image can be
  // run through sharp and actually converted to WebP -- sharp is a native
  // binary and can't run client-side. See app/api/upload-image/route.ts.
  const formData = new FormData();
  formData.append('file', file);
  if (seoName) formData.append('seoName', seoName);
  if (folder) formData.append('folder', folder);

  const res = await fetch('/api/upload-image', { method: 'POST', body: formData });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Image upload failed');
  return json.url as string;
}

export async function uploadProductVideo(file: File, seoName?: string): Promise<string> {
  // Videos upload DIRECTLY from the browser to Supabase Storage using a
  // short-lived signed upload URL/token minted by /api/upload-video
  // (admin-only, tiny JSON request/response). This deliberately does NOT
  // route the actual video bytes through the Vercel serverless function
  // the way uploadProductImage() above does for images -- Vercel's
  // Node.js functions have a hard ~4.5MB request body limit on every
  // plan, which can't be raised from app code. Product videos routinely
  // exceed that, so sending the file body through a Vercel route (as
  // this function previously did) failed with a generic "Video upload
  // failed" for any video over ~4.5MB, even though this 45MB check
  // below allowed it. Only the signed-token request (tiny) and the
  // direct-to-storage upload (which goes straight to Supabase, not
  // Vercel) happen now.
  const MAX_BYTES = 45 * 1024 * 1024; // keep in sync with the product-videos bucket's 50MB cap
  if (file.size > MAX_BYTES) {
    throw new Error('Video is too large (max 45MB).');
  }

  const res = await fetch('/api/upload-video', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ seoName, contentType: file.type || 'video/mp4' }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Video upload failed');

  // /api/upload-video returns a different shape depending on which
  // storage provider is active (STORAGE_PROVIDER env var, see lib/storage.ts).
  if (json.provider === 'r2') {
    const { uploadUrl, url } = json as { uploadUrl: string; url: string };
    const putRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': file.type || 'video/mp4' },
      body: file,
    });
    if (!putRes.ok) throw new Error('Video upload failed');
    return url;
  }

  const { path, token, url } = json as { path: string; token: string; url: string };
  const { error: uploadError } = await supabase.storage
    .from('product-videos')
    .uploadToSignedUrl(path, token, file);
  if (uploadError) throw new Error(uploadError.message || 'Video upload failed');

  // Best-effort R2 mirror. Direct-to-Supabase uploads (this whole function)
  // never touch R2 on their own -- see lib/storage.ts's createDirectUploadTarget
  // comment -- which left videos uploaded this way relying entirely on the
  // Supabase copy. Fire this and don't await/block the caller on it: a slow
  // or failed mirror should never hold up "Save product", and the video
  // still plays either way via the /media/ proxy's normal fallback.
  fetch('/api/upload-video/confirm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, contentType: file.type || 'video/mp4' }),
  }).catch(() => {
    // Non-blocking -- see comment above.
  });

  return url;
}
