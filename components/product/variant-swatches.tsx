'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { fetchVariantBySlug, fetchVariantsForProduct, ProductVariant } from '@/lib/variants-api';
import { getPrefetchedVariant, setPrefetchedVariant } from '@/lib/variant-prefetch-cache';
import { toPublicMediaUrl } from '@/lib/media-url';
import { THUMB_BLUR_DATA_URL, isShimmerEnabled } from '@/lib/image-placeholder';

export default function VariantSwatches({
  productId,
  initialVariants,
  activeSlug,
  onSelect,
  baseVariant,
}: {
  productId: string;
  /** Server-fetched swatches (see app/product/[slug]/page.tsx). When present
   *  they render in the first HTML and the browser skips its own request. */
  initialVariants?: ProductVariant[];
  /** Currently viewed variant slug, or undefined when on the base product page. */
  activeSlug?: string;
  /** Called with the clicked variant; the parent swaps images/price/sizes in place — no page navigation. */
  onSelect: (variant: ProductVariant) => void;
  /**
   * The base product's own colour, represented as a synthetic ProductVariant
   * (id: '__base__') so it can sit in this same list. A product's original
   * colour lives only on the `products` row, never in `product_variants` --
   * so without this, the moment a vendor added their first *real* variant
   * (e.g. White), the product's original colour (e.g. Green) would silently
   * vanish from the swatch list, leaving only the newly-added ones. Pass
   * `null` when the base product has no colour worth showing.
   */
  baseVariant: ProductVariant | null;
}) {
  const [fetchedVariants, setFetchedVariants] = useState<ProductVariant[]>(initialVariants ?? []);

  // Background-preload the OTHER colours' photos the moment this page is
  // viewed, so the very first colour switch is instant instead of showing
  // a network-fetch delay (that delay only ever hit the *first* switch --
  // any switch back afterwards was already browser-cached, which is why it
  // looked like it "fixed itself" after the first try). Delayed via
  // requestIdleCallback so it never competes with the current colour's own
  // photos for bandwidth/priority on first paint, and restricted to a
  // WiFi/4G-class connection -- skipped entirely on 3G, 2G, slow-2G, or
  // Data Saver, so it never costs someone on a slower/metered connection
  // any bandwidth they didn't ask for.
  const [preloadReady, setPreloadReady] = useState(false);
  useEffect(() => {
    const conn = (navigator as any).connection;
    if (conn) {
      if (conn.saveData) return;
      if (conn.effectiveType && conn.effectiveType !== '4g') return;
    }
    const idle =
      (window as any).requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 1200));
    const cancelIdle = (window as any).cancelIdleCallback ?? window.clearTimeout;

    // PERF (Task 4): previously this started on idle right after load, which
    // downloaded 2 full-size photos for EVERY other colour even if the
    // visitor never touched a swatch (hundreds of KiB, flagged by
    // PageSpeed "Improve image delivery" / "Avoid enormous network
    // payloads"). Now it waits for the first real interaction (tap,
    // scroll, key, mouse move) and only then warms the other colours, so
    // the first swatch switch is still fast for anyone actually browsing.
    const EVENTS = ['pointerdown', 'touchstart', 'keydown', 'scroll', 'mousemove'] as const;
    let handle: any;
    let fired = false;
    const onInteract = () => {
      if (fired) return;
      fired = true;
      EVENTS.forEach((e) => window.removeEventListener(e, onInteract));
      handle = idle(() => setPreloadReady(true));
    };
    EVENTS.forEach((e) => window.addEventListener(e, onInteract, { passive: true }));
    return () => {
      EVENTS.forEach((e) => window.removeEventListener(e, onInteract));
      if (handle !== undefined) cancelIdle(handle);
    };
  }, []);

  // Only hit the network when the server didn't hand us this product's
  // swatches (e.g. client-side navigation to another product). Tracks which
  // product the current list belongs to so a stale list is never reused.
  const loadedForRef = useRef<string | null>(initialVariants ? productId : null);
  useEffect(() => {
    if (loadedForRef.current === productId) return;
    let cancelled = false;
    fetchVariantsForProduct(productId)
      .then((v) => {
        if (cancelled) return;
        loadedForRef.current = productId;
        setFetchedVariants(v);
      })
      .catch(() => {
        if (!cancelled) setFetchedVariants([]);
      });
    return () => {
      cancelled = true;
    };
  }, [productId]);

  // Prepend the base product's own colour, unless a real variant row
  // already represents it (matched by slug or by colour name, case-
  // insensitive) -- avoids showing the same colour twice.
  const variants = useMemo(() => {
    if (!baseVariant) return fetchedVariants;
    const alreadyRepresented = fetchedVariants.some(
      (v) =>
        v.slug === baseVariant.slug ||
        v.color.trim().toLowerCase() === baseVariant.color.trim().toLowerCase()
    );
    return alreadyRepresented ? fetchedVariants : [baseVariant, ...fetchedVariants];
  }, [fetchedVariants, baseVariant]);

  // Same idea as the image preload above, taken one step further: once
  // we're idle on a fast-enough connection, walk every OTHER colour and
  // fetch its full row (sizes/stock included, not just photos) into the
  // shared module-level cache in lib/variant-prefetch-cache.ts. That's the
  // one piece handleSelectVariant in product-detail.tsx still had to hit
  // the network for on every switch — with this warmed, a colour switch
  // resolves entirely from memory (images already preloaded above, sizes
  // now cached here), so the shopper never sees the "sizes fill in a
  // moment later" gap, no matter which colour they pick first.
  //
  // Sequential, not Promise.all — this is background, best-effort work
  // competing with nothing the shopper is waiting on, so there's no reason
  // to burst every colour's request at once; one at a time is kinder to
  // the connection this was already gated to (see preloadReady above) and
  // to Supabase.
  useEffect(() => {
    if (!preloadReady) return;
    let cancelled = false;
    (async () => {
      for (const v of variants) {
        if (cancelled) return;
        if (v.id === '__base__' || v.slug === activeSlug) continue;
        if (getPrefetchedVariant(v.slug)) continue;
        try {
          const res = await fetchVariantBySlug(v.slug);
          if (res && !cancelled) setPrefetchedVariant(v.slug, res.variant);
        } catch {
          // Best-effort — a failed prefetch just means that one colour
          // falls back to the normal on-click fetch, same as before this
          // cache existed.
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [preloadReady, variants, activeSlug]);

  // Nothing to switch between if the vendor hasn't added any extra
  // colours yet -- same as before, only showing the base colour alone
  // would just be noise.
  if (fetchedVariants.length === 0) return null;

  // The strip scrolls horizontally on mobile (see the `overflow-x-auto`
  // row below) and doesn't wrap. Opening a product straight into a colour
  // that happens to sit further along the list (e.g. its own SEO page,
  // or the last colour added) mounted with the strip scrolled all the
  // way to the left, so the selected swatch's highlighted border was
  // technically correct but scrolled off-screen -- looked like nothing
  // was selected at all. Scrolling the active swatch into view whenever
  // it changes (including on first mount, once the list has loaded) keeps
  // the highlighted colour actually visible no matter where it falls in
  // the list.
  return <VariantSwatchList variants={variants} activeSlug={activeSlug} onSelect={onSelect} preloadReady={preloadReady} />;
}

function VariantSwatchList({
  variants,
  activeSlug,
  onSelect,
  preloadReady,
}: {
  variants: ProductVariant[];
  activeSlug?: string;
  onSelect: (variant: ProductVariant) => void;
  preloadReady: boolean;
}) {
  const activeBtnRef = useRef<HTMLButtonElement | null>(null);
  // Same Admin > Settings > "Shimmer Placeholder" toggle the main gallery
  // and full-screen zoom read (see lib/image-placeholder.ts). These small
  // colour-swatch thumbnails have no real per-image preview to fall back
  // to, so only the shimmer toggle applies here (not "Real Photo
  // Previews", which has nothing to do). Previously these thumbnails had
  // no placeholder at all.
  const blurEnabled = isShimmerEnabled();

  useEffect(() => {
    activeBtnRef.current?.scrollIntoView({ behavior: 'auto', inline: 'center', block: 'nearest' });
  }, [activeSlug, variants]);

  return (
    <div className="min-w-0">
      <p className="mb-2 text-sm font-semibold">
        Colour
        {activeSlug && (
          <span className="ml-1.5 font-normal text-muted-foreground">
            — {variants.find((v) => v.slug === activeSlug)?.color}
          </span>
        )}
      </p>
      {/* Mobile: one horizontally-scrollable line, same feel as the product
          gallery's thumbnail strip (no-scrollbar + native overflow-x
          scroll) instead of wrapping to a second row. Desktop keeps the
          original wrapping layout since there's usually room for it. */}
      <div className="no-scrollbar flex gap-3 overflow-x-auto sm:flex-wrap sm:overflow-visible">
        {variants.map((v) => {
          const isActive = v.slug === activeSlug;
          const thumb = v.images[0];
          return (
            <button
              key={v.id}
              ref={isActive ? activeBtnRef : undefined}
              type="button"
              onClick={() => onSelect(v)}
              title={v.color}
              aria-label={`View in ${v.color}`}
              className="group flex shrink-0 flex-col items-center gap-1.5"
            >
              <span
                className={`relative block h-16 w-14 shrink-0 overflow-hidden rounded-md border-2 bg-muted ${
                  isActive
                    ? 'border-primary ring-2 ring-primary/25 ring-offset-1'
                    : 'border-border/70 hover:border-primary/40'
                }`}
              >
                {thumb ? (
                  <Image
                    src={thumb}
                    alt={v.color}
                    fill
                    draggable={false}
                    onDragStart={(e) => e.preventDefault()}
                    sizes="56px"
                    quality={60}
                    // Below-the-fold-ish helper images: let the hero photo (LCP)
                    // win the bandwidth race on slow phones.
                    fetchPriority="low"
                    placeholder={blurEnabled ? 'blur' : undefined}
                    blurDataURL={blurEnabled ? THUMB_BLUR_DATA_URL : undefined}
                    className="select-none object-cover"
                  />
                ) : v.color_hex ? (
                  <span className="block h-full w-full" style={{ backgroundColor: v.color_hex }} />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-[10px] font-semibold uppercase text-muted-foreground">
                    {v.color.slice(0, 2)}
                  </span>
                )}
              </span>
              <span
                className={`max-w-[4rem] truncate text-[11px] ${
                  isActive ? 'font-semibold text-primary' : 'text-muted-foreground'
                }`}
              >
                {v.color}
              </span>
            </button>
          );
        })}
      </div>

      {/* Invisible — never shown, never affects layout. Renders the same
          <Image> the main gallery stage renders (identical src/sizes/quality
          props, see components/product/product-gallery.tsx) so the browser
          fetches and caches the EXACT url the gallery will request once the
          shopper actually taps this colour. Only the first 2 photos per
          colour are warmed (front + back), which covers the common
          one-or-two-swipe glance without preloading a whole gallery's worth
          of photos for colours that might never get picked. */}
      {preloadReady && (
        <div aria-hidden className="pointer-events-none absolute h-0 w-0 overflow-hidden opacity-0">
          {variants
            .filter((v) => v.slug !== activeSlug)
            .flatMap((v) =>
              v.images.slice(0, 2).map((raw, i) => {
                const src = toPublicMediaUrl(raw);
                if (!src) return null;
                return (
                  <div key={`${v.id}-${i}`} className="relative h-px w-px">
                    <Image
                      src={src}
                      alt=""
                      fill
                      sizes="(max-width: 1024px) 100vw, 50vw"
                      quality={80}
                      loading="eager"
                    />
                  </div>
                );
              })
            )}
        </div>
      )}
    </div>
  );
}
