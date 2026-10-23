'use client';

import { useMemo } from 'react';
import { Product } from '@/lib/types';
import ProductCarousel from '@/components/product/product-carousel';
import { useTopVariants } from '@/lib/top-variant-api';

/**
 * Scores every candidate against the current product and returns the best
 * matches: same category counts most, shared fabric and shared occasion
 * tags add extra weight, and in-stock items are preferred over out-of-stock
 * ones so "You may also like" doesn't dead-end the shopper.
 */
function scoreCandidate(current: Product, candidate: Product): number {
  let score = 0;
  if (candidate.category === current.category) score += 3;
  if (candidate.fabric && candidate.fabric === current.fabric) score += 2;
  const sharedOccasions = (candidate.occasion || []).filter((o) =>
    (current.occasion || []).includes(o)
  ).length;
  score += sharedOccasions;
  if (candidate.inStock) score += 1;
  return score;
}

export default function RelatedProducts({
  current,
  allProducts,
  limit = 10,
  title = 'You may also like',
  overrideProducts,
  viewAllHref,
}: {
  current: Product;
  allProducts: Product[];
  limit?: number;
  title?: string;
  /** When provided and non-empty, shown instead of the scored same-category
   *  matches below — e.g. the rest of a live "Buy X Get Y" promotion's
   *  collection, so a shopper on that product's page can immediately find
   *  something to pair it with instead of generic related items. */
  overrideProducts?: Product[];
  /** "View All" target when `overrideProducts` is in use (e.g. the BOGO
   *  collection's own page). Falls back to the category shop link below
   *  when not provided. */
  viewAllHref?: string;
}) {
  const scored = useMemo(() => {
    return allProducts
      .filter((p) => p.id !== current.id)
      .map((p) => ({ product: p, score: scoreCandidate(current, p) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score || b.product.rating - a.product.rating)
      .slice(0, limit)
      .map((entry) => entry.product);
  }, [current, allProducts, limit]);

  const related = overrideProducts && overrideProducts.length > 0 ? overrideProducts.slice(0, limit) : scored;
  const topVariants = useTopVariants();

  return (
    <ProductCarousel
      title={title}
      products={related}
      viewAllHref={viewAllHref ?? `/shop?category=${encodeURIComponent(current.category)}`}
      variantOverrides={topVariants}
    />
  );
}
