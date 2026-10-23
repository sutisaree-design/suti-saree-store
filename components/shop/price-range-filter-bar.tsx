'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { IndianRupee } from 'lucide-react';
import type { PriceRangeBucket } from '@/lib/settings-api';

interface PriceRangeFilterBarProps {
  ranges: PriceRangeBucket[];
  activeId: string | null;
  onSelect: (bucket: PriceRangeBucket | null) => void;
  className?: string;
}

/**
 * Horizontally scrollable "Shop by Price" chip bar — tap a bucket to
 * instantly filter the grid to that price band, tap it again (or "All")
 * to clear it. Buckets themselves come from Admin > Catalog > Price
 * Filters (see lib/settings-api.ts: fetchPriceRangeFilters), so the store
 * owner can add/edit/reorder/remove bands without a code change.
 */
export default function PriceRangeFilterBar({
  ranges,
  activeId,
  onSelect,
  className = '',
}: PriceRangeFilterBarProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  // Only show the right-edge fade when the chips actually overflow the
  // visible width -- with few/short chips there's nothing to hint at, and
  // an always-on fade over a fully-visible row just looked like a stray
  // blank gap rather than a scroll cue.
  const [canScrollRight, setCanScrollRight] = useState(false);

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
    <div className={`${className}`}>
      <p className="mb-2 flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.15em] text-secondary">
        Shop by Price
      </p>
      <div className="relative">
        <div
          ref={scrollerRef}
          className="flex gap-2.5 overflow-x-auto scroll-smooth pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <button
            type="button"
            onClick={() => onSelect(null)}
            aria-pressed={activeId === null}
            className={`flex shrink-0 items-center gap-1.5 rounded-full border px-4 py-2 text-xs font-semibold transition-all ${
              activeId === null
                ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                : 'border-border bg-background text-foreground/80 hover:border-primary/50 hover:text-primary'
            }`}
          >
            All Prices
          </button>
          {ranges.map((bucket) => {
            const isActive = activeId === bucket.id;
            return (
              <button
                key={bucket.id}
                type="button"
                onClick={() => onSelect(isActive ? null : bucket)}
                aria-pressed={isActive}
                className={`flex shrink-0 items-center gap-1 rounded-full border px-4 py-2 text-xs font-semibold whitespace-nowrap transition-all ${
                  isActive
                    ? 'border-primary bg-gradient-to-r from-primary to-primary/80 text-primary-foreground shadow-md shadow-primary/20 scale-[1.03]'
                    : 'border-border bg-background text-foreground/80 hover:border-primary/50 hover:text-primary'
                }`}
              >
                <span
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${
                    isActive ? 'bg-primary-foreground/20' : 'bg-secondary/10 text-secondary'
                  }`}
                >
                  <IndianRupee className="h-2.5 w-2.5" />
                </span>
                {bucket.label}
              </button>
            );
          })}
        </div>
        {canScrollRight && (
          <div className="pointer-events-none absolute right-0 top-0 bottom-2 w-10 bg-gradient-to-l from-background to-transparent" />
        )}
      </div>
    </div>
  );
}
