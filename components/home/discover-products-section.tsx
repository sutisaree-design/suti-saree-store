'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { Loader2, ShoppingBag } from 'lucide-react';
import { Product, CategoryRow } from '@/lib/types';
import type { DiscoverSectionSettings } from '@/lib/discover-products-api';
import { formatINR, discountPct } from '@/lib/format';
import { getVariantDisplayName } from '@/lib/variant-display-name';
import { toPublicMediaUrl } from '@/lib/media-url';
import { fetchPriceRangeFilters, PriceRangeBucket } from '@/lib/settings-api';
import PriceRangeFilterBar from '@/components/shop/price-range-filter-bar';
import WishlistButton from '@/components/wishlist-button';
import DiscoverQuickView from '@/components/product/discover-quick-view';

interface DiscoverProductsSectionProps {
  settings: DiscoverSectionSettings;
  initialProducts: Product[];
  initialHasMore: boolean;
  categories: CategoryRow[];
  /** Category name -> live product count across the whole Discover
   *  Products set (see fetchDiscoverCategoryCountsServer). Categories
   *  with a zero (or missing) count are hidden from the filter bar below
   *  so a shopper can never tap a pill straight into an empty grid. */
  categoryCounts?: Record<string, number>;
}

/**
 * Admin-managed (Admin > Discover Products) homepage section — sits right
 * after "Today's Picks" and before the promo slider (see app/home-client.tsx).
 * Renders its first page server-side (props above, from
 * lib/home-data-server.ts) then paginates further pages / re-fetches on
 * filter changes from /api/discover-products. Clicking a product opens an
 * inline Quick View instead of navigating to /product/[slug].
 */
export default function DiscoverProductsSection({
  settings,
  initialProducts,
  initialHasMore,
  categories,
  categoryCounts,
}: DiscoverProductsSectionProps) {
  // Hidden entirely when the admin has switched the section off, or when
  // it's in Manual mode with zero active picks — same "return null" guard
  // style HomepageGrid uses for an empty tile list. Evaluated off the
  // server-rendered first page, so this never flickers in after mount.
  const hidden = !settings.enabled || (settings.mode === 'manual' && initialProducts.length === 0);

  const [products, setProducts] = useState(initialProducts);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [activeBucket, setActiveBucket] = useState<PriceRangeBucket | null>(null);
  const [priceRanges, setPriceRanges] = useState<PriceRangeBucket[]>([]);
  const [openProduct, setOpenProduct] = useState<Product | null>(null);

  useEffect(() => {
    if (!settings.show_price_filter || hidden) return;
    fetchPriceRangeFilters()
      .then(setPriceRanges)
      .catch(() => setPriceRanges([]));
  }, [settings.show_price_filter, hidden]);

  const runFetch = useCallback(
    async (category: string | null, bucket: PriceRangeBucket | null, pageNum: number, replace: boolean) => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (category) params.set('category', category);
        if (bucket) {
          params.set('priceMin', String(bucket.min));
          params.set('priceMax', String(bucket.max));
        }
        params.set('page', String(pageNum));
        params.set('pageSize', String(settings.page_size || 12));
        const res = await fetch(`/api/discover-products?${params.toString()}`);
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || 'Failed to load products');
        setProducts((prev) => (replace ? (body.products ?? []) : [...prev, ...(body.products ?? [])]));
        setHasMore(!!body.hasMore);
        setPage(pageNum);
      } catch {
        // Best-effort — keep whatever was already on screen rather than
        // clearing the grid on a transient network error.
      } finally {
        setLoading(false);
      }
    },
    [settings.page_size]
  );

  // Tapping a category/price pill while scrolled down (the sticky bar's
  // whole point) previously left the shopper stranded wherever they'd
  // already scrolled to — the grid underneath swapped to a shorter/empty
  // set of products off-screen below, so it looked like nothing happened
  // and they had to scroll back up by hand to see the new results, or the
  // sticky bar itself would end up outside its section's bounds and stop
  // sticking. Scrolling the section back to just under the sticky bar on
  // every filter change fixes both: the new products are immediately
  // visible, and the bar is back in a position where it can keep sticking.
  const sectionRef = useRef<HTMLElement>(null);
  const scrollToGridTop = () => {
    sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleSelectCategory = (name: string | null) => {
    const next = activeCategory === name ? null : name;
    setActiveCategory(next);
    runFetch(next, activeBucket, 1, true);
    scrollToGridTop();
  };

  const handleSelectBucket = (bucket: PriceRangeBucket | null) => {
    setActiveBucket(bucket);
    runFetch(activeCategory, bucket, 1, true);
    scrollToGridTop();
  };

  // Infinite scroll — a sentinel div at the bottom of the grid triggers the
  // next page once it enters the viewport, so shoppers never have to tap a
  // "Load more" button unless their connection/scroll is slow enough that
  // they outrun it (in which case the small spinner row below covers them).
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (hidden || !hasMore) return;
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !loading) {
          runFetch(activeCategory, activeBucket, page + 1, false);
        }
      },
      { rootMargin: '400px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hidden, hasMore, loading, page, activeCategory, activeBucket, runFetch]);

  // Hide any category pill that has zero products in the Discover set —
  // without this, a shopper could tap a category and land on "No products
  // match these filters right now" (see the screenshot this was reported
  // from: "Blouse Pieces" had no live products but still showed a pill).
  // When categoryCounts hasn't loaded (undefined), fall back to showing
  // every category rather than hiding everything.
  const categoryNames = useMemo(
    () =>
      categories
        .map((c) => c.name)
        .filter((name) => !categoryCounts || (categoryCounts[name] ?? 0) > 0),
    [categories, categoryCounts]
  );

  if (hidden) return null;

  return (
    <section ref={sectionRef} className="container-boutique scroll-mt-12 py-6">
      <p className="mb-1 text-xs font-semibold uppercase tracking-[0.2em] text-secondary">
        {settings.title}
      </p>
      {settings.subtitle && (
        <p className="mb-3 text-sm text-muted-foreground">{settings.subtitle}</p>
      )}
      {!settings.subtitle && <div className="mb-3" />}

      {((settings.show_category_filter && categoryNames.length > 0) ||
        (settings.show_price_filter && priceRanges.length > 0)) && (
        // Pinned just under the site header while the shopper scrolls past
        // this section, same "top-12 matches header's h-12" convention the
        // Shop page's category row uses (see app/shop/shop-content.tsx) —
        // so switching category/price filter never needs scrolling back up
        // to find the pills again, especially useful on mobile where this
        // section can run several screens tall.
        <div className="sticky top-12 z-30 -mx-4 border-b border-border/60 bg-background/95 px-4 pb-3 pt-2 backdrop-blur-sm sm:mx-0 sm:border-none sm:bg-transparent sm:px-0 sm:pt-0 sm:backdrop-blur-none">
          {settings.show_category_filter && categoryNames.length > 0 && (
            <div className="flex gap-2.5 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <button
                type="button"
                onClick={() => handleSelectCategory(null)}
                aria-pressed={activeCategory === null}
                className={`shrink-0 rounded-full border px-4 py-2 text-xs font-semibold transition-all ${
                  activeCategory === null
                    ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                    : 'border-border bg-background text-foreground/80 hover:border-primary/50 hover:text-primary'
                }`}
              >
                All
              </button>
              {categoryNames.map((name) => {
                const isActive = activeCategory === name;
                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() => handleSelectCategory(name)}
                    aria-pressed={isActive}
                    className={`shrink-0 whitespace-nowrap rounded-full border px-4 py-2 text-xs font-semibold transition-all ${
                      isActive
                        ? 'border-primary bg-gradient-to-r from-primary to-primary/80 text-primary-foreground shadow-md shadow-primary/20'
                        : 'border-border bg-background text-foreground/80 hover:border-primary/50 hover:text-primary'
                    }`}
                  >
                    {name}
                  </button>
                );
              })}
            </div>
          )}

          {settings.show_price_filter && priceRanges.length > 0 && (
            <PriceRangeFilterBar
              ranges={priceRanges}
              activeId={activeBucket?.id ?? null}
              onSelect={handleSelectBucket}
              className={settings.show_category_filter && categoryNames.length > 0 ? '' : 'pt-1'}
            />
          )}
        </div>
      )}

      {products.length === 0 && !loading ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          No products match these filters right now.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {products.map((p, idx) => (
            <DiscoverProductCard
              key={`${p.id}-${idx}`}
              product={p}
              priority={idx < 4}
              onOpen={() => setOpenProduct(p)}
            />
          ))}
        </div>
      )}

      {hasMore && (
        <div ref={sentinelRef} className="flex items-center justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-primary/60" />
        </div>
      )}

      {openProduct && (
        <DiscoverQuickView product={openProduct} onClose={() => setOpenProduct(null)} />
      )}
    </section>
  );
}

