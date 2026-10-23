'use client';

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { Product } from '@/lib/types';
import ProductCard from '@/components/product-card';

export default function ProductCarousel({
  eyebrow,
  title,
  products,
  viewAllHref,
  variantOverrides,
}: {
  /** Small uppercase label shown above the title, e.g. "Collection" --
   *  same visual pattern as the "BRIDAL" category tag above a product
   *  title. Also becomes a link when viewAllHref is set. */
  eyebrow?: string;
  title: string;
  products: Product[];
  /** Shown as a "View All" link in the section header when provided. */
  viewAllHref?: string;
  /**
   * productId -> that product's best-performing colour variation (from
   * lib/top-variant-api.ts). When present for a product, its card shows
   * that colour's photo and links straight to that colour's page instead
   * of the product's default -- e.g. "Recently Viewed" / "You May Also
   * Like" showing the exact variation shoppers actually engage with most.
   */
  variantOverrides?: Record<string, { image?: string | null; slug?: string | null }>;
}) {
  if (products.length === 0) return null;

  return (
    <section className="mt-8">
      <div className="mb-4 flex items-center justify-between">
        <div>
          {eyebrow &&
            (viewAllHref ? (
              <Link
                href={viewAllHref}
                className="block text-xs font-semibold uppercase tracking-[0.15em] text-secondary transition-colors hover:text-primary"
              >
                {eyebrow}
              </Link>
            ) : (
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-secondary">{eyebrow}</p>
            ))}
          {viewAllHref ? (
            <Link
              href={viewAllHref}
              className="font-serif text-xl font-bold text-primary transition-colors hover:text-secondary sm:text-2xl"
            >
              {title}
            </Link>
          ) : (
            <h2 className="font-serif text-xl font-bold text-primary sm:text-2xl">{title}</h2>
          )}
        </div>
        {viewAllHref && (
          <Link
            href={viewAllHref}
            className="flex shrink-0 items-center gap-0.5 text-xs font-semibold text-secondary transition-colors hover:text-primary sm:text-sm"
          >
            View All
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>

      {/* Horizontally scrollable strip — same site padding as everywhere
          else (no edge-to-edge bleed), just tighter card size/gap so more
          items peek into view and invite a swipe, like the reference. */}
      <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar snap-x snap-mandatory">
        {products.map((p, idx) => {
          const override = variantOverrides?.[p.id];
          return (
            <div
              key={p.id}
              className="w-[42%] shrink-0 snap-start sm:w-[180px] md:w-[200px]"
            >
              <ProductCard
                product={p}
                compact
                priority={idx < 2}
                imageOverride={override?.image ?? undefined}
                slugOverride={override?.slug ?? undefined}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}
