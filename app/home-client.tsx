'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useMemo } from 'react';
import { ArrowRight, Sparkles, Truck, ShieldCheck } from 'lucide-react';
import { Product, CategoryRow } from '@/lib/types';
import type { HomeBanner } from '@/lib/home-data-server';
import type { PublicCollectionRow } from '@/lib/collections-api-server';
import type { HomepageTile } from '@/lib/homepage-tiles-api';
import type { HeroBanner } from '@/lib/hero-banners-api';
import type { DiscoverSectionSettings } from '@/lib/discover-products-api';
import ProductCard from '@/components/product-card';
import DiscoverProductsSection from '@/components/home/discover-products-section';
import { expandProductVariants } from '@/lib/expand-product-variants';
import CouponStrip from '@/components/home/coupon-strip';
import PromoSlider from '@/components/home/promo-slider';
import HomepageGrid from '@/components/home/homepage-grid';
import HeroBannerCarousel from '@/components/home/hero-banner-carousel';
import { Button } from '@/components/ui/button';
import { toPublicMediaUrl } from '@/lib/media-url';

interface HomeClientProps {
  products: Product[];
  categories: CategoryRow[];
  banner: HomeBanner | null;
  heroBanners: HeroBanner[];
  freeShippingThreshold: number | null;
  collections: PublicCollectionRow[];
  tiles: HomepageTile[];
  collectionSlugById: Record<string, string>;
  promotionCollectionSlugById: Record<string, string>;
  discoverSettings: DiscoverSectionSettings;
  discoverInitialProducts: Product[];
  discoverInitialHasMore: boolean;
  discoverCategoryCounts: Record<string, number>;
}

