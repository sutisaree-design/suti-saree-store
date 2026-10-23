import { Product } from './types';

export interface VendorCollectionResponse {
  vendor: { id: string; name: string; slug: string } | null;
  products: Product[];
}

/** Fetches the vendor (if any) who listed `productId`, plus their other
 *  live products -- backs the "<Vendor>'s Collection" carousel on a
 *  product page. Never throws; on any failure it resolves to an empty
 *  result so the widget just doesn't render. */
export async function fetchVendorCollection(productId: string): Promise<VendorCollectionResponse> {
  try {
    const res = await fetch(`/api/vendor-collection/${productId}`, { cache: 'no-store' });
    if (!res.ok) return { vendor: null, products: [] };
    return (await res.json()) as VendorCollectionResponse;
  } catch {
    return { vendor: null, products: [] };
  }
}

export interface VendorStorefront {
  vendor: { id: string; name: string; slug: string; since: string } | null;
  showRating: boolean;
  rating: number | null;
  reviewCount: number | null;
  products: Product[];
}

/** Fetches the full public collection page for a vendor by their
 *  storefront slug -- backs /collection/[slug]. Returns
 *  `{ vendor: null, ... }` if the slug doesn't match an approved vendor. */
export async function fetchVendorStorefront(slug: string): Promise<VendorStorefront> {
  try {
    const res = await fetch(`/api/collection/${slug}`, { cache: 'no-store' });
    if (!res.ok) return { vendor: null, showRating: false, rating: null, reviewCount: null, products: [] };
    return (await res.json()) as VendorStorefront;
  } catch {
    return { vendor: null, showRating: false, rating: null, reviewCount: null, products: [] };
  }
}
