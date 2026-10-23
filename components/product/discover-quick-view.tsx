'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Loader2 } from 'lucide-react';
import { Product } from '@/lib/types';
import { formatINR, discountPct } from '@/lib/format';
import { getVariantDisplayName } from '@/lib/variant-display-name';
import { useCart } from '@/lib/cart-context';
import { fetchVariantBySlug, VariantWithSizes } from '@/lib/variants-api';
import { toPublicMediaUrl } from '@/lib/media-url';
import { Button } from '@/components/ui/button';
import WishlistButton from '@/components/wishlist-button';
import { Sheet, SheetContent } from '@/components/ui/sheet';

interface DiscoverQuickViewProps {
  product: Product;
  onClose: () => void;
}

/**
 * Same-page product preview opened from the "Discover Products For You"
 * homepage section. Deliberately does NOT try to replicate the full
 * product-detail page's variant-switching complexity (gallery, reviews,
 * highlights, etc.) — just enough for a shopper to see the product,
 * optionally switch colour/size, add it to cart or wishlist it, and
 * either close this and keep browsing or jump to the full page.
 */
export default function DiscoverQuickView({ product, onClose }: DiscoverQuickViewProps) {
  const { addItem } = useCart();
  const [variant, setVariant] = useState<VariantWithSizes | null>(null);
  const [switching, setSwitching] = useState(false);

  // Cards in the Discover grid always link to a product's default colour
  // variant (see product-card.tsx's `href`) — mirror that here so the
  // quick view opens on the same colour a full-page click would land on,
  // instead of always showing the base row's own colour.
  useEffect(() => {
    let cancelled = false;
    setVariant(null);
    if (product.default_variant_slug && product.default_variant_slug !== product.slug) {
      setSwitching(true);
      fetchVariantBySlug(product.default_variant_slug)
        .then((res) => {
          if (!cancelled && res) setVariant(res.variant);
        })
        .catch(() => {})
        .finally(() => {
          if (!cancelled) setSwitching(false);
        });
    }
    return () => {
      cancelled = true;
    };
  }, [product.id, product.default_variant_slug, product.slug]);

  // Merge variant overrides (colour/images/price/sizes) onto the base
  // product — same formula app/product/[slug]/product-detail.tsx uses —
  // so the rest of this component just renders `activeProduct` as usual.
  const activeProduct = useMemo(() => {
    if (!variant) return product;
    const hasSizeData = variant.sizes.length > 0;
    const variantStockQty = variant.sizes.reduce((sum, s) => sum + s.stock_quantity, 0);
    return {
      ...product,
      slug: variant.slug,
      price: variant.price_override ?? product.price,
      images: variant.images.length > 0 ? variant.images : product.images,
      colors: [variant.color],
      sizes: hasSizeData ? variant.sizes.map((s) => s.size) : product.sizes,
      stock_quantity: hasSizeData ? variantStockQty : product.stock_quantity,
      inStock: hasSizeData ? variantStockQty > 0 : product.inStock,
    };
  }, [product, variant]);

  const [selectedSize, setSelectedSize] = useState(activeProduct.sizes[0] ?? '');
  useEffect(() => {
    setSelectedSize(activeProduct.sizes[0] ?? '');
  }, [activeProduct.slug]);

  // Every colour this product comes in — the base row's own colour plus
  // every `product_variants` row — same dedup-by-colour merge product
  // cards use for their swatch dots.
  const swatchVariants = useMemo(() => {
    type Swatch = { slug: string; color: string; image?: string | null };
    const base: Swatch = {
      slug: product.slug,
      color: product.colors?.[0] ?? '',
      image: product.images?.[0] ?? null,
    };
    const seen = new Set<string>();
    const merged: Swatch[] = [];
    for (const v of [base, ...(product.variant_list ?? [])]) {
      const key = v.color.trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      merged.push(v);
    }
    return merged;
  }, [product]);

  const handleSelectColor = (v: { slug: string; color: string }) => {
    if (v.slug === activeProduct.slug) return;
    if (v.slug === product.slug) {
      setVariant(null);
      return;
    }
    setSwitching(true);
    fetchVariantBySlug(v.slug)
      .then((res) => {
        if (res) setVariant(res.variant);
      })
      .catch(() => {})
      .finally(() => setSwitching(false));
  };

  const handleAddToCart = () => {
    if (!activeProduct.inStock) return;
    addItem(activeProduct, selectedSize || activeProduct.sizes[0] || '', 1);
  };

  const discount = discountPct(activeProduct.price, activeProduct.mrp);
  const displayName = getVariantDisplayName(
    product.name,
    product.colors?.[0],
    variant?.color ?? null
  );
  const img =
    toPublicMediaUrl(activeProduct.images[0]) || 'https://placehold.co/800x1000?text=No+Image';

  // Drag-down-to-close on mobile, same touch-handler pattern the cart
  // drawer uses for its horizontal swipe (see components/cart-drawer.tsx)
  // but vertical here since this sheet slides up from the bottom. Only
  // engages once a touch clearly moves more vertically-downward than
  // horizontally, so a horizontal image swipe or a normal vertical scroll
  // of the sheet's own content is never hijacked — and dragging is
  // ignored entirely once the sheet content itself has been scrolled
  // down, so it doesn't fight the scroll.
  const panelRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    lastY: number;
    lastT: number;
    velocity: number;
    mode: 'undecided' | 'vertical' | 'horizontal';
  } | null>(null);

  const onTouchStart = (e: React.TouchEvent) => {
    const panel = panelRef.current;
    if (panel && panel.scrollTop > 0) return;
    const t = e.touches[0];
    dragRef.current = {
      startX: t.clientX,
      startY: t.clientY,
      lastY: t.clientY,
      lastT: Date.now(),
      velocity: 0,
      mode: 'undecided',
    };
  };

  const onTouchMove = (e: React.TouchEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const t = e.touches[0];
    const dx = t.clientX - drag.startX;
    const dy = t.clientY - drag.startY;

    if (drag.mode === 'undecided') {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      drag.mode = Math.abs(dy) > Math.abs(dx) && dy > 0 ? 'vertical' : 'horizontal';
    }
    if (drag.mode !== 'vertical') return;

    e.preventDefault();
    const now = Date.now();
    const dt = now - drag.lastT;
    if (dt > 0) drag.velocity = (t.clientY - drag.lastY) / dt;
    drag.lastY = t.clientY;
    drag.lastT = now;

    const translate = Math.max(0, dy);
    if (panelRef.current) {
      panelRef.current.style.transition = 'none';
      panelRef.current.style.transform = `translateY(${translate}px)`;
    }
  };

  const onTouchEnd = () => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag || drag.mode !== 'vertical' || !panelRef.current) return;

    const dy = Math.max(0, drag.lastY - drag.startY);
    const panelHeight = panelRef.current.offsetHeight || 1;
    const shouldClose = dy > panelHeight * 0.25 || drag.velocity > 0.5;

    if (shouldClose) {
      // Hand off to Radix's own close animation instead of fighting it
      // with our inline transform.
      panelRef.current.style.transition = '';
      panelRef.current.style.transform = '';
      onClose();
    } else {
      panelRef.current.style.transition = 'transform 200ms ease';
      panelRef.current.style.transform = 'translateY(0px)';
    }
  };

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        ref={panelRef}
        side="bottom"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
        className="inset-x-0 bottom-0 max-h-[88vh] overflow-y-auto rounded-t-2xl p-0 sm:inset-x-auto sm:left-1/2 sm:top-1/2 sm:bottom-auto sm:max-h-[85vh] sm:w-full sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:border sm:shadow-xl sm:data-[state=open]:slide-in-from-bottom-0"
      >
        {/* Drag handle — a visual affordance on mobile signalling the sheet
            can be dragged closed, matching the pattern shoppers already
            know from native bottom sheets. Hidden on desktop, where this
            renders as a centred dialog instead. */}
        <div className="flex justify-center pb-1 pt-2 sm:hidden">
          <span className="h-1 w-10 rounded-full bg-border" />
        </div>
        <div className="flex flex-col">
          <div className="relative aspect-[4/5] w-full overflow-hidden bg-muted">
            <Image
              src={img}
              alt={`${displayName} - ${product.fabric} ${product.category}`}
              fill
              sizes="(max-width: 640px) 100vw, 512px"
              className="object-cover"
            />
            {switching && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/40">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            )}
            {!activeProduct.inStock && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/60">
                <span className="rounded bg-primary px-3 py-1 text-xs font-semibold uppercase tracking-wider text-primary-foreground">
                  Out of Stock
                </span>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-3 p-5">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-secondary">
                {product.category}
              </p>
              <h2 className="mt-0.5 font-serif text-lg font-semibold leading-snug text-foreground">
                {displayName}
              </h2>
            </div>

            <div className="flex items-baseline gap-2">
              <span className="font-serif text-xl font-bold text-primary">
                {formatINR(activeProduct.price)}
              </span>
              {activeProduct.mrp && activeProduct.mrp > activeProduct.price && (
                <>
                  <span className="text-sm text-muted-foreground line-through">
                    {formatINR(activeProduct.mrp)}
                  </span>
                  <span className="text-sm font-semibold text-emerald-600">{discount}% off</span>
                </>
              )}
            </div>

            {swatchVariants.length > 1 && (
              <div>
                <p className="mb-1.5 text-xs font-semibold text-foreground">
                  Colour
                  {activeProduct.colors?.[0] && (
                    <span className="ml-1.5 font-normal text-muted-foreground">
                      — {activeProduct.colors[0]}
                    </span>
                  )}
                </p>
                {/* Each colour's own product photo instead of a plain colour
                    dot — a shopper can see exactly what that variation
                    looks like before tapping it, instead of guessing from a
                    swatch (which is unreadable for prints/patterns anyway). */}
                <div className="flex flex-wrap gap-2">
                  {swatchVariants.map((v) => {
                    const isActive = v.slug === activeProduct.slug;
                    const thumb = toPublicMediaUrl(v.image || undefined);
                    return (
                      <button
                        key={v.slug}
                        type="button"
                        title={v.color}
                        aria-label={`View in ${v.color}`}
                        onClick={() => handleSelectColor(v)}
                        className={`relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border-2 transition-transform hover:scale-105 ${
                          isActive
                            ? 'border-primary ring-2 ring-primary/25 ring-offset-1'
                            : 'border-border/70'
                        }`}
                      >
                        {thumb ? (
                          <Image
                            src={thumb}
                            alt={v.color}
                            fill
                            sizes="56px"
                            className="object-cover"
                          />
                        ) : (
                          <span
                            className="block h-full w-full"
                            style={{ backgroundColor: v.color.toLowerCase().replace(/\s+/g, '') }}
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {activeProduct.sizes.length > 0 && (
              <div>
                <p className="mb-1.5 text-xs font-semibold text-foreground">Size</p>
                <div className="flex flex-wrap gap-2">
                  {activeProduct.sizes.map((size) => (
                    <button
                      key={size}
                      type="button"
                      onClick={() => setSelectedSize(size)}
                      className={`min-w-[2.75rem] rounded-full border px-3 py-1.5 text-xs font-semibold transition-all ${
                        selectedSize === size
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border bg-background text-foreground/80 hover:border-primary/50'
                      }`}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-1 flex items-center gap-2">
              <Button
                onClick={handleAddToCart}
                disabled={!activeProduct.inStock}
                className="flex-1"
              >
                {activeProduct.inStock ? 'Add to Cart' : 'Out of Stock'}
              </Button>
              <WishlistButton
                productId={activeProduct.id}
                className="static h-10 w-10 border border-border/60"
              />
            </div>

            <Link
              href={`/product/${activeProduct.slug}`}
              onClick={onClose}
              className="mt-1 text-center text-sm font-medium text-primary hover:underline"
            >
              View full details →
            </Link>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
