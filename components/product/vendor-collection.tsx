'use client';

import { useEffect, useState } from 'react';
import ProductCarousel from '@/components/product/product-carousel';
import { fetchVendorCollection } from '@/lib/vendor-storefront-api';
import { Product } from '@/lib/types';

/**
 * "<Vendor Name>'s Collection" -- shown on a product page below "You may
 * also like", scoped to the same vendor instead of similar products.
 * Renders nothing if the product has no (approved) vendor, or the
 * vendor has no other live products.
 */
export default function VendorCollection({ productId }: { productId: string }) {
  const [vendor, setVendor] = useState<{ id: string; name: string; slug: string } | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    fetchVendorCollection(productId).then((res) => {
      if (cancelled) return;
      setVendor(res.vendor);
      setProducts(res.products);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [productId]);

  if (!loaded || !vendor || products.length === 0) return null;

  return (
    <ProductCarousel
      eyebrow="Collection"
      title={vendor.name}
      products={products}
      viewAllHref={`/collection/${vendor.slug}`}
    />
  );
}
