'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Bell, ShoppingBag, Star, Zap } from 'lucide-react';
import { Product } from '@/lib/types';
import { formatINR, discountPct } from '@/lib/format';
import { getVariantDisplayName } from '@/lib/variant-display-name';
import { useCart, getVisibleBogoPromotion, formatBogoLabel, usePaymentDiscount } from '@/lib/cart-context';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import WishlistButton from '@/components/wishlist-button';
import NotifyMeDialog from '@/components/product/notify-me-dialog';
import CatalogCardMedia from '@/components/catalog-card-media';
import { toPublicMediaUrl, toPublicMediaUrls } from '@/lib/media-url';
import { preloadImages, preloadImagesOnHover, cancelHoverPreload } from '@/lib/preload-image';
import { Truck } from 'lucide-react';

export default function ProductCard({
  product,
  priority = false,
  compact = false,
  imageOverride,
  slugOverride,
  disableAutoplayVideo = false,
  blurPreviews,
}: {
  product: Product;
  /** Set true for cards in the first visible row so their image gets
   *  preloaded instead of lazy-loaded — improves LCP on the shop/home grid. */
  priority?: boolean;
  /** Smaller padding/type for horizontal carousels (Similar Products,
   *  Recently Viewed) where cards sit in a narrower, scrollable strip. */
  compact?: boolean;
  /**
   * Used by "search by photo" results: the exact photo (which may be a
   * colour variant's photo, not the product's default image) that actually
   * matched the shopper's uploaded photo. When present it takes priority
   * over the product's own default/first image, so a shopper who searched
   * with a photo of the "blue" variant sees that blue photo on the card
   * instead of whatever colour happens to be the product's default.
   */
  imageOverride?: string;
  /** When a search query matches a specific colour variant, pass that
   *  variant's slug so the card links directly to that colour. */
  slugOverride?: string;
  /**
   * Forces this card to show its still image even when the admin has
   * "Autoplay video in catalog" switched on for the product. Used on the
   * /search results grid so a shopper sees exactly the photo (colour
   * variant match, etc.) that corresponds to their search instead of an
   * autoplaying video -- /shop, category pages and everywhere else keep
   * the autoplay video untouched.
   */
  disableAutoplayVideo?: boolean;
  /** Real per-image blur previews (LQIP), canonical-URL -> data URL, fetched
   *  server-side by the /shop and /category pages (see their page.tsx).
   *  CatalogCardMedia falls back to the generic shimmer for any photo not
   *  present here. */
  blurPreviews?: Record<string, string>;
}) {
  const { addItem, activePromotions } = useCart();
  const router = useRouter();
  const [notifyOpen, setNotifyOpen] = useState(false);
  // The card shows (and links to) the default colour variant, so its stock state is that
  // colour's real stock -- not the base product's flag, which can say "in stock" while this
  // colour is sold out. Exploded per-colour cards already carry their own `inStock`.
  const inStock = product.default_variant_in_stock ?? product.inStock;

  // Part 4b: tag products currently inside an active BOGO promotion's
  // scope, same "is this product in scope" rule the cart itself uses to
  // apply the discount (see getVisibleBogoPromotion in
  // lib/cart-context.tsx) — so the badge and the actual discount never
  // disagree about which products are on offer. Also respects the
  // per-collection "show BOGO badge" toggle (Admin > Collections).
  const bogoPromotion = getVisibleBogoPromotion(product.id, activePromotions);

  const openNotify = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setNotifyOpen(true);
  };

  const quickAdd = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!inStock) {
      router.push(`/product/${product.slug}`);
      return;
    }
    const size = product.sizes[0];
    addItem(inStock ? product : { ...product, inStock: false }, size, 1);
  };

  // The category and collection labels sit inside the card's outer <Link>,
  // so a nested <a> isn't valid HTML -- instead these stop the click from
  // bubbling to the card link and navigate imperatively themselves.
  const goToCategory = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    router.push(`/shop?category=${encodeURIComponent(product.category)}`);
  };
  const goToCollection = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (product.collection) router.push(`/collection/${product.collection.slug}`);
  };
  // Same nested-inside-<Link> constraint as goToCategory/goToCollection
  // above -- stop the click from following the card's own href (which
  // points at the default variant) and send it straight to the colour
  // that was actually clicked.
  const goToVariant = (e: React.MouseEvent, variant: (typeof swatchVariants)[number]) => {
    e.preventDefault();
    e.stopPropagation();
    router.push(`/product/${variant.slug}`);
  };

  const discount = discountPct(product.price, product.mrp);
  // Same "pay online, save X%" banner shown on the product page (see
  // app/product/[slug]/product-detail.tsx) -- short/no-dialog version for
  // the catalog card. No coupon context here, so it's just a flat percent
  // off the card's listed price.
  const { paymentDiscount } = usePaymentDiscount();
  const onlinePaymentSavings =
    paymentDiscount.enabled && paymentDiscount.percent > 0
      ? Math.round((product.price * paymentDiscount.percent) / 100)
      : 0;
  // Every colour this card can switch straight to: the base product's own
  // colour (product_variants rows never include it) plus every real
  // variant. Deduped by colour name so a base colour already re-added as
  // a variant row doesn't show twice. Each entry carries the slug the
  // swatch should link to and the image it should preview on hover.
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
  // Set while a shopper is hovering/focusing a swatch dot -- swaps the
  // card's photo to that colour's photo so they can see it before
  // committing to the click, same pattern as the product-detail gallery.
  const [previewVariant, setPreviewVariant] = useState<(typeof swatchVariants)[number] | null>(null);
  // When this product has colour variants, the card should show and link to
  // the default one -- shoppers land straight on that colour, and clicking
  // through from shop/category always opens that exact variant.
  const href = `/product/${slugOverride || product.default_variant_slug || product.slug}`;
  const img = toPublicMediaUrl(
    previewVariant?.image || imageOverride || product.default_variant_image || product.images[0]
  ) || 'https://placehold.co/800x1000?text=No+Image';
  const hoverImg = toPublicMediaUrl(product.images[1]) || undefined;
  // Real per-image blur preview for this exact card's photo(s), if the
  // server-side backfill has generated one yet (see blurPreviews prop doc
  // above). CatalogCardMedia falls back to the generic shimmer when this
  // is undefined -- e.g. previewVariant/imageOverride swaps the photo to
  // one that wasn't in the batch /shop or /category prefetched.
  const blurDataUrl = blurPreviews?.[img];
  const hoverBlurDataUrl = hoverImg ? blurPreviews?.[hoverImg] : undefined;
  // The card's photo (`img` above) can be the default variant's photo,
  // which may be a different colour than the base product's own name/first
  // photo (e.g. base "Maroon Handloom Kurti" with a "Blue" default variant).
  // Swap the base colour for the variant's colour the same way the product
  // detail page does, so the name/alt text shown always matches the photo
  // actually on screen instead of contradicting it.
  const displayName = getVariantDisplayName(product.name, product.colors?.[0], product.default_variant_color);
  const altText = `${displayName} - ${product.fabric} ${product.category} from ${product.origin}`;

  // The product-detail page opens straight into these images (its gallery's
  // first slide, or the swapped-in variant photo the card already shows), so
  // preloading them here means the click lands on an image already sitting
  // in the browser's cache -- no spinner/blank flash on the detail page.
  // Only the first 1-2 matter: that's all that's visible before the shopper
  // can even start scrolling the gallery.
  const detailPagePreloadImages = toPublicMediaUrls([
    imageOverride || product.default_variant_image || product.images[0],
    product.images[1],
  ]);

  const startPreload = () => preloadImagesOnHover(detailPagePreloadImages);
  // A touch is already a committed tap toward navigation (unlike a mouse
  // hover, which can just be passing over the grid) -- fire immediately,
  // no debounce, so the fetch has the maximum possible head start before
  // the page transition completes.
  const startPreloadImmediate = () => preloadImages(detailPagePreloadImages);

  return (
    <>
    <Link
      href={href}
      onMouseEnter={startPreload}
      onMouseLeave={cancelHoverPreload}
      onTouchStart={startPreloadImmediate}
      onFocus={startPreload}
      className="group relative flex flex-col overflow-hidden rounded-2xl bg-card shadow-sm transition-shadow duration-300 hover:shadow-lg product-card-hover"
    >
      <div className="relative overflow-hidden">
        <CatalogCardMedia
          img={img}
          hoverImg={hoverImg}
          altText={altText}
          videoUrl={toPublicMediaUrl(product.video_url) || undefined}
          autoplayVideo={!disableAutoplayVideo && !!product.autoplay_video_in_catalog}
          priority={priority}
          compact={compact}
          blurDataUrl={blurDataUrl}
          hoverBlurDataUrl={hoverBlurDataUrl}
        />
        <div className="absolute left-3 top-3 flex flex-col items-start gap-1.5">
          {/* Admin toggles "Featured" per product in the dashboard — shown
              here as a Bestseller tag, so it updates the moment they flip it. */}
          {!inStock && (
            <Badge className="gap-1.5 border-white/10 bg-gradient-to-r from-neutral-900 to-neutral-700 tracking-wide text-white shadow-md hover:from-neutral-900 hover:to-neutral-700">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-400" />
              Out of Stock
            </Badge>
          )}
          {inStock && product.featured && (
            <Badge className="bg-emerald-600 text-white shadow-sm hover:bg-emerald-600">
              Bestseller
            </Badge>
          )}
          {inStock && discount > 0 && (
            <Badge className="border-transparent bg-rose-500 text-white shadow-sm hover:bg-rose-500">
              {discount}% OFF
            </Badge>
          )}
          {bogoPromotion && (
            <Badge className="border-transparent bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary">
              {formatBogoLabel(bogoPromotion)}
            </Badge>
          )}
        </div>
        <WishlistButton productId={product.id} className="absolute right-3 top-3" />
        {!inStock && (
          <div className="pointer-events-none absolute inset-0 bg-background/55" />
        )}
        {inStock ? (
          <Button
            onClick={quickAdd}
            size="sm"
            className="absolute bottom-3 right-3 hidden gap-1 rounded-full bg-primary/95 opacity-0 shadow-md transition-all duration-300 pointer-events-none group-hover:pointer-events-auto group-hover:opacity-100 hover:bg-primary sm:flex"
            aria-label="Add to bag"
          >
            <ShoppingBag className="h-4 w-4" />
            Add
          </Button>
        ) : (
          <button
            type="button"
            onClick={openNotify}
            aria-label={`Notify me when ${displayName} is back in stock`}
            className="absolute inset-x-3 bottom-3 z-10 flex items-center justify-center gap-1.5 rounded-full border border-primary/20 bg-white/90 py-2 text-xs font-semibold text-primary shadow-lg backdrop-blur transition hover:bg-white"
          >
            <Bell className="h-3.5 w-3.5" />
            Notify me
          </button>
        )}
      </div>

      <div className={`flex flex-1 flex-col gap-1 ${compact ? 'p-2.5' : 'p-4'}`}>
        <div className="flex flex-col gap-0.5">
          <p className="flex flex-wrap items-center gap-x-1.5 text-[11px] font-semibold uppercase tracking-wider text-secondary">
            <span
              onClick={goToCategory}
              className="cursor-pointer hover:underline"
            >
              {product.category}
            </span>
            {product.collection && (
              <>
                <span className="text-secondary/40">·</span>
                <span
                  onClick={goToCollection}
                  className="cursor-pointer text-foreground/60 hover:underline"
                >
                  {product.collection.name}
                </span>
              </>
            )}
          </p>
          <span className="flex items-center gap-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-600">
            <Truck className="h-3 w-3" />
            Free Delivery
          </span>
        </div>
        <h3 className={`line-clamp-2 font-serif font-semibold leading-snug text-foreground ${compact ? 'text-xs' : 'text-sm'}`}>
          {displayName}
        </h3>
        {product.reviews > 0 && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Star className="h-3 w-3 fill-secondary text-secondary" />
            <span>{product.rating.toFixed(1)}</span>
            <span>·</span>
            <span>{product.reviews} reviews</span>
          </div>
        )}
        <div className="mt-1 flex items-baseline gap-2">
          <span className={`font-serif font-bold text-primary ${compact ? 'text-sm' : 'text-base'}`}>
            {formatINR(product.price)}
          </span>
          {product.mrp && product.mrp > product.price && (
            <>
              <span className="text-xs text-muted-foreground line-through">
                {formatINR(product.mrp)}
              </span>
              <span className="text-xs font-semibold text-emerald-600">
                {discount}% off
              </span>
            </>
          )}
        </div>

        {onlinePaymentSavings > 0 && (
          <div className="mt-0.5 flex items-center gap-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
            <Zap className="h-3 w-3 shrink-0 fill-emerald-600 text-emerald-600" />
            <span>
              Get this at {formatINR(Math.max(0, product.price - onlinePaymentSavings))} online
            </span>
          </div>
        )}

        {swatchVariants.length > 1 && (
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {swatchVariants.map((v) => (
              <button
                key={v.slug}
                type="button"
                title={v.color}
                aria-label={`View in ${v.color}`}
                onClick={(e) => goToVariant(e, v)}
                onMouseEnter={() => setPreviewVariant(v)}
                onMouseLeave={() => setPreviewVariant(null)}
                onFocus={() => setPreviewVariant(v)}
                onBlur={() => setPreviewVariant(null)}
                className={`h-3.5 w-3.5 shrink-0 rounded-full border transition-transform hover:scale-125 ${
                  previewVariant?.slug === v.slug
                    ? 'border-primary ring-1 ring-primary ring-offset-1'
                    : 'border-border/70'
                }`}
                style={{ backgroundColor: v.color.toLowerCase().replace(/\s+/g, '') }}
              />
            ))}
          </div>
        )}
      </div>
    </Link>
    {notifyOpen && !inStock && (
      <NotifyMeDialog
        open={notifyOpen}
        onOpenChange={setNotifyOpen}
        productId={product.id}
        name={displayName}
        image={img}
        color={product.default_variant_color ?? product.colors?.[0] ?? null}
        slug={product.default_variant_slug || product.slug}
      />
    )}
    </>
  );
}
