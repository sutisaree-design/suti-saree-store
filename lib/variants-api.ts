import { getSupabaseBrowser } from './supabase-browser';
import { getServerSupabase } from './supabase-server';
import { Product } from './types';

export interface VariantSize {
  id: string;
  size: string;
  stock_quantity: number;
  price_override: number | null;
  sku: string | null;
}

export interface ProductVariant {
  id: string;
  product_id: string;
  color: string;
  /** Hex swatch colour (e.g. "#7A1F2B") picked from the colour library, or
   *  typed manually for a custom colour. Used to render a real colour dot
   *  on the storefront when the variant has no image yet. */
  color_hex: string | null;
  slug: string;
  images: string[];
  /** Optional short fabric/drape/try-on video for this colour. */
  video: string | null;
  price_override: number | null;
  meta_title: string | null;
  meta_description: string | null;
  /** Unique on-page paragraph for this colour (styling tip / occasion
   *  note) — rendered in the PDP Description tab so the page's visible
   *  content differs between colours, not just its meta tags. Auto-filled
   *  by lib/variant-seo-content.ts when left blank. See migration
   *  20260902000000_variant_seo_style_note.sql. */
  style_note: string | null;
  is_default: boolean;
  sku: string | null;
  /** Per-colour rating/review-count override. NULL means "no override" --
   *  the storefront falls back to the base product's rating/reviews. */
  rating: number | null;
  reviews: number | null;
  created_at: string;
}

export interface VariantWithSizes extends ProductVariant {
  sizes: VariantSize[];
}

