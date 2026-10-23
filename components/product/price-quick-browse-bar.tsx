'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { IndianRupee } from 'lucide-react';
import {
  fetchPriceRangeFilters,
  DEFAULT_PRICE_RANGE_FILTERS,
  getAvailablePriceBuckets,
  PriceRangeBucket,
} from '@/lib/settings-api';
import { fetchCategoryPrices } from '@/lib/products-api';

interface PriceQuickBrowseBarProps {
  /** This product's own category (product.category) -- narrows the bar
   *  down to only the admin-configured buckets that have at least one
   *  LIVE product in this same category, instead of always listing every
   *  bucket regardless of what this category actually has. */
  category: string;
}

/**
 * "Shop by Price" quick-browse chips shown on the product detail page,
 * right below Add to Bag/Buy Now. Unlike the same-looking bar on /shop
 * (components/shop/price-range-filter-bar.tsx) this one isn't a live
 * in-page filter -- there's only one product on this page -- it's a
 * shortcut: tapping a chip takes the shopper to /shop already filtered to
 * THIS product's own category and that price band, so they can keep
 * browsing the same category at their budget.
 *
 * Buckets are the same admin-managed list (Admin > Catalog > Price
 * Filters), but narrowed down here to only the ones with at least one
 * matching LIVE product in `category` -- the exact same
 * getAvailablePriceBuckets() rule /shop itself uses to hide empty bands
 * (see lib/settings-api.ts) -- so a saree's page, say, never offers a
 * price band that has nothing in it for sarees, even if that band is real
 * and populated for some other category.
 */
export default function PriceQuickBrowseBar({ category }: PriceQuickBrowseBarProps) {
  const [allRanges, setAllRanges] = useState<PriceRangeBucket[]>(DEFAULT_PRICE_RANGE_FILTERS);
  // Prices of every other LIVE product in THIS product's category -- just
  // the `price` column, nothing else (see fetchCategoryPrices). Starts as
  // `null`, not `[]`, so "haven't checked this category yet" is
  // distinguishable from "checked, and it's genuinely empty" -- we render
  // nothing while it's null instead of flashing the full unfiltered bucket
  // list and then narrowing it a moment later.
  const [categoryPrices, setCategoryPrices] = useState<number[] | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  // Only show the right-edge "more to scroll" fade when the chips actually
  // overflow the visible width -- otherwise a handful of short chips left
  // a flat, unexplained blank strip on the right that looked like a
  // layout bug rather than "that's just all of them".
  const [canScrollRight, setCanScrollRight] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchPriceRangeFilters()
      .then((r) => {
        if (!cancelled) setAllRanges(r);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Re-fetches whenever `category` changes (e.g. clicking into a different
  // product from "You may also like" without a full page reload). Resets
  // to null first so the previous product's buckets don't stay on screen
  // -- misattributed to the new product -- while the new category's prices
  // are still loading.
  useEffect(() => {
    let cancelled = false;
    setCategoryPrices(null);
    fetchCategoryPrices(category)
      .then((prices) => {
        if (!cancelled) setCategoryPrices(prices);
      })
      .catch(() => {
        if (!cancelled) setCategoryPrices([]);
      });
    return () => {
      cancelled = true;
    };
  }, [category]);

  // The actual buckets to render -- every admin-configured band, narrowed
  // down to the ones with at least one matching price in this category.
  const ranges = useMemo(() => {
    if (categoryPrices === null) return [];
    return getAvailablePriceBuckets(
      allRanges,
      categoryPrices.map((price) => ({ price }))
    );
  }, [allRanges, categoryPrices]);

  const updateFade = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    setCanScrollRight(el.scrollWidth - el.clientWidth - el.scrollLeft > 4);
  }, []);

  useEffect(() => {
    updateFade();
    const el = scrollerRef.current;
    if (!el) return;
    el.addEventListener('scroll', updateFade, { passive: true });
    window.addEventListener('resize', updateFade);
    return () => {
      el.removeEventListener('scroll', updateFade);
      window.removeEventListener('resize', updateFade);
    };
  }, [ranges, updateFade]);

  if (ranges.length === 0) return null;

  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.15em] text-secondary">
        Shop by Price
      </p>
      <div className="relative">
        <div
          ref={scrollerRef}
          className="flex gap-2.5 overflow-x-auto scroll-smooth pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {ranges.map((bucket) => (
            <Link
              key={bucket.id}
              href={`/shop?category=${encodeURIComponent(category)}&pricebucket=${encodeURIComponent(bucket.id)}`}
              className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-border bg-background px-4 py-2 text-xs font-semibold text-foreground/80 transition-colors hover:border-primary/60 hover:text-primary"
            >
              <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-secondary/10 text-secondary">
                <IndianRupee className="h-2.5 w-2.5" />
              </span>
              {bucket.label}
            </Link>
          ))}
        </div>
        {canScrollRight && (
          <div className="pointer-events-none absolute right-0 top-0 bottom-2 w-10 bg-gradient-to-l from-background to-transparent" />
        )}
      </div>
    </div>
  );
}
