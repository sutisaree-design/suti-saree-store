'use client';

import { useEffect, useState } from 'react';
import { useProducts } from '@/lib/cart-context';
import { getRecentlyViewed } from '@/lib/recently-viewed';
import { Product } from '@/lib/types';
import ProductCarousel from '@/components/product/product-carousel';
import { useTopVariants } from '@/lib/top-variant-api';

export default function RecentlyViewedSection({ excludeId }: { excludeId?: string }) {
  const { products } = useProducts();
  const [ids, setIds] = useState<string[]>([]);
  const topVariants = useTopVariants();

  // Read localStorage only on the client, after mount, to avoid SSR mismatch.
  useEffect(() => {
    setIds(getRecentlyViewed(excludeId));
  }, [excludeId]);

  if (ids.length === 0 || products.length === 0) return null;

  const byId = new Map(products.map((p) => [p.id, p]));
  const items = ids
    .map((id) => byId.get(id))
    .filter((p): p is Product => Boolean(p))
    .slice(0, 10);

  return <ProductCarousel title="Recently Viewed" products={items} variantOverrides={topVariants} />;
}
