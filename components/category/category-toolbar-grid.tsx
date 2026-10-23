'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { SlidersHorizontal, Video, VideoOff } from 'lucide-react';
import { Product } from '@/lib/types';
import { expandProductVariants } from '@/lib/expand-product-variants';
import ProductCard from '@/components/product-card';
import QuickNavIcons from '@/components/quick-nav-icons';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  fetchCatalogVideoSettings,
  fetchCatalogListingSettings,
  DEFAULT_CATALOG_LISTING_SETTINGS,
  fetchPriceRangeFilters,
  DEFAULT_PRICE_RANGE_FILTERS,
  PriceRangeBucket,
  getAvailablePriceBuckets,
} from '@/lib/settings-api';
import PriceRangeFilterBar from '@/components/shop/price-range-filter-bar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const CATALOG_VIDEO_PREF_KEY = 'aruhi-catalog-video-enabled';

type SortKey = 'featured' | 'price-asc' | 'price-desc' | 'rating' | 'newest' | 'popularity';

interface CategoryToolbarGridProps {
  products: Product[];
  /** Category NAME (not slug) — /shop's `?category=` filter matches on
   *  the product's category name, same as every other link into it
   *  (footer, product-card "view all in category", related products). */
  categoryName: string;
  /** Initial popularity rank from server-side rendering.
   *  Passed to ensure the first page paint shows products in popularity order
   *  instead of waiting for the client-side fetch to complete. */
  initialPopularityRank?: Map<string, number>;
  /** productId -> best-performing colour variation (image/slug). See
   *  lib/top-variant-server.ts and the matching prop on ShopContent. */
  initialTopVariants?: Record<string, { color: string; image: string | null; slug: string | null }>;
  /** Real per-image blur previews (LQIP) for this category's products —
   *  see the matching prop on ShopContentProps for the full explanation. */
  blurPreviews?: Record<string, string>;
}

/**
 * Renders the same Filters/Sort bar shoppers already know from /shop —
 * plus the Home/Categories quick-nav icons — on top of a category page's
 * product grid, so browsing a single category isn't a dead-end missing
 * the sort control every other listing page has. This page doesn't carry
 * the full price/size/colour/fabric filter panel /shop has (that state
 * lives entirely client-side in shop-content.tsx); "Filters" here hands
 * off to /shop pre-filtered to this category instead of duplicating that
 * whole panel for a single-category view.
 */
