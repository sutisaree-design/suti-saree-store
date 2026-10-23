'use client';

import Link from 'next/link';
import Image from 'next/image';
import { ChevronRight, ImageOff } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useProducts, ProductsProvider } from '@/lib/cart-context';
import { Skeleton } from '@/components/ui/skeleton';
import { THUMB_BLUR_DATA_URL, isShimmerEnabled } from '@/lib/image-placeholder';

// Alternating soft tints (built from the site's own primary/secondary
// theme tokens, not hardcoded hex) so each row reads as a distinct card
// the way the reference layout does, without introducing a new palette.
const TINTS = [
  'bg-primary/10',
  'bg-secondary/15',
  'bg-primary/5',
  'bg-secondary/10',
];

// Broad "type" groups used only when there are enough categories that a
// keyword grouping is actually useful (e.g. 10+ categories spanning many
// saree/kurti/lehenga variants). With only a couple of categories, tapping
// a chip should just show that exact category, so we fall back to the
// literal category names in that case (see `groups` below). Falls back to
// "Other" for anything that doesn't match a known keyword, so a brand-new
// admin-created category never disappears — it just lands in "Other"
// until re-classified.
const GROUP_RULES: { label: string; test: (name: string) => boolean }[] = [
  { label: 'Sarees', test: (n) => /saree/i.test(n) },
  { label: 'Kurti', test: (n) => /kurt[ai]/i.test(n) },
  { label: 'Lehenga', test: (n) => /lehenga/i.test(n) },
  { label: 'Suits', test: (n) => /suit|anarkali/i.test(n) },
  { label: 'Bridal', test: (n) => /bridal/i.test(n) },
  { label: 'Gowns', test: (n) => /gown/i.test(n) },
  { label: 'Palazzo', test: (n) => /palazzo/i.test(n) },
  { label: 'Blouse', test: (n) => /blouse/i.test(n) },
  { label: 'Dress', test: (n) => /dress/i.test(n) },
  { label: 'Fabric & Accessories', test: (n) => /dupatta|stole|fabric/i.test(n) },
];

function groupFor(name: string): string {
  return GROUP_RULES.find((g) => g.test(name))?.label ?? 'Other';
}

export default function CategoriesPage() {
  return (
    <ProductsProvider>
      <CategoriesPageContent />
    </ProductsProvider>
  );
}