function DiscoverProductCard({
  product,
  priority,
  onOpen,
}: {
  product: Product;
  priority?: boolean;
  onOpen: () => void;
}) {
  const discount = discountPct(product.price, product.mrp);
  const img =
    toPublicMediaUrl(product.default_variant_image || product.images[0]) ||
    'https://placehold.co/800x1000?text=No+Image';
  const displayName = getVariantDisplayName(
    product.name,
    product.colors?.[0],
    product.default_variant_color
  );

  // A plain <div role="button"> rather than a real <button> — this card
  // hosts WishlistButton, itself an interactive <button>, and nested
  // <button> elements are invalid HTML (the browser silently un-nests
  // them, breaking hit targets). Same trick ProductCard's outer <Link>
  // already relies on for the same reason.
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
      className="group flex cursor-pointer flex-col overflow-hidden rounded-2xl bg-card text-left shadow-sm transition-shadow duration-300 hover:shadow-lg"
    >
      <div className="relative aspect-[4/5] w-full overflow-hidden bg-muted">
        <Image
          src={img}
          alt={`${displayName} - ${product.fabric} ${product.category} from ${product.origin}`}
          fill
          priority={priority}
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
          className="object-cover transition-transform duration-500 group-hover:scale-105"
        />
        {discount > 0 && (
          <span className="absolute left-2 top-2 rounded-full bg-rose-500 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white shadow-sm">
            {discount}% OFF
          </span>
        )}
        <WishlistButton productId={product.id} className="absolute right-2 top-2" />
        {!product.inStock && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/60">
            <span className="rounded bg-primary px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-primary-foreground">
              Out of Stock
            </span>
          </div>
        )}
        <span className="absolute bottom-2 right-2 flex h-8 w-8 items-center justify-center rounded-full bg-primary/95 text-primary-foreground opacity-0 shadow-md transition-opacity duration-300 group-hover:opacity-100">
          <ShoppingBag className="h-3.5 w-3.5" />
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-0.5 p-3">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-secondary">
          {product.category}
        </p>
        <h3 className="line-clamp-2 font-serif text-xs font-semibold leading-snug text-foreground sm:text-sm">
          {displayName}
        </h3>
        <div className="mt-1 flex items-baseline gap-1.5">
          <span className="font-serif text-sm font-bold text-primary">
            {formatINR(product.price)}
          </span>
          {product.mrp && product.mrp > product.price && (
            <span className="text-[11px] text-muted-foreground line-through">
              {formatINR(product.mrp)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
