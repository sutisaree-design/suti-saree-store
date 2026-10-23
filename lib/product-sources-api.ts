// Admin-only client for the hidden Product Sources feature. Every call
// here goes through /api/admin/product-sources/* — server routes backed
// by the service-role client against tables that have ZERO anon /
// authenticated RLS policies (see the 20260910000000 migration). None of
// this is ever fetched by the storefront, sitemap, robots-visible pages,
// or the Google Merchant Center feed.

export interface ProductSource {
  id: string;
  name: string;
  whatsapp_name: string | null;
  whatsapp_number: string | null;
  source_date: string;
  notes: string | null;
  product_count: number;
  created_at: string;
  updated_at: string;
}

export interface ProductSourceInput {
  name: string;
  whatsapp_name?: string | null;
  whatsapp_number?: string | null;
  source_date?: string | null; // ISO string; defaults to "now" server-side
  notes?: string | null;
}

export interface ProductSourceLinkedProduct {
  id: string;
  name: string;
  slug: string;
  sku: string | null;
  images: string[];
  price: number;
  stock_quantity: number;
  in_stock: boolean;
  buy_price: number | null;
}

async function adminRequest(url: string, options?: RequestInit) {
  const res = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options?.headers || {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'Request failed');
  return body;
}

// ---------------------------------------------------------------------
// Source directory (Admin -> Product Sources panel)
// ---------------------------------------------------------------------

export async function fetchProductSources(filters?: { q?: string; from?: string; to?: string }): Promise<ProductSource[]> {
  const params = new URLSearchParams();
  if (filters?.q) params.set('q', filters.q);
  if (filters?.from) params.set('from', filters.from);
  if (filters?.to) params.set('to', filters.to);
  const qs = params.toString();
  const body = await adminRequest(`/api/admin/product-sources${qs ? `?${qs}` : ''}`);
  return (body.sources ?? []) as ProductSource[];
}

export async function createProductSource(input: ProductSourceInput): Promise<ProductSource> {
  const body = await adminRequest('/api/admin/product-sources', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return body.source as ProductSource;
}

export async function updateProductSource(id: string, input: Partial<ProductSourceInput>): Promise<ProductSource> {
  const body = await adminRequest(`/api/admin/product-sources/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
  return body.source as ProductSource;
}

export async function deleteProductSource(id: string): Promise<void> {
  await adminRequest(`/api/admin/product-sources/${id}`, { method: 'DELETE' });
}

export async function fetchProductSourceDetail(
  id: string
): Promise<{ source: ProductSource; products: ProductSourceLinkedProduct[] }> {
  const body = await adminRequest(`/api/admin/product-sources/${id}`);
  return { source: body.source, products: body.products ?? [] };
}

// ---------------------------------------------------------------------
// Per-product sourcing (Admin -> Products form: Source select + Buy Price)
// ---------------------------------------------------------------------

export interface ProductSourcing {
  product_source_id: string | null;
  buy_price: number | null;
}

export async function fetchProductSourcing(productId: string): Promise<ProductSourcing> {
  const body = await adminRequest(`/api/admin/product-sources/product/${productId}`);
  return { product_source_id: body.product_source_id ?? null, buy_price: body.buy_price ?? null };
}

export async function saveProductSourcing(productId: string, input: ProductSourcing): Promise<void> {
  await adminRequest(`/api/admin/product-sources/product/${productId}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

export interface ProductSourceMapEntry {
  source_id: string;
  source_name: string;
  whatsapp_name: string | null;
  whatsapp_number: string | null;
}

// Bulk product_id -> source map, for the admin Products list rows (avoids
// an N+1 fetchProductSourcing call per product just to render the list).
export async function fetchProductSourcingMap(): Promise<Record<string, ProductSourceMapEntry>> {
  const body = await adminRequest('/api/admin/product-sources/product-map');
  return (body.map ?? {}) as Record<string, ProductSourceMapEntry>;
}