// Needs the full catalog (to group products by category) — ProductsProvider
// is no longer mounted at the root, so this page mounts its own copy.
function CategoriesPageContent() {
  const { products, categories, loading } = useProducts();
  const [activeGroup, setActiveGroup] = useState('All');

  // Fully dynamic: every row is derived from whatever categories exist in
  // Supabase right now, and the circular thumbnails are pulled live from
  // whichever products currently belong to that category. Add a category
  // in admin → a new row appears here automatically. Delete one → it's
  // gone. Add/remove/replace product photos → the circles update with them,
  // no code change needed anywhere.
  //
  // Categories with zero products are dropped entirely — a shopper tapping
  // into an empty category is a dead end, so it's better to just not show
  // it until it has something in it.
  const rows = useMemo(() => {
    return categories
      .map((c) => {
        const inCat = products.filter((p) => p.category === c.name);
        const thumbs = inCat
          .slice()
          .sort((a, b) => Number(!!b.featured) - Number(!!a.featured))
          .slice(0, 3)
          .map((p) => p.images[0])
          .filter(Boolean) as string[];
        // Count every colour variation as its own product, not just the
        // base listing -- a product with 3 added colours (via
        // `variant_list`, see lib/products-api.ts) contributes 4 to the
        // count here (its own base colour + 3 variants), matching how
        // shoppers actually browse (each colour is its own card/page).
        const count = inCat.reduce((sum, p) => sum + 1 + (p.variant_list?.length ?? 0), 0);
        return { ...c, count, thumbs, group: groupFor(c.name) };
      })
      .filter((c) => c.count > 0);
  }, [categories, products]);

  // Always group by type (Sarees, Kurti, Lehenga, ...) instead of by the
  // literal category name. This way "Cotton Sarees" and "Silk Sarees" both
  // roll up under one "Sarees" chip, and tapping it shows every saree
  // category together. A brand-new category created in admin is matched
  // against GROUP_RULES automatically by name — if it matches an existing
  // keyword (e.g. a new "Georgette Sarees" category matches /saree/i) it
  // simply joins that chip with zero code changes. If it matches nothing,
  // it falls into a base "Other" chip instead of disappearing, so the
  // filter bar never needs manual updates when categories are added.
  //
  // Only show chips that actually have at least one visible category
  // behind them, in a stable order (not alphabetical — Sarees/Kurti/
  // Lehenga first since those are the highest-traffic types when grouped).
  const groups = useMemo(() => {
    const present = new Set(rows.map((c) => c.group));
    const ordered = GROUP_RULES.map((g) => g.label).filter((g) => present.has(g));
    if (present.has('Other')) ordered.push('Other');
    return ['All', ...ordered];
  }, [rows]);

  const visibleRows = useMemo(() => {
    if (activeGroup === 'All') return rows;
    return rows.filter((c) => c.group === activeGroup);
  }, [rows, activeGroup]);

  return (
    <div className="container-boutique py-8 pb-24 md:pb-12">
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-secondary">
          Explore
        </p>
        <h1 className="mt-1 font-serif text-3xl font-bold text-primary sm:text-4xl">
          Shop by Category
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {loading
            ? 'Loading…'
            : `${rows.length} ${rows.length === 1 ? 'category' : 'categories'}`}
        </p>
      </div>

      {!loading && groups.length > 2 && (
        <div className="no-scrollbar mb-5 -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {groups.map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setActiveGroup(g)}
              className={`shrink-0 rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${
                activeGroup === g
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-background text-foreground hover:bg-muted'
              }`}
            >
              {g}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-2xl" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border py-20 text-center">
          <p className="font-serif text-lg font-semibold">No categories yet</p>
          <p className="text-sm text-muted-foreground">
            Categories with products will show up here.
          </p>
        </div>
      ) : visibleRows.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border py-20 text-center">
          <p className="font-serif text-lg font-semibold">Nothing in {activeGroup} yet</p>
          <p className="text-sm text-muted-foreground">Try another filter above.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {visibleRows.map((c, i) => (
            <Link
              key={c.id}
              href={`/category/${c.slug}`}
              className={`group flex items-center justify-between gap-4 rounded-2xl px-5 py-4 transition-transform active:scale-[0.98] ${TINTS[i % TINTS.length]}`}
            >
              <div className="min-w-0">
                <h2 className="font-serif text-lg font-semibold text-foreground sm:text-xl">
                  {c.name}
                </h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {c.count} {c.count === 1 ? 'product' : 'products'}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-3">
                <div className="flex items-center -space-x-3">
                  {c.thumbs.length > 0 ? (
                    c.thumbs.map((src, idx) => (
                      <div
                        key={idx}
                        className="relative h-14 w-14 overflow-hidden rounded-full border-2 border-background bg-muted shadow-sm sm:h-16 sm:w-16"
                        style={{ zIndex: c.thumbs.length - idx }}
                      >
                        <Image
                          src={src}
                          alt={`${c.name} product`}
                          fill
                          sizes="64px"
                          quality={70}
                          loading="lazy"
                          placeholder={isShimmerEnabled() ? 'blur' : undefined}
                          blurDataURL={isShimmerEnabled() ? THUMB_BLUR_DATA_URL : undefined}
                          className="object-cover"
                        />
                      </div>
                    ))
                  ) : (
                    <div className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-background bg-muted text-muted-foreground sm:h-16 sm:w-16">
                      <ImageOff className="h-5 w-5" />
                    </div>
                  )}
                </div>
                <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