export default function CategoryToolbarGrid({
  products,
  categoryName,
  initialPopularityRank = new Map(),
  initialTopVariants = {},
  blurPreviews = {},
}: CategoryToolbarGridProps) {
  const [sort, setSort] = useState<SortKey>('popularity');

  // "Shop by Price" chip bar -- same admin-managed buckets as /shop (Admin
  // > Catalog > Price Filters), but narrowed to only the bands that have a
  // matching product within THIS category (see getAvailablePriceBuckets in
  // lib/settings-api.ts), so a category page never offers a price band
  // that would leave it empty. Picking a chip filters this page's own grid
  // client-side -- it doesn't hand off to /shop.
  const [priceBuckets, setPriceBuckets] = useState<PriceRangeBucket[]>(DEFAULT_PRICE_RANGE_FILTERS);
  const [activePriceBucketId, setActivePriceBucketId] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchPriceRangeFilters()
      .then((ranges) => {
        if (!cancelled) setPriceBuckets(ranges);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  const visiblePriceBuckets = useMemo(
    () => getAvailablePriceBuckets(priceBuckets, products),
    [priceBuckets, products]
  );
  // If the category's product list changes (or on first load) and the
  // active bucket no longer has anything in it, fall back to "All Prices"
  // instead of silently filtering to an empty grid.
  useEffect(() => {
    if (activePriceBucketId && !visiblePriceBuckets.some((b) => b.id === activePriceBucketId)) {
      setActivePriceBucketId(null);
    }
  }, [visiblePriceBuckets, activePriceBucketId]);
  const activePriceBucket = visiblePriceBuckets.find((b) => b.id === activePriceBucketId) || null;
  const handlePriceBucketSelect = (bucket: PriceRangeBucket | null) => {
    setActivePriceBucketId(bucket ? bucket.id : null);
  };
  const priceFilteredProducts = useMemo(() => {
    if (!activePriceBucket) return products;
    return products.filter((p) => p.price >= activePriceBucket.min && p.price <= activePriceBucket.max);
  }, [products, activePriceBucket]);

  const [popularityRank, setPopularityRank] = useState<Map<string, number>>(initialPopularityRank);
  const [topVariants, setTopVariants] = useState<Record<string, { color: string; image: string | null; slug: string | null }>>(
    initialTopVariants
  );
  useEffect(() => {
    // Refresh popularity data every 10 minutes (same cache period as the API)
    // to keep up with new purchases/views, but the server-side initial data
    // means the first paint is already in the right order.
    const interval = setInterval(() => {
      fetch('/api/products/popularity')
        .then((r) => r.json())
        .then(({ ranked }: { ranked: string[] }) => {
          setPopularityRank(new Map(ranked.map((id: string, i: number) => [id, i])));
        })
        .catch(() => {});
      fetch('/api/top-variants')
        .then((r) => r.json())
        .then(({ variants }: { variants: Record<string, { color: string; image: string | null; slug: string | null }> }) => {
          setTopVariants(variants ?? {});
        })

        .catch(() => {});
    }, 10 * 60 * 1000); // 10 minutes
    return () => clearInterval(interval);
  }, []);

  // Same shopper-facing "Video" toggle as /shop (see app/shop/shop-content.tsx
  // for the fuller rationale) -- shares the same localStorage key so a
  // shopper's choice carries across /shop and every category page instead
  // of resetting per page.
  const [videoEnabled, setVideoEnabled] = useState(true);
  useEffect(() => {
    let cancelled = false;
    const stored = typeof window !== 'undefined' ? window.localStorage.getItem(CATALOG_VIDEO_PREF_KEY) : null;
    if (stored === 'on' || stored === 'off') {
      setVideoEnabled(stored === 'on');
      return;
    }
    fetchCatalogVideoSettings()
      .then((s) => {
        if (!cancelled) setVideoEnabled(s.default_enabled);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  const toggleVideoEnabled = (checked: boolean) => {
    setVideoEnabled(checked);
    try {
      window.localStorage.setItem(CATALOG_VIDEO_PREF_KEY, checked ? 'on' : 'off');
    } catch {
      // Private browsing / storage blocked -- toggle still works for this
      // page view, it just won't be remembered next visit.
    }
  };

  const sorted = useMemo(() => {
    const list = [...priceFilteredProducts];
    switch (sort) {
      case 'price-asc':
        list.sort((a, b) => a.price - b.price);
        break;
      case 'price-desc':
        list.sort((a, b) => b.price - a.price);
        break;
      case 'rating':
        list.sort((a, b) => b.rating - a.rating);
        break;
      case 'newest':
        list.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
        break;
      case 'popularity':
        list.sort((a, b) => {
          const ra = popularityRank.has(a.id) ? popularityRank.get(a.id)! : Infinity;
          const rb = popularityRank.has(b.id) ? popularityRank.get(b.id)! : Infinity;
          if (ra !== rb) return ra - rb;
          // Same product family: base card first, then variant cards
          const aIsVariant = !!(a as any).isVariantCard;
          const bIsVariant = !!(b as any).isVariantCard;
          if (aIsVariant !== bIsVariant) return aIsVariant ? 1 : -1;
          return Number(!!b.featured) - Number(!!a.featured) || b.rating - a.rating;
        });
        break;
      default:
        list.sort((a, b) => Number(!!b.featured) - Number(!!a.featured));
    }
    return list;
  }, [priceFilteredProducts, sort, popularityRank]);

  // Admin > Settings > Catalog Listing Size -- how many cards load per
  // page/batch, and how many colour cards one product may contribute to
  // this grid (see lib/expand-product-variants.ts). Falls back to the
  // same defaults this page always used if the setting hasn't been
  // saved yet or fails to load, so nothing breaks/blanks while it's
  // still fetching.
  const [listingSettings, setListingSettings] = useState(DEFAULT_CATALOG_LISTING_SETTINGS);
  useEffect(() => {
    let cancelled = false;
    fetchCatalogListingSettings()
      .then((s) => {
        if (!cancelled) setListingSettings(s);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Same progressive reveal as /shop (see app/shop/shop-content.tsx for
  // the fuller rationale) -- a category page renders this same product
  // grid, so it needs the same guard against shipping every product's
  // images on first paint.
  const PAGE_SIZE = listingSettings.page_size;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [sort, PAGE_SIZE, activePriceBucketId]);
  const visibleProducts = sorted.slice(0, visibleCount);
  const hasMore = visibleCount < sorted.length;

  return (
    <>
      <div
        className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-between gap-3 border-t border-border bg-background/95 px-4 py-3 shadow-[0_-4px_16px_rgba(0,0,0,0.08)] backdrop-blur-sm md:static md:mb-5 md:mt-8 md:border-0 md:bg-transparent md:px-0 md:py-0 md:shadow-none md:backdrop-blur-none"
        style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
      >
        <div className="flex items-center gap-2">
          <QuickNavIcons />
          <Button variant="outline" className="lg:hidden" asChild>
            <Link href={`/shop?category=${encodeURIComponent(categoryName)}`}>
              <SlidersHorizontal className="mr-2 h-4 w-4" /> Filters
            </Link>
          </Button>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => toggleVideoEnabled(!videoEnabled)}
            aria-label={videoEnabled ? 'Turn off video previews' : 'Turn on video previews'}
            aria-pressed={videoEnabled}
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-colors sm:hidden ${
              videoEnabled
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-background text-foreground/70'
            }`}
          >
            {videoEnabled ? <Video className="h-4 w-4" /> : <VideoOff className="h-4 w-4" />}
          </button>
          <div className="hidden items-center gap-1.5 sm:flex">
            {videoEnabled ? (
              <Video className="h-4 w-4 text-muted-foreground" />
            ) : (
              <VideoOff className="h-4 w-4 text-muted-foreground" />
            )}
            <Label htmlFor="category-video-toggle" className="text-sm text-muted-foreground">
              Video
            </Label>
            <Switch
              id="category-video-toggle"
              checked={videoEnabled}
              onCheckedChange={toggleVideoEnabled}
              aria-label="Toggle autoplay video previews in the catalog"
            />
          </div>
          <Label className="hidden text-sm text-muted-foreground sm:inline">Sort by</Label>
          <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
            <SelectTrigger className="w-36 sm:w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="featured">Featured</SelectItem>
              <SelectItem value="popularity">Popularity</SelectItem>
              <SelectItem value="price-asc">Price: Low to High</SelectItem>
              <SelectItem value="price-desc">Price: High to Low</SelectItem>
              <SelectItem value="rating">Top Rated</SelectItem>
              <SelectItem value="newest">Newest</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <PriceRangeFilterBar
        ranges={visiblePriceBuckets}
        activeId={activePriceBucketId}
        onSelect={handlePriceBucketSelect}
        className="mt-4"
      />

      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {expandProductVariants(visibleProducts, listingSettings.max_variant_cards_per_product).map((p, i) => {
          // Show this product's best-performing colour instead of always
          // its default -- skipped for already-exploded per-colour cards,
          // which already show one specific colour on purpose.
          const topVariant = !p.isVariantCard ? topVariants[p.id] : undefined;
          return (
            <ProductCard
              key={`${p.id}-${p.slug}`}
              product={p}
              priority={i < 4}
              imageOverride={topVariant?.image || undefined}
              slugOverride={topVariant?.slug || undefined}
              disableAutoplayVideo={!videoEnabled || !!p.isVariantCard}
              blurPreviews={blurPreviews}
            />
          );
        })}
      </div>

      {hasMore && (
        <div className="mt-8 flex justify-center">
          <Button
            type="button"
            variant="outline"
            onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
            className="min-w-40"
          >
            Load more ({sorted.length - visibleCount} more)
          </Button>
        </div>
      )}
    </>
  );
}