export default function HomeClient({
  products,
  categories,
  banner,
  heroBanners,
  freeShippingThreshold,
  collections,
  tiles,
  collectionSlugById,
  promotionCollectionSlugById,
  discoverSettings,
  discoverInitialProducts,
  discoverInitialHasMore,
  discoverCategoryCounts,
}: HomeClientProps) {
  // Explode each grid's finite pick list into one card per colour, so a
  // featured/new-arrival piece that comes in several colours shows every
  // one of them here too, not just its default colour.
  const featured = expandProductVariants(products.filter((p) => p.featured).slice(0, 8));
  const newArrivals = expandProductVariants(products.slice(0, 4));

  // Each category row's circle is pulled live from that category's own
  // products — the admin's Featured pick first, else just the newest —
  // so adding/removing/replacing products updates these automatically.
  const categoryThumbs = useMemo(() => {
    const map = new Map<string, string | undefined>();
    for (const c of categories) {
      const inCat = products.filter((p) => p.category === c.name);
      const best = inCat.find((p) => p.featured) || inCat[0];
      map.set(c.id, best?.images?.[0]);
    }
    return map;
  }, [categories, products]);

  // How many live products sit in each category — used to hide any
  // category that currently has zero products from "Shop by Category"
  // so shoppers never land on an empty grid.
  const categoryCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of categories) {
      map.set(c.id, products.filter((p) => p.category === c.name).length);
    }
    return map;
  }, [categories, products]);

  const visibleCategories = useMemo(
    () =>
      categories.filter(
        (c) => (categoryCounts.get(c.id) ?? 0) > 0 && !/bridal/i.test(c.name)
      ),
    [categories, categoryCounts]
  );

  return (
    <div className="flex flex-col">
      {/* Hero */}
      {heroBanners.length > 0 ? (
        <HeroBannerCarousel banners={heroBanners} />
      ) : banner ? (
        <section className="w-full">
          {banner.link_url ? (
            <Link
              href={banner.link_url}
              className="group relative block aspect-[4/5] w-full overflow-hidden sm:aspect-[16/6]"
            >
              <Image
                src={toPublicMediaUrl(banner.image_url) ?? banner.image_url}
                alt="Current promotion"
                fill
                priority
                fetchPriority="high"
                sizes="100vw"
                className="animate-ken-burns object-cover"
              />
              {/* Light sweep gives the static banner a "live" glint without
                  needing extra images from the admin panel. */}
              <span
                aria-hidden
                className="pointer-events-none absolute inset-y-0 left-0 w-1/3 animate-shine-sweep bg-gradient-to-r from-transparent via-white/25 to-transparent"
              />
            </Link>
          ) : (
            <div className="group relative aspect-[4/5] w-full overflow-hidden sm:aspect-[16/6]">
              <Image
                src={toPublicMediaUrl(banner.image_url) ?? banner.image_url}
                alt="Current promotion"
                fill
                priority
                fetchPriority="high"
                sizes="100vw"
                className="animate-ken-burns object-cover"
              />
              <span
                aria-hidden
                className="pointer-events-none absolute inset-y-0 left-0 w-1/3 animate-shine-sweep bg-gradient-to-r from-transparent via-white/25 to-transparent"
              />
            </div>
          )}
        </section>
      ) : (
      <section className="relative overflow-hidden bg-gradient-to-br from-primary via-primary to-primary/80">
        <div className="absolute inset-0 opacity-20">
          <div className="animate-float absolute -left-20 top-10 h-72 w-72 rounded-full bg-secondary/40 blur-3xl" />
          <div
            className="animate-float absolute right-0 top-40 h-80 w-80 rounded-full bg-secondary/30 blur-3xl"
            style={{ animationDelay: '1.5s' }}
          />
        </div>
        <div className="container-boutique relative grid items-center gap-6 py-7 pb-6 sm:gap-8 sm:py-10 sm:pb-8 md:grid-cols-[1.1fr_0.9fr] md:py-14">
          <div className="flex flex-col gap-5 text-primary-foreground sm:gap-6">
            <span
              className="animate-fade-in inline-flex w-fit items-center gap-2 rounded-full bg-secondary/20 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-secondary"
              style={{ animationDelay: '0ms' }}
            >
              <Sparkles className="h-3.5 w-3.5" /> Handwoven Heritage
            </span>
            <h1
              className="animate-fade-in font-serif text-3xl font-bold leading-tight text-balance sm:text-5xl lg:text-6xl"
              style={{ animationDelay: '100ms' }}
            >
              Drape Yourself in Stories Woven by Hand
            </h1>
            <p
              className="animate-fade-in max-w-md text-sm text-primary-foreground/80 sm:text-lg"
              style={{ animationDelay: '200ms' }}
            >
              Discover handpicked sarees, lehengas and ethnic wear from master
              weavers across India. Timeless craftsmanship, modern convenience.
            </p>
            <div
              className="animate-fade-in flex flex-col gap-3 sm:flex-row sm:flex-wrap"
              style={{ animationDelay: '300ms' }}
            >
              <Button
                asChild
                size="lg"
                className="w-full justify-center bg-secondary text-secondary-foreground shadow-lg shadow-secondary/20 transition-all duration-300 hover:scale-[1.02] hover:bg-secondary/90 hover:shadow-xl hover:shadow-secondary/30 sm:w-auto"
              >
                <Link href="/shop" className="gap-2">
                  Shop Collection <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="w-full justify-center border-primary-foreground/30 bg-transparent text-primary-foreground transition-all duration-300 hover:scale-[1.02] hover:bg-primary-foreground/10 sm:w-auto"
              >
                <Link href="/category/silk-sarees">Explore Silk Sarees</Link>
              </Button>
            </div>
            <div
              className="animate-fade-in mt-1 flex items-center gap-6 text-xs text-primary-foreground/70"
              style={{ animationDelay: '400ms' }}
            >
              <span className="flex items-center gap-1.5"><ShieldCheck className="h-4 w-4 text-secondary" /> Authentic weaves</span>
              {freeShippingThreshold ? (
                <span className="flex items-center gap-1.5"><Truck className="h-4 w-4 text-secondary" /> Free shipping over ₹{freeShippingThreshold.toLocaleString('en-IN')}</span>
              ) : null}
            </div>
          </div>
          <div className="animate-scale-in relative hidden md:block" style={{ animationDelay: '150ms' }}>
            <div className="relative aspect-[4/5] w-full overflow-hidden rounded-2xl border border-secondary/30 bg-primary/40 shadow-2xl">
              {/* Decorative motif instead of a stock photo — glowing gold
                  rings that gently pulse/rotate for a "live" feel while
                  staying on-brand and photo-free. */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="animate-float h-56 w-56 rounded-full border-2 border-secondary/40" style={{ animationDelay: '0.3s' }} />
                <div className="animate-float absolute h-40 w-40 rounded-full border-2 border-secondary/60" style={{ animationDelay: '0.9s' }} />
                <Sparkles className="absolute h-10 w-10 animate-badge-pop text-secondary" />
              </div>
              <div className="absolute inset-0 bg-gradient-to-t from-primary/70 via-transparent to-transparent" />
              <div className="absolute bottom-4 left-4 right-4 rounded-xl bg-background/90 p-4 backdrop-blur-sm">
                <p className="font-serif text-sm font-semibold text-primary">
                  Banarasi Crimson Bridal
                </p>
                <p className="text-xs text-muted-foreground">
                  Katan silk · Varanasi
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
      )}

      {/* Categories */}
      <section className="container-boutique py-8 sm:py-10">
        <div className="mb-5 flex items-end justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-secondary">
              Curated Collections
            </p>
            <h2 className="mt-1 font-serif text-3xl font-bold text-primary">
              Shop by Category
            </h2>
          </div>
          <Link
            href="/shop"
            className="hidden items-center gap-1 text-sm font-medium text-primary hover:underline sm:flex"
          >
            View all <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <div className="grid grid-cols-4 gap-x-3 gap-y-4 sm:grid-cols-6 lg:grid-cols-8">
          {visibleCategories.map((c) => {
                const thumb = categoryThumbs.get(c.id);
                return (
                  <Link
                    key={c.id}
                    href={`/category/${c.slug}`}
                    className="group flex flex-col items-center gap-2 text-center"
                  >
                    <div className="relative h-16 w-16 overflow-hidden rounded-full border border-border/60 bg-muted shadow-sm transition-transform duration-300 group-hover:scale-105 sm:h-20 sm:w-20">
                      {thumb ? (
                        <Image
                          src={thumb}
                          alt={`${c.name} - handwoven Indian ethnic wear collection at AruhiHandlooms`}
                          fill
                          sizes="80px"
                          className="object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-[10px] text-muted-foreground">
                          {c.name.slice(0, 1)}
                        </div>
                      )}
                    </div>
                    <p className="line-clamp-2 font-serif text-xs font-semibold leading-tight text-foreground sm:text-sm">
                      {c.name}
                    </p>
                  </Link>
                );
              })}
          {visibleCategories.length === 0 && (
            <p className="col-span-full text-sm text-muted-foreground">
              New categories are on their way — check back soon.
            </p>
          )}
        </div>
      </section>

      {/* Collections — same circle-row treatment as categories above, but
          sourced from Admin > Collections instead of the categories table.
          Hidden entirely when there are no active collections with
          products, so it never leaves an odd empty gap on a fresh store. */}
      {collections.length > 0 && (
        <section className="container-boutique pb-8 sm:pb-10">
          <div className="mb-5 flex items-end justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-secondary">
                Handpicked For You
              </p>
              <h2 className="mt-1 font-serif text-3xl font-bold text-primary">
                Shop by Collection
              </h2>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-x-3 gap-y-4 sm:grid-cols-6 lg:grid-cols-8">
            {collections.map((c) => (
              <Link
                key={c.id}
                href={`/collection/${c.slug}`}
                className="group flex flex-col items-center gap-2 text-center"
              >
                <div className="relative h-16 w-16 overflow-hidden rounded-full border border-border/60 bg-muted shadow-sm transition-transform duration-300 group-hover:scale-105 sm:h-20 sm:w-20">
                  {c.thumbnail ? (
                    <Image
                      src={toPublicMediaUrl(c.thumbnail) ?? c.thumbnail}
                      alt={`${c.name} - curated collection at AruhiHandlooms`}
                      fill
                      sizes="80px"
                      className="object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-[10px] text-muted-foreground">
                      {c.name.slice(0, 1)}
                    </div>
                  )}
                </div>
                <p className="line-clamp-2 font-serif text-xs font-semibold leading-tight text-foreground sm:text-sm">
                  {c.name}
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}


      <HomepageGrid
        tiles={tiles}
        collectionSlugById={collectionSlugById}
        promotionCollectionSlugById={promotionCollectionSlugById}
      />

      <DiscoverProductsSection
        settings={discoverSettings}
        initialProducts={discoverInitialProducts}
        initialHasMore={discoverInitialHasMore}
        categories={categories}
        categoryCounts={discoverCategoryCounts}
      />

      <PromoSlider />

      <CouponStrip />

      {/* Featured */}
      <section className="bg-muted/40 py-9 sm:py-11">
        <div className="container-boutique">
          <div className="mb-5 flex items-end justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-secondary">
                Editor’s Picks
              </p>
              <h2 className="mt-1 font-serif text-3xl font-bold text-primary">
                Featured Pieces
              </h2>
            </div>
            <Link
              href="/shop"
              className="hidden items-center gap-1 text-sm font-medium text-primary hover:underline sm:flex"
            >
              View all <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {featured.map((p, idx) => (
              <ProductCard key={`${p.id}-${p.slug}`} product={p} priority={idx < 4} disableAutoplayVideo={!!p.isVariantCard} />
            ))}
          </div>
        </div>
      </section>

      {/* Banner */}
      <section className="container-boutique py-8 sm:py-10">
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-primary to-primary/80 px-8 py-12 text-primary-foreground sm:px-12">
          <div className="absolute -right-10 top-0 h-40 w-40 rounded-full bg-secondary/30 blur-3xl" />
          <div className="relative max-w-xl">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-secondary">
              Wedding Edit
            </p>
            <h2 className="mt-2 font-serif text-3xl font-bold sm:text-4xl">
              Your Wedding, Woven in Gold
            </h2>
            <p className="mt-3 text-primary-foreground/80">
              Heirloom Banarasi and velvet lehengas, hand-embroidered for the day
              you’ll remember forever.
            </p>
            <Button
              asChild
              className="mt-5 bg-secondary text-secondary-foreground hover:bg-secondary/90"
            >
              <Link href="/shop?category=Lehenga" className="gap-2">
                Explore Lehengas <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* New arrivals */}
      <section className="container-boutique pb-10 sm:pb-12">
        <div className="mb-5 flex items-end justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-secondary">
              Just In
            </p>
            <h2 className="mt-1 font-serif text-3xl font-bold text-primary">
              New Arrivals
            </h2>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {newArrivals.map((p) => (
            <ProductCard key={`${p.id}-${p.slug}`} product={p} disableAutoplayVideo={!!p.isVariantCard} />
          ))}
        </div>
      </section>
    </div>
  );
}