/** All colour variants for a product, used to render swatch links on the PDP. */
export async function fetchVariantsForProduct(productId: string): Promise<ProductVariant[]> {
  const supabase = getSupabaseBrowser();
  const { data, error } = await supabase
    .from('product_variants')
    .select('*')
    .eq('product_id', productId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as ProductVariant[];
}

/**
 * Same query as fetchVariantsForProduct above, but run on the server (from
 * app/product/[slug]/page.tsx) so the colour swatches are in the first HTML
 * instead of popping in after hydration (layout shift) and each visitor
 * skips one Supabase request.
 */
export async function fetchVariantsForProductServer(productId: string): Promise<ProductVariant[]> {
  const supabase = getServerSupabase();
  const { data, error } = await supabase
    .from('product_variants')
    .select('*')
    .eq('product_id', productId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as ProductVariant[];
}

/**
 * Look up a variant by its own SEO slug and return it together with its
 * parent product and per-size stock. Used for /product/[slug] when the
 * slug doesn't match a base product (i.e. it's a colour-specific page).
 * Works on both client and server (pass server=true from a Server Component).
 */
export async function fetchVariantBySlug(
  slug: string,
  server = false
): Promise<{ variant: VariantWithSizes; product: Product } | null> {
  const supabase = server ? getServerSupabase() : getSupabaseBrowser();

  const { data: variant, error } = await supabase
    .from('product_variants')
    .select('*, product_variant_sizes(*), products(*)')
    .eq('slug', slug)
    .maybeSingle();

  if (error) throw error;
  if (!variant) return null;

  const { products: productRow, product_variant_sizes, ...variantFields } = variant as any;
  if (!productRow) return null;

  const { mapRowToProduct } = server
    ? await import('./products-api-server')
    : await import('./products-api');

  return {
    variant: {
      ...(variantFields as ProductVariant),
      sizes: (product_variant_sizes ?? []) as VariantSize[],
    },
    product: mapRowToProduct(productRow),
  };
}

export async function createVariant(input: {
  productId: string;
  color: string;
  colorHex?: string | null;
  slug: string;
  images: string[];
  video?: string | null;
  priceOverride?: number | null;
  metaTitle?: string;
  metaDescription?: string;
  styleNote?: string;
  isDefault?: boolean;
  sku?: string | null;
  rating?: number | null;
  reviews?: number | null;
  sizes: { size: string; stockQuantity: number; priceOverride?: number | null; sku?: string | null }[];
}): Promise<ProductVariant> {
  // SECURITY: moved server-side (was a direct anon-key insert) — see
  // app/api/admin/variants/route.ts for why.
  const res = await fetch('/api/admin/variants', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Failed to create variant');
  return json.variant as ProductVariant;
}

/** Admin: fetch every colour variant for a product together with its per-size stock. */
export async function fetchVariantsWithSizes(productId: string): Promise<VariantWithSizes[]> {
  const supabase = getSupabaseBrowser();
  const { data, error } = await supabase
    .from('product_variants')
    .select('*, product_variant_sizes(*)')
    .eq('product_id', productId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row: any) => {
    const { product_variant_sizes, ...variant } = row;
    return { ...variant, sizes: (product_variant_sizes ?? []) as VariantSize[] } as VariantWithSizes;
  });
}

export async function updateVariant(
  id: string,
  input: Partial<{
    color: string;
    color_hex: string | null;
    slug: string;
    images: string[];
    video: string | null;
    price_override: number | null;
    meta_title: string | null;
    meta_description: string | null;
    style_note: string | null;
    is_default: boolean;
    sku: string | null;
    rating: number | null;
    reviews: number | null;
  }>
): Promise<ProductVariant> {
  // SECURITY: moved server-side — see app/api/admin/variants/[id]/route.ts.
  const res = await fetch(`/api/admin/variants/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Failed to update variant');
  return json.variant as ProductVariant;
}

/**
 * Marking a variant as the default unsets the flag on its siblings first,
 * since only one colour variant per product should show as default.
 */
export async function setDefaultVariant(productId: string, variantId: string): Promise<void> {
  // SECURITY: moved server-side — see app/api/admin/variants/[id]/route.ts.
  // setDefaultForProductId tells the route to clear the flag on siblings
  // first, same two-step behaviour as before.
  const res = await fetch(`/api/admin/variants/${variantId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ setDefaultForProductId: productId }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Failed to set default variant');
}

export async function deleteVariant(id: string): Promise<void> {
  // SECURITY: moved server-side — see app/api/admin/variants/[id]/route.ts.
  const res = await fetch(`/api/admin/variants/${id}`, { method: 'DELETE' });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Failed to delete variant');
}

export async function addVariantSize(input: {
  variantId: string;
  size: string;
  stockQuantity: number;
  priceOverride?: number | null;
  sku?: string | null;
}): Promise<VariantSize> {
  // SECURITY: moved server-side — see app/api/admin/variant-sizes/route.ts.
  const res = await fetch('/api/admin/variant-sizes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Failed to add size');
  return json.size as VariantSize;
}

export async function updateVariantSize(
  id: string,
  input: Partial<{ size: string; stock_quantity: number; price_override: number | null; sku: string | null }>
): Promise<VariantSize> {
  // SECURITY: moved server-side — see app/api/admin/variant-sizes/[id]/route.ts.
  const res = await fetch(`/api/admin/variant-sizes/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Failed to update size');
  return json.size as VariantSize;
}

export async function deleteVariantSize(id: string): Promise<void> {
  // SECURITY: moved server-side — see app/api/admin/variant-sizes/[id]/route.ts.
  const res = await fetch(`/api/admin/variant-sizes/${id}`, { method: 'DELETE' });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Failed to delete size');
}

export async function uploadVariantImage(file: File): Promise<string> {
  // Routed through the server /api/upload-image route (instead of uploading
  // the raw File straight to Supabase Storage from the browser with the
  // anon client) so the image actually gets run through sharp and
  // converted to real WebP before it's stored. This used to upload
  // whatever format the browser handed it (see the old implementation --
  // `file.name.split('.').pop()` -- which is exactly why variant images
  // added from the "Add colour"/"Add variation" panels were showing up as
  // .jpeg/.jpg instead of .webp even after the main product-image upload
  // path was fixed). See app/api/upload-image/route.ts for the actual
  // sharp conversion.
  const formData = new FormData();
  formData.append('file', file);
  formData.append('folder', 'variants');

  const res = await fetch('/api/upload-image', { method: 'POST', body: formData });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Image upload failed');
  return json.url as string;
}
