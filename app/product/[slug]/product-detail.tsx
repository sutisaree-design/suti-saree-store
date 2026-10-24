'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Star,
  ShoppingBag,
  Truck,
  ShieldCheck,
  RefreshCw,
  Gift,
  Lock,
  ChevronRight,
  Minus,
  Plus,
  Zap,
  HelpCircle,
} from 'lucide-react';
import { useProducts, usePaymentDiscount, useCart, getVisibleBogoPromotion, formatBogoLabel } from '@/lib/cart-context';
import { fetchProductBySlug } from '@/lib/products-api';
import { fetchVariantBySlug, fetchVariantsForProduct, ProductVariant, VariantWithSizes } from '@/lib/variants-api';
import { getPrefetchedVariant, setPrefetchedVariant } from '@/lib/variant-prefetch-cache';
import { Product } from '@/lib/types';
import { formatINR, discountPct } from '@/lib/format';
import { fireGtagEvent, feedMatchedItemId } from '@/lib/gtag-track';
import {
  FulfillmentSettings,
  DEFAULT_FULFILLMENT_SETTINGS,
  fetchFulfillmentSettings,
  shippingReturnsSummary,
  returnWindowBadgeText,
} from '@/lib/marketing-api';
import { fetchShippingSettings } from '@/lib/pincode-api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import ReviewsSection from '@/components/product/reviews-section';
import { fetchApprovedReviews, summarizeReviews, RatingSummary } from '@/lib/reviews-api';
import DeliveryInfo from '@/components/product/delivery-info';
import VariantSwatches from '@/components/product/variant-swatches';
import ProductHighlights from '@/components/product/product-highlights';
import PriceQuickBrowseBar from '@/components/product/price-quick-browse-bar';
import BogoOfferSheet from '@/components/product/bogo-offer-sheet';
import SizeChart from '@/components/product/size-chart';
import ProductGallery from '@/components/product/product-gallery';
import { toPublicMediaUrl, toPublicMediaUrls } from '@/lib/media-url';
import MobileStickyCartBar from '@/components/product/mobile-sticky-cart-bar';
import RelatedProducts from '@/components/product/related-products';
import VendorCollection from '@/components/product/vendor-collection';
import RecentlyViewedSection from '@/components/product/recently-viewed';
import PromoSlider from '@/components/home/promo-slider';
import NotifyMeForm from '@/components/product/notify-me-form';
import LowStockBadge from '@/components/growth/low-stock-badge';
import LiveViewersBadge from '@/components/growth/live-viewers-badge';
import CouponList from '@/components/product/coupon-list';
import WishlistButton from '@/components/wishlist-button';
import ShareButton from '@/components/share-button';
import { Coupon, validateCoupon } from '@/lib/coupons-api';
import {
  fetchLoyaltySettings,
  fetchMyLoyaltyBalance,
  DEFAULT_LOYALTY_SETTINGS,
  type LoyaltySettings,
} from '@/lib/loyalty-api';
import FrequentlyBoughtTogether from '@/components/product/frequently-bought-together';
import { addRecentlyViewed } from '@/lib/recently-viewed';
import { trackEvent } from '@/lib/track-api';
import { useAuth } from '@/lib/auth-context';
import { toast } from 'sonner';
import { markCheckoutEntry } from '@/lib/checkout-return';
import { getVariantDisplayName } from '@/lib/variant-display-name';

// Coupon "preview" applied on a product page before Add to Cart. Persisted
// so it survives a page reload, or a trip to another product and back —
// mirrors how the real cart coupon is persisted in lib/cart-context.tsx.
const PRODUCT_COUPON_PREVIEW_KEY = 'saaj-product-coupon-preview-v1';

export default function ProductDetail({
  // Server-resolved data for this exact slug (see app/product/[slug]/page.tsx,
  // which already fetches this for SEO metadata/JSON-LD) -- seeding state
  // with it means the gallery has a real image to render on the very first
  // paint instead of waiting on a second, client-side fetch of the same
  // product. Both default to null so this component still works standalone
  // (e.g. if ever rendered without the wrapper page) -- it just falls back
  // to the original client-fetch behaviour below in that case.
  initialProduct = null,
  initialVariant = null,
  blurPreviews,
  initialVariants,
}: {
  initialProduct?: Product | null;
  initialVariant?: VariantWithSizes | null;
  /** Real per-image LQIP blur previews (image URL -> base64 data URL),
   *  fetched server-side in app/product/[slug]/page.tsx via
   *  lib/blur-preview.ts. Optional -- ProductGallery falls back to the
   *  generic shimmer for any image not present here. */
  blurPreviews?: Record<string, string>;
  /** Colour swatches fetched on the server so they're in the first HTML
   *  (no pop-in / layout shift). Optional -- falls back to a client fetch. */
  initialVariants?: ProductVariant[];
} = {}) {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const { getBySlug, products, loading } = useProducts();
  const { addItem, startBuyNow, subtotal: cartSubtotal, applyCoupon: applyCartCoupon, activePromotions } = useCart();
  const { user } = useAuth();

  const fromContext = useMemo(
    () => getBySlug(params.slug),
    [params.slug, getBySlug]
  );

  const [directProduct, setDirectProduct] = useState<Product | null>(initialProduct);
  const [directLoading, setDirectLoading] = useState(false);
  const [variant, setVariant] = useState<VariantWithSizes | null>(initialVariant);
  // Which slug `directProduct`/`variant` above actually correspond to --
  // starts pre-filled when the server already handed us this slug's data,
  // so the fetch effect below knows to skip its redundant client fetch on
  // first paint. Updated after any successful client fetch too, so
  // navigating between product pages client-side still works exactly as
  // before.
  const resolvedSlugRef = useRef<string | null>(initialProduct ? params.slug : null);
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  // Reviews now render as their own always-open section (not a tab), so
  // there's no tab-selection state to track anymore.
  const [fulfillment, setFulfillment] = useState<FulfillmentSettings>(DEFAULT_FULFILLMENT_SETTINGS);
  const [freeShippingThreshold, setFreeShippingThreshold] = useState<number | undefined>(undefined);
  const [appliedCoupon, setAppliedCoupon] = useState<Coupon | null>(null);
  const [couponDiscount, setCouponDiscount] = useState(0);
  const [couponHydrated, setCouponHydrated] = useState(false);
  // Code the shopper applied here on the product page, waiting to be synced
  // into the shared cart coupon (lib/cart-context.tsx) once Add to Cart is
  // clicked and the item — and therefore the real cart subtotal — exists.
  const [pendingCouponCode, setPendingCouponCode] = useState<string | null>(null);
  // Guards handleBuyNow (defined below) against a fast double-tap firing
  // it twice — declared up here with the other hooks since this component
  // has early returns further down while data is still loading.
  const buyNowNavigatingRef = useRef(false);

  // The URL slug might belong either to a base product or to one of its
  // colour variants (independent SEO pages). Try the product table first;
  // if nothing matches, fall back to a variant lookup.
  useEffect(() => {
    if (fromContext) {
      setVariant(null);
      return;
    }
    // Server already resolved this exact slug (see initialProduct/
    // initialVariant above) -- nothing to (re)fetch on first paint.
    if (resolvedSlugRef.current === params.slug) return;
    let cancelled = false;
    setDirectLoading(true);
    fetchProductBySlug(params.slug)
      .then((p) => {
        if (cancelled) return;
        if (p) {
          setDirectProduct(p);
          setVariant(null);
          resolvedSlugRef.current = params.slug;
          return;
        }
        return fetchVariantBySlug(params.slug).then((res) => {
          if (cancelled || !res) return;
          setDirectProduct(res.product);
          setVariant(res.variant);
          resolvedSlugRef.current = params.slug;
        });
      })
      .catch(() => setDirectProduct(null))
      .finally(() => !cancelled && setDirectLoading(false));
    return () => {
      cancelled = true;
    };
  }, [fromContext, params.slug]);

  const baseProduct = fromContext ?? directProduct;
  const isLoading = loading || directLoading;

  // Live rating/review split for this product -- a star-only submission
  // (no title/comment) counts toward `totalRatings` but NOT `totalReviews`.
  // Falls back to the admin-set seed numbers (product.rating / product.reviews)
  // until the product has at least one real approved rating, so brand-new
  // listings still show their seeded social-proof numbers.
  const [liveSummary, setLiveSummary] = useState<RatingSummary | null>(null);
  const [loyaltySettings, setLoyaltySettings] = useState<LoyaltySettings>(DEFAULT_LOYALTY_SETTINGS);
  const [loyaltyBalance, setLoyaltyBalance] = useState(0);
  useEffect(() => {
    let cancelled = false;
    fetchLoyaltySettings()
      .then((s) => {
        if (!cancelled) setLoyaltySettings(s);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    let cancelled = false;
    // Current usable balance — shown on the product page so customers can
    // see they can apply it as a discount at checkout right now, instead of
    // only being told what they'd *earn* from this purchase.
    fetchMyLoyaltyBalance()
      .then((b) => {
        if (!cancelled) setLoyaltyBalance(b);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [user]);
  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchFulfillmentSettings(), fetchShippingSettings()])
      .then(([f, s]) => {
        if (!cancelled) {
          setFulfillment(f);
          setFreeShippingThreshold(s.free_shipping_threshold || undefined);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    if (!baseProduct?.id) {
      setLiveSummary(null);
      return;
    }
    let cancelled = false;
    fetchApprovedReviews(baseProduct.id)
      .then((reviews) => {
        if (!cancelled) setLiveSummary(summarizeReviews(reviews));
      })
      .catch(() => {
        if (!cancelled) setLiveSummary(null);
      });
    return () => {
      cancelled = true;
    };
  }, [baseProduct?.id]);

  // A colour variant's own rating/reviews override (set in the admin panel)
  // takes priority over the base product's seed numbers, but real, live
  // approved reviews (shared across all colours of a product) always win
  // over either seed value once they exist.
  const seedRating = variant?.rating ?? baseProduct?.rating ?? 0;
  const seedReviews = variant?.reviews ?? baseProduct?.reviews ?? 0;
  const displayRating = liveSummary && liveSummary.totalRatings > 0 ? liveSummary.average : seedRating;
  const displayRatingsCount = liveSummary && liveSummary.totalRatings > 0 ? liveSummary.totalRatings : seedReviews;
  const displayReviewsCount = liveSummary && liveSummary.totalRatings > 0 ? liveSummary.totalReviews : seedReviews;

  // If the URL is the base product's own slug (not a colour's dedicated
  // SEO page) and that product has colour variants, silently switch to its
  // default colour on load -- same variant that shop/category cards show
  // and link to, so opening the product any way always lands on the same
  // colour. Uses replaceState (like handleSelectVariant below) so it
  // doesn't add a back-button entry or trigger a full reload.
  const defaultVariantAppliedForRef = useRef<string | null>(null);
  useEffect(() => {
    if (!baseProduct) return;
    if (variant) return;
    if (params.slug !== baseProduct.slug) return;
    if (defaultVariantAppliedForRef.current === baseProduct.id) return;
    defaultVariantAppliedForRef.current = baseProduct.id;
    let cancelled = false;
    fetchVariantsForProduct(baseProduct.id)
      .then((variants) => {
        if (cancelled || variants.length === 0) return;
        const def = variants.find((v) => v.is_default) ?? variants[0];
        return fetchVariantBySlug(def.slug).then((res) => {
          if (cancelled || !res) return;
          setVariant(res.variant);
          window.history.replaceState(window.history.state, '', `/product/${def.slug}`);
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [baseProduct, variant, params.slug]);

  // Synthetic stand-in for the base product's own colour (e.g. the
  // original "Green" a vendor listed with before ever adding a variant).
  // It never has its own row in product_variants -- only added colours do
  // -- so VariantSwatches needs this to keep showing it in the swatch list
  // once other colours exist. id '__base__' flags it in handleSelectVariant
  // below so we reset to the base product instead of trying to fetch a
  // variant row that doesn't exist.
  const baseVariant: ProductVariant | null = useMemo(() => {
    if (!baseProduct) return null;
    const color = baseProduct.colors?.[0];
    if (!color) return null;
    return {
      id: '__base__',
      product_id: baseProduct.id,
      color,
      color_hex: null,
      slug: baseProduct.slug,
      images: baseProduct.images,
      video: baseProduct.video_url ?? null,
      price_override: null,
      meta_title: null,
      meta_description: null,
      style_note: null,
      is_default: true,
      sku: baseProduct.sku ?? null,
      rating: null,
      reviews: null,
      created_at: baseProduct.created_at ?? '',
    };
  }, [baseProduct]);

  // Switching colour never navigates — it just swaps state on the page
  // that's already mounted, so nothing reloads or re-fetches the product.
  // The thumbnail/price/colour change instantly using data we already have;
  // sizes (needed for stock accuracy) fill in a moment later in the background.
  const handleSelectVariant = (v: ProductVariant) => {
    // Log which colour the shopper is switching FROM/TO, keyed to the base
    // product id so every colour of one product rolls up together in the
    // admin's "most-switched variant" report (app/api/admin/variant-switches).
    // Fire-and-forget, best-effort — trackEvent() never throws.
    if (baseProduct) {
      trackEvent('variant_switch', {
        productId: baseProduct.id,
        userId: user?.id ?? null,
        metadata: {
          fromColor: variant?.color ?? baseProduct.colors?.[0] ?? null,
          toColor: v.color,
          toVariantId: v.id,
          toSlug: v.slug,
        },
      });
    }

    // Picking the base product's own colour (synthetic, id '__base__') --
    // there's no product_variants row to fetch, so just drop back to the
    // base product itself (same state fetchVariantBySlug-based defaulting
    // uses in reverse, above).
    if (v.id === '__base__') {
      setVariant(null);
      window.history.replaceState(window.history.state, '', `/product/${v.slug}`);
      return;
    }
    // If VariantSwatches already warmed this colour's full row (sizes/stock
    // included) in the background — see the prefetch effect in
    // components/product/variant-swatches.tsx — use it straight away
    // instead of showing an empty `sizes: []` and waiting on a fresh
    // network round-trip. This is the common case: by the time a shopper
    // actually taps a swatch, idle-time prefetching has usually already
    // finished for it.
    const cached = getPrefetchedVariant(v.slug);
    if (cached) {
      setVariant(cached);
    } else {
      setVariant((prev) => ({ ...v, sizes: prev?.slug === v.slug ? prev.sizes : [] }));
    }
    // Pass the EXISTING history.state through instead of null. Next.js's App
    // Router attaches its own internal navigation data to each history
    // entry's state object; wiping it with null here desyncs the router
    // from the real browser history stack. That desync is what made the
    // hardware/edge-swipe back gesture need two tries to leave checkout on
    // a colour-variant page — the first swipe only updated the URL bar
    // (browser-level), the second was needed for Next's router to actually
    // notice and re-render. Keeping the state object intact and only
    // swapping the URL avoids that entirely.
    window.history.replaceState(window.history.state, '', `/product/${v.slug}`);
    if (cached) return;
    fetchVariantBySlug(v.slug)
      .then((res) => {
        if (res) {
          setVariant(res.variant);
          setPrefetchedVariant(v.slug, res.variant);
        }
      })
      .catch(() => {});
  };

  // Merge variant overrides (colour, images, price) onto the base product
  // so the rest of the page can just render `product` as usual.
  const product = useMemo(() => {
    if (!baseProduct) return null;
    if (!variant) return baseProduct;
    // Sizes load in shortly after the swatch swap (see handleSelectVariant),
    // so while variant.sizes is still empty we fall back to the base
    // product's own stock figures rather than flashing "out of stock".
    const hasSizeData = variant.sizes.length > 0;
    const variantStockQty = variant.sizes.reduce((sum, s) => sum + s.stock_quantity, 0);
    return {
      ...baseProduct,
      // Was falling through to `...baseProduct`'s own slug here, so a
      // customer viewing/buying a colour variant (its own /product/<slug>
      // page) ended up with the BASE product's slug baked into the cart
      // item -- and from there into the order -- instead of this exact
      // variant's. That's why an order-item link opened the default
      // colour instead of the one actually bought. Now it always matches
      // whatever slug is in the address bar.
      slug: variant.slug,
      price: variant.price_override ?? baseProduct.price,
      images: variant.images.length > 0 ? variant.images : baseProduct.images,
      video_url: variant.video || baseProduct.video_url,
      colors: [variant.color],
      sizes: hasSizeData ? variant.sizes.map((s) => s.size) : baseProduct.sizes,
      stock_quantity: hasSizeData ? variantStockQty : baseProduct.stock_quantity,
      inStock: hasSizeData ? variantStockQty > 0 : baseProduct.inStock,
    };
  }, [baseProduct, variant]);

  // Same rule the shop-grid product card uses to decide whether/which
  // "Buy X Get Y" badge applies -- see getVisibleBogoPromotion in
  // lib/cart-context.tsx. When this product is part of a live
  // scope='collection' promotion, "You may also like" below shows the
  // rest of that collection instead of generic same-category matches, so
  // a shopper on a BOGO page can actually find something to pair it with
  // and hit the offer, instead of having to go hunting for it themselves.
  const bogoPromotion = useMemo(
    () => (product ? getVisibleBogoPromotion(product.id, activePromotions) : null),
    [product, activePromotions]
  );
  const bogoCollectionProducts = useMemo(() => {
    if (!product || !bogoPromotion?.product_ids || bogoPromotion.product_ids.length === 0) return [];
    const ids = new Set(bogoPromotion.product_ids);
    return products.filter((p) => ids.has(p.id) && p.id !== product.id);
  }, [product, bogoPromotion, products]);

  // Defaults to the first size, UNLESS the URL carries a `?size=` param --
  // that's how each Google Merchant Center feed item links back here (see
  // app/api/merchant-feed/route.ts), so the page must land on that exact
  // size pre-selected. Without this, every size shares one URL that always
  // opens on size #1, and Google's landing-page price check flags every
  // other size's feed item as a "price mismatch" since the visible price
  // never matches what was advertised for it.
  useEffect(() => {
    if (!product) return;
    const sizeFromUrl =
      typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('size') : null;
    const matched = sizeFromUrl && product.sizes.includes(sizeFromUrl) ? sizeFromUrl : null;
    setSelectedSize(matched ?? product.sizes[0] ?? null);
  }, [product]);

  // The `product` object above intentionally keeps an aggregate stock
  // figure (sum across all sizes of the current colour) so switching size
  // doesn't change its identity and re-trigger the effect above. But once a
  // specific size is chosen, the number that actually matters — for the
  // "only N left" message, the Add to Cart/Buy Now guard, and (via the
  // product object handed to addItem/startBuyNow below) the checkout page's
  // own +/- stepper — is that size's own stock, not the whole colour's.
  // Using the aggregate there was letting a shopper "select" quantities
  // the specific size didn't actually have, or blocking valid ones.
  const selectedSizeStock = useMemo(() => {
    if (!variant || variant.sizes.length === 0) {
      return product?.stock_quantity ?? Infinity;
    }
    const match = variant.sizes.find((s) => s.size === selectedSize);
    return match ? match.stock_quantity : 0;
  }, [variant, selectedSize, product]);

  // Per-size price: a size row can carry its own `price_override` (e.g. XL
  // costs more fabric than S). Falls back to the current colour's price
  // (which itself already falls back to the base product price) whenever
  // the selected size has no override of its own.
  const selectedSizePrice = useMemo(() => {
    if (!product) return 0;
    if (!variant || variant.sizes.length === 0) return product.price;
    const match = variant.sizes.find((s) => s.size === selectedSize);
    return match?.price_override ?? product.price;
  }, [variant, selectedSize, product]);

  // Same idea but for every size at once, so the size-selector can show a
  // price under each pill the way a shopper expects (S ₹260, XL ₹274, ...).
  const sizePriceMap = useMemo(() => {
    const map: Record<string, number> = {};
    if (!product) return map;
    if (variant && variant.sizes.length > 0) {
      for (const s of variant.sizes) {
        map[s.size] = s.price_override ?? product.price;
      }
    } else {
      for (const s of product.sizes) map[s] = product.price;
    }
    return map;
  }, [variant, product]);

  // Restore a previously-applied coupon preview for this product (or the
  // current colour variant's price) whenever the product changes — this
  // fires on first load too, so a reload restores it, and it re-runs when
  // navigating to another product and back. We reset to "no coupon" first
  // so a moment mid-navigation never shows the PREVIOUS product's coupon
  // on the new one, then re-validate the stored code (min order value,
  // expiry, active status) against this product's actual price before
  // showing it as applied again.
  useEffect(() => {
    if (!product) return;
    let cancelled = false;
    setAppliedCoupon(null);
    setCouponDiscount(0);
    setCouponHydrated(false);

    let storedCode: string | null = null;
    try {
      storedCode = localStorage.getItem(PRODUCT_COUPON_PREVIEW_KEY);
    } catch {
      storedCode = null;
    }
    if (!storedCode) {
      setCouponHydrated(true);
      return;
    }
    validateCoupon(storedCode, selectedSizePrice)
      .then((result) => {
        if (cancelled) return;
        if (result.ok && result.coupon) {
          setAppliedCoupon(result.coupon);
          setCouponDiscount(result.discount || 0);
        }
        // If it's no longer valid for this product (e.g. below min order
        // value), we simply leave it un-applied; the persist effect below
        // clears the stale code from storage once couponHydrated flips.
      })
      .finally(() => {
        if (!cancelled) setCouponHydrated(true);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product?.id, selectedSizePrice]);

  // Keep localStorage in sync with the current preview coupon so it can be
  // restored later. Gated on couponHydrated so this never fires with the
  // initial `null` before the restore effect above has had a chance to run
  // — otherwise it would wipe a just-read stored code before it's used.
  useEffect(() => {
    if (!couponHydrated) return;
    try {
      if (appliedCoupon) {
        localStorage.setItem(PRODUCT_COUPON_PREVIEW_KEY, appliedCoupon.code);
      } else {
        localStorage.removeItem(PRODUCT_COUPON_PREVIEW_KEY);
      }
    } catch {
      // ignore
    }
  }, [appliedCoupon, couponHydrated]);

  useEffect(() => {
    if (baseProduct) addRecentlyViewed(baseProduct.id);
  }, [baseProduct]);

  useEffect(() => {
    if (baseProduct) {
      // metadata.color is which colour variation was actually being looked
      // at, so Admin > Analytics > Product Performance can show a
      // per-colour impressions breakdown, not just a per-product total.
      trackEvent('product_view', {
        productId: baseProduct.id,
        userId: user?.id ?? null,
        metadata: { color: variant?.color ?? baseProduct.colors?.[0] ?? null },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseProduct?.id, variant?.color]);

  // Fire GA4 / Google Ads view_item event once per product load. Uses
  // `product` (not `baseProduct`) so the price reflects the currently
  // selected colour variant, matching what the shopper actually sees.
  // Keyed on baseProduct.id (not variant/size) so switching size doesn't
  // re-fire this — a size change isn't a new "product view".
  useEffect(() => {
    if (!product) return;
    fireGtagEvent('view_item', {
      currency: 'INR',
      value: selectedSizePrice || product.price,
      items: [
        {
          // Matches the Merchant Center feed's <g:id> for this exact
          // colour/size (see feedMatchedItemId) — this is what lets
          // Google Ads' "Product viewers" Retail audience and Performance
          // Max dynamic remarketing show the *exact* item back to this
          // shopper instead of a generic product ad.
          item_id: feedMatchedItemId(product.id, variant, selectedSize),
          item_group_id: product.id,
          item_name: product.name,
          item_category: product.category,
          price: selectedSizePrice || product.price,
          quantity: 1,
        },
      ],
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseProduct?.id, variant?.id, selectedSize]);

  // Once an item has been added to the cart with a coupon previewed on this
  // page, sync that coupon into the shared cart (lib/cart-context.tsx) so it
  // actually applies and shows up in the cart drawer, cart page & checkout.
  // Waiting on cartSubtotal ensures we validate against the subtotal that
  // already includes the item just added.
  useEffect(() => {
    if (!pendingCouponCode) return;
    applyCartCoupon(pendingCouponCode).then((result) => {
      if (!result.ok) {
        toast.error(result.error || 'Could not apply this coupon to your order');
      }
      setPendingCouponCode(null);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingCouponCode, cartSubtotal]);

  if (isLoading && !product) {
    return (
      <div className="container-boutique py-8">
        <div className="grid gap-8 lg:grid-cols-2 lg:gap-12">
          <Skeleton className="aspect-[4/5] rounded-xl" />
          <div className="flex flex-col gap-4">
            <Skeleton className="h-6 w-24" />
            <Skeleton className="h-10 w-3/4" />
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        </div>
      </div>
    );
  }

  if (!product || !baseProduct) {
    return (
      <div className="container-boutique flex flex-col items-center gap-4 py-24 text-center">
        <h1 className="font-serif text-2xl font-bold text-primary">Product not found</h1>
        <p className="text-sm text-muted-foreground">
          The product you are looking for does not exist or has been removed.
        </p>
        <Button asChild className="bg-primary">
          <Link href="/shop">Back to Shop</Link>
        </Button>
      </div>
    );
  }

  const discount = discountPct(product.price, product.mrp);

  // Colour-correct name for whatever's actually being viewed: the base
  // product's own name usually has its original colour baked in (e.g.
  // "Maroon Handloom Rayon Kurti with Palazzo"), so on a different colour
  // variant's page that name needs swapping to match -- otherwise the H1,
  // share text, etc. contradict the URL/swatch/selected colour. See
  // lib/variant-display-name.ts.
  const displayName = variant
    ? getVariantDisplayName(product.name, product.colors?.[0], variant.color)
    : product.name;

  // SEO-friendly alt text, generated automatically from the product's own
  // details — never from the uploaded file's original name (which may just
  // be a generic export like "WhatsApp Image 2026-07-21 at 20.49.28.jpg").
  // This is what Google Images actually reads to understand and rank the
  // photo, so it always reflects the product, not the source file.
  const seoAltText = [displayName, product.fabric, product.category, product.origin ? `from ${product.origin}` : '']
    .filter(Boolean)
    .join(' - ');

  const goToReviews = () => {
    document.getElementById('product-reviews')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleAddToCart = () => {
    if (!selectedSize) {
      toast.error('Please select a size');
      return;
    }
    if (selectedSizeStock <= 0) {
      toast.error('Out of stock');
      return;
    }
    const cartProduct = { ...product, price: selectedSizePrice, stock_quantity: selectedSizeStock, inStock: selectedSizeStock > 0 };
    // Same feed-matched id used in the add_to_cart gtag event below —
    // stored on the cart line itself so view_cart / begin_checkout (fired
    // later from the cart drawer, cart page, and checkout page) can send
    // this exact variant+size id too, instead of falling back to the base
    // product.id there.
    const feedItemId = feedMatchedItemId(product.id, variant, selectedSize);
    addItem(cartProduct, selectedSize, quantity, { feedItemId });
    if (appliedCoupon) {
      // Carry the coupon previewed on this page into the real cart so it
      // shows up (and actually applies) in the cart drawer, cart page and
      // checkout too — see effect above, which fires once the cart
      // subtotal reflects this item.
      setPendingCouponCode(appliedCoupon.code);
    }
    trackEvent('add_to_cart', {
      productId: product.id,
      userId: user?.id ?? null,
      metadata: { size: selectedSize, quantity, color: product.colors?.[0] ?? null },
    });
    // Fire GA4 / Google Ads add_to_cart event (retries if gtag.js hasn't
    // finished loading yet — see lib/gtag-track.ts)
    fireGtagEvent('add_to_cart', {
      currency: 'INR',
      value: selectedSizePrice * quantity,
      items: [{
        // Same feed-matched id as view_item above — an add-to-cart signal
        // for the wrong item_id is arguably worse than none, since it's
        // the strongest "show this exact product again" signal Google has.
        item_id: feedItemId,
        item_group_id: product.id,
        item_name: product.name,
        item_category: product.category ?? '',
        price: selectedSizePrice,
        quantity,
      }],
    });
  };

  const handleBuyNow = () => {
    if (!selectedSize) {
      toast.error('Please select a size');
      return;
    }
    if (selectedSizeStock <= 0) {
      toast.error('Out of stock');
      return;
    }
    // Guard against a fast double-tap firing this twice — that would push
    // /checkout onto history twice, and the back button would then need
    // an extra click to actually leave the checkout page.
    if (buyNowNavigatingRef.current) return;
    buyNowNavigatingRef.current = true;
    const cartProduct = { ...product, price: selectedSizePrice, stock_quantity: selectedSizeStock, inStock: selectedSizeStock > 0 };
    const feedItemId = feedMatchedItemId(product.id, variant, selectedSize);
    startBuyNow(cartProduct, selectedSize, quantity, feedItemId);
    if (appliedCoupon) {
      applyCartCoupon(appliedCoupon.code, selectedSizePrice * quantity, 1).then((result) => {
        if (!result.ok) {
          toast.error(result.error || 'Could not apply this coupon to your order');
        }
      });
    }
    trackEvent('add_to_cart', {
      productId: product.id,
      userId: user?.id ?? null,
      metadata: { size: selectedSize, quantity, color: product.colors?.[0] ?? null, via: 'buy_now' },
    });
    // Fire GA4 / Google Ads add_to_cart event (Buy Now path, retries if
    // gtag.js hasn't finished loading yet — see lib/gtag-track.ts)
    fireGtagEvent('add_to_cart', {
      currency: 'INR',
      value: selectedSizePrice * quantity,
      items: [{
        item_id: feedItemId,
        item_group_id: product.id,
        item_name: product.name,
        item_category: product.category ?? '',
        price: selectedSizePrice,
        quantity,
      }],
    });
    markCheckoutEntry({ fromBuyNow: true });
    router.push('/checkout');
  };

  return (
    <div className="container-boutique pt-0 pb-24 sm:pt-4 md:pb-8">
      <div className="grid gap-4 lg:grid-cols-2 lg:gap-8 lg:items-start">
        <div className="min-w-0 flex flex-col gap-3 lg:sticky lg:top-24 lg:self-start">
          <div className="-mx-4 sm:mx-0">
            <ProductGallery
              images={toPublicMediaUrls(product.images)}
              blurPreviews={blurPreviews}
              alt={seoAltText}
              discount={discount}
              videoUrl={toPublicMediaUrl(product.video_url)}
              productId={variant?.video ? variant.id : product.id}
              baseProductId={baseProduct?.id}
              productSlug={product.slug}
              productName={product.name}
              productPrice={product.price}
              productMrp={product.mrp}
            />
          </div>
          <div className="min-w-0 px-4 sm:px-0">
            <VariantSwatches
              productId={baseProduct.id}
              initialVariants={initialVariants}
              activeSlug={variant?.slug ?? baseProduct.slug}
              onSelect={handleSelectVariant}
              baseVariant={baseVariant}
            />
          </div>
        </div>
        <ProductInfo
          product={product}
          displayName={displayName}
          displayRating={displayRating}
          displayRatingsCount={displayRatingsCount}
          displayReviewsCount={displayReviewsCount}
          selectedSize={selectedSize}
          setSelectedSize={setSelectedSize}
          selectedSizeStock={selectedSizeStock}
          selectedSizePrice={selectedSizePrice}
          sizePriceMap={sizePriceMap}
          quantity={quantity}
          setQuantity={setQuantity}
          onAdd={handleAddToCart}
          onBuyNow={handleBuyNow}
          onReviewsClick={goToReviews}
          variant={variant}
          appliedCoupon={appliedCoupon}
          couponDiscount={couponDiscount}
          fulfillment={fulfillment}
          freeShippingThreshold={freeShippingThreshold}
          isLoggedIn={!!user}
          loyaltyBalance={loyaltyBalance}
          loyaltySettings={loyaltySettings}
          onCouponApply={(c, d) => {
            setAppliedCoupon(c);
            setCouponDiscount(d);
          }}
          onCouponRemove={() => {
            setAppliedCoupon(null);
            setCouponDiscount(0);
          }}
        />
      </div>

      <div className="mt-8">
        <RelatedProducts
          current={product}
          allProducts={products}
          overrideProducts={bogoCollectionProducts}
          viewAllHref={bogoPromotion?.collection_slug ? `/collection/${bogoPromotion.collection_slug}` : undefined}
          title={bogoCollectionProducts.length > 0 ? `Complete your ${formatBogoLabel(bogoPromotion!)} offer` : undefined}
        />

        {/* When the BOGO carousel above is showing (overrideProducts in use),
            RelatedProducts swaps out the scored same-category matches for the
            BOGO collection, so the generic "You may also like" picks never
            render on those pages. Rendering a second, plain RelatedProducts
            here (no overrideProducts) restores it -- BOGO offer first, then
            "You may also like" -- both ahead of Reviews below. */}
        {bogoCollectionProducts.length > 0 && (
          <RelatedProducts current={product} allProducts={products} />
        )}
      </div>

      {/* Same Refer & Earn / trust-signal carousel shown on the home page,
          repeated here right after "You may also like" so the loyalty/
          referral nudge reaches shoppers deep on a product page too. */}
      <div className="mt-8">
        <PromoSlider />
      </div>

      <div id="product-reviews" className="mt-8 scroll-mt-24">
        <h2 className="mb-3 text-sm font-semibold text-foreground">
          Reviews ({displayRatingsCount})
        </h2>
        <ReviewsSection productId={baseProduct.id} productSlug={baseProduct.slug} selectedColor={product?.colors?.[0] ?? null} />
      </div>

      <div className="mt-6">
        <Accordion type="single" collapsible>
          <AccordionItem value="core-features">
            <AccordionTrigger className="text-sm font-semibold">Core Features</AccordionTrigger>
            <AccordionContent className="max-w-3xl text-sm leading-relaxed text-foreground/80">
              <p>{product.description}</p>
              {/* Colour-specific paragraph (see lib/variant-seo-content.ts) —
                 without this, every colour of a product rendered the exact
                 same description text, which is duplicate on-page content
                 even when the <title>/meta tags differ. Keeping this visible
                 (not just in metadata) is what actually makes each colour's
                 page read as distinct to Google. */}
              {variant?.style_note && <p className="mt-3">{variant.style_note}</p>}
              <p className="mt-3">
                Each piece is handcrafted by skilled artisans, carrying forward
                centuries of weaving tradition. Subtle variations in motif and
                colour are a hallmark of genuine handloom and make every piece
                uniquely yours.
              </p>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="details">
            <AccordionTrigger className="text-sm font-semibold">Details</AccordionTrigger>
            <AccordionContent className="max-w-3xl text-sm">
              <ul className="grid gap-2 sm:grid-cols-2">
                <li><strong className="text-foreground">Fabric:</strong> {product.fabric}</li>
                <li><strong className="text-foreground">Origin:</strong> {product.origin}</li>
                <li><strong className="text-foreground">Category:</strong> {product.category}</li>
                <li><strong className="text-foreground">Colors:</strong> {product.colors.join(', ')}</li>
                <li><strong className="text-foreground">Sizes:</strong> {product.sizes.join(', ')}</li>
                <li><strong className="text-foreground">In stock:</strong> {selectedSizeStock} units</li>
                {(variant?.sku || product.sku) && (
                  <li><strong className="text-foreground">SKU:</strong> {variant?.sku || product.sku}</li>
                )}
              </ul>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="delivery-returns">
            <AccordionTrigger className="text-sm font-semibold">Delivery & Returns</AccordionTrigger>
            <AccordionContent className="max-w-3xl text-sm leading-relaxed text-foreground/80">
              <p>{shippingReturnsSummary(fulfillment, freeShippingThreshold)}</p>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="care-guide" className="border-b-0">
            <AccordionTrigger className="text-sm font-semibold">Care Guide</AccordionTrigger>
            <AccordionContent className="max-w-3xl text-sm leading-relaxed text-foreground/80">
              <p>Dry clean only. Store folded in a breathable cloth bag, away from direct sunlight, to keep the weave and colour looking their best.</p>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>

      <FrequentlyBoughtTogether productId={baseProduct.id} />

      <VendorCollection productId={baseProduct.id} />

      <RecentlyViewedSection excludeId={product.id} />

      <MobileStickyCartBar
        name={displayName}
        price={selectedSizePrice}
        mrp={product.mrp}
        inStock={selectedSizeStock > 0}
        onAdd={handleAddToCart}
        onBuyNow={handleBuyNow}
        couponCode={appliedCoupon?.code ?? null}
        couponDiscount={couponDiscount}
      />
    </div>
  );
}


function ProductInfo({
  product,
  displayName,
  displayRating,
  displayRatingsCount,
  displayReviewsCount,
  selectedSize,
  setSelectedSize,
  selectedSizeStock,
  selectedSizePrice,
  sizePriceMap,
  quantity,
  setQuantity,
  onAdd,
  onBuyNow,
  onReviewsClick,
  variant,
  appliedCoupon,
  couponDiscount,
  onCouponApply,
  onCouponRemove,
  fulfillment,
  freeShippingThreshold,
  isLoggedIn,
  loyaltySettings,
  loyaltyBalance,
}: {
  product: Product;
  displayName: string;
  displayRating: number;
  displayRatingsCount: number;
  displayReviewsCount: number;
  selectedSize: string | null;
  setSelectedSize: (s: string) => void;
  selectedSizeStock: number;
  selectedSizePrice: number;
  sizePriceMap: Record<string, number>;
  quantity: number;
  setQuantity: (n: number | ((q: number) => number)) => void;
  onAdd: () => void;
  onBuyNow: () => void;
  onReviewsClick: () => void;
  variant: VariantWithSizes | null;
  appliedCoupon: Coupon | null;
  couponDiscount: number;
  onCouponApply: (coupon: Coupon, discount: number) => void;
  onCouponRemove: () => void;
  fulfillment: FulfillmentSettings;
  freeShippingThreshold: number | undefined;
  isLoggedIn: boolean;
  loyaltySettings: LoyaltySettings;
  loyaltyBalance: number;
}) {
  const discount = discountPct(selectedSizePrice, product.mrp);
  const { paymentDiscount } = usePaymentDiscount();
  const { activePromotions } = useCart();
  // Same rule the shop-grid product card and the cart use to decide
  // whether/which "Buy X Get Y" badge applies -- see
  // getVisibleBogoPromotion in lib/cart-context.tsx.
  const bogoPromotion = getVisibleBogoPromotion(product.id, activePromotions);
  const priceAfterCoupon = appliedCoupon ? Math.max(0, selectedSizePrice - couponDiscount) : selectedSizePrice;
  const onlinePaymentSavings =
    paymentDiscount.enabled && paymentDiscount.percent > 0
      ? Math.round((priceAfterCoupon * paymentDiscount.percent) / 100)
      : 0;
  // Points the customer already holds and can redeem right now at checkout
  // (subject to the same minimum-redeem rule enforced there).
  const canRedeemNow = loyaltyBalance >= loyaltySettings.min_redeem_points;
  const loyaltyBalanceWorth = Math.round(loyaltyBalance * loyaltySettings.redeem_value_per_point);

  return (
    // min-w-0: this is a CSS grid column (see the `lg:grid-cols-2` parent in
    // ProductDetail above). Without it, a non-wrapping horizontally-scrollable
    // child -- like PriceQuickBrowseBar's chip row -- pushes this column's
    // intrinsic min-width past the viewport on mobile instead of scrolling
    // inside it, which silently clips the page's right-side gutter (globals.css
    // sets overflow-x-clip on body). Matches the sibling gallery column, which
    // already carries min-w-0 for the same reason.
    <div className="min-w-0 flex flex-col gap-3">
      <div>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-start gap-4">
              <p className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-secondary">
                <Link href={`/shop?category=${encodeURIComponent(product.category)}`} className="hover:underline">
                  {product.category}
                </Link>
              </p>
              {/* Matches the "Free Shipping" trust badge shown lower on
                  this same page (unconditional, price-independent) --
                  keeping this one unconditional too avoids the page
                  contradicting itself for lower-priced products. */}
              <span className="flex shrink-0 items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-600">
                <Truck className="h-3.5 w-3.5" />
                Free Delivery
              </span>
            </div>
            <h1 className="mt-1 font-serif text-base font-bold text-primary sm:text-xl">
              {displayName}
            </h1>
          </div>
          <div className="flex shrink-0 items-start gap-4 pt-1">
            <WishlistButton productId={product.id} showLabel />
            <ShareButton title={displayName} text={`Check out ${displayName} on Sutisaree`} />
          </div>
        </div>
        {displayRatingsCount > 0 && (
          <button
            type="button"
            onClick={onReviewsClick}
            className="mt-2 flex items-center gap-2 text-sm hover:underline"
          >
            <div className="flex items-center gap-0.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star
                  key={i}
                  className={`h-4 w-4 ${
                    i < Math.round(displayRating)
                      ? 'fill-secondary text-secondary'
                      : 'text-muted-foreground/40'
                  }`}
                />
              ))}
            </div>
            <span className="font-medium">{displayRating.toFixed(1)}</span>
            <span className="text-muted-foreground">&middot;</span>
            <span className="text-muted-foreground">
              {displayRatingsCount} rating{displayRatingsCount === 1 ? '' : 's'}
              {displayReviewsCount > 0 ? ` \u00b7 ${displayReviewsCount} review${displayReviewsCount === 1 ? '' : 's'}` : ''}
            </span>
          </button>
        )}
      </div>

      <div className="flex items-baseline gap-3">
        <span className="font-serif text-3xl font-bold text-primary">
          {formatINR(selectedSizePrice)}
        </span>
        {product.mrp && product.mrp > selectedSizePrice && (
          <>
            <span className="text-base text-muted-foreground line-through">
              {formatINR(product.mrp)}
            </span>
            <Badge className="bg-secondary/20 text-secondary-foreground">
              Save {formatINR(product.mrp - selectedSizePrice)}
            </Badge>
          </>
        )}
      </div>
      {bogoPromotion && (
        <BogoOfferSheet promotion={bogoPromotion} collectionName={product.collection?.name} />
      )}

      {onlinePaymentSavings > 0 && (
        <Dialog>
          <DialogTrigger asChild>
            <button
              type="button"
              className="group relative flex w-fit items-center gap-2 overflow-hidden rounded-full border border-emerald-600/25 bg-gradient-to-r from-emerald-50 via-secondary/10 to-transparent py-1.5 pl-1.5 pr-3.5 text-left transition-colors hover:border-emerald-600/40 dark:from-emerald-950/40"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-600 shadow-sm shadow-emerald-600/30">
                <Zap className="h-3.5 w-3.5 fill-white text-white" />
              </span>
              <span className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-emerald-800/70 dark:text-emerald-300/70">
                  Get this at
                </span>
                <span className="font-serif text-lg font-bold leading-none text-emerald-700 dark:text-emerald-400">
                  {formatINR(Math.max(0, priceAfterCoupon - onlinePaymentSavings))}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  via {paymentDiscount.label}
                </span>
              </span>
              <HelpCircle className="h-3.5 w-3.5 shrink-0 text-emerald-700/50 transition-colors group-hover:text-emerald-700 dark:text-emerald-400/50" />
            </button>
          </DialogTrigger>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 font-serif text-lg text-primary">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-600">
                  <Zap className="h-4 w-4 fill-white text-white" />
                </span>
                How to get this price
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm leading-relaxed text-foreground/80">
              Pay online (UPI / card / netbanking) at checkout instead of Cash on Delivery, and{' '}
              <strong className="text-foreground">{paymentDiscount.percent}% off</strong> is applied
              automatically — no coupon code needed.
            </p>
            <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/40 px-3.5 py-2.5">
              <span className="text-xs text-muted-foreground">Price you pay</span>
              <span className="font-serif text-base font-bold text-emerald-700">
                {formatINR(Math.max(0, priceAfterCoupon - onlinePaymentSavings))}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Choose &quot;{paymentDiscount.label}&quot; at checkout to unlock this price. Cash on
              Delivery orders are charged the regular price.
            </p>
          </DialogContent>
        </Dialog>
      )}

      {isLoggedIn && loyaltySettings.enabled && loyaltyBalance > 0 && (
        <div className="flex w-fit flex-col gap-1 rounded-xl border border-secondary/30 bg-secondary/5 px-3.5 py-2.5">
          <div className="flex items-center gap-1.5">
            <Gift className="h-3.5 w-3.5 shrink-0 text-secondary" />
            <span className="text-[11px] font-medium uppercase tracking-wide text-secondary-foreground/80">
              Loyalty Points
            </span>
          </div>
          {canRedeemNow ? (
            <p className="text-[11px] leading-snug text-muted-foreground">
              You have <strong className="text-foreground">{loyaltyBalance} points</strong> (worth{' '}
              {formatINR(loyaltyBalanceWorth)}) ready to use — apply them at checkout for an instant
              discount.
            </p>
          ) : (
            <p className="text-[11px] leading-snug text-muted-foreground">
              You have <strong className="text-foreground">{loyaltyBalance} points</strong>. Reach{' '}
              {loyaltySettings.min_redeem_points} points to redeem them for a discount at checkout.
            </p>
          )}
        </div>
      )}

      {product.sizes.length > 1 && (
        <div>
          <p className="mb-2 text-sm font-semibold">Select Size</p>
          <div className="flex flex-wrap gap-1.5">
            {product.sizes.map((s) => {
              const sizePrice = sizePriceMap[s] ?? product.price;
              return (
                <button
                  key={s}
                  onClick={() => setSelectedSize(s)}
                  className={`flex min-w-[3rem] flex-col items-center gap-px rounded-lg border px-2.5 py-1 leading-tight transition-colors ${
                    selectedSize === s
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-background hover:border-primary/50'
                  }`}
                >
                  <span className="text-xs font-semibold">{s}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {formatINR(sizePrice)}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="mt-3">
            <SizeChart sizes={product.sizes} />
          </div>
        </div>
      )}

      {appliedCoupon && (
        <p className="-mt-3 font-serif text-xl font-bold text-green-600">
          {formatINR(Math.max(0, selectedSizePrice - couponDiscount))}{' '}
          <span className="text-xs font-normal">
            after coupon &quot;{appliedCoupon.code}&quot;
          </span>
        </p>
      )}

      <CouponList
        productPrice={selectedSizePrice}
        appliedCode={appliedCoupon?.code ?? null}
        onApply={onCouponApply}
        onRemove={onCouponRemove}
      />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <LowStockBadge stockQuantity={selectedSizeStock} />
        <LiveViewersBadge productId={product.id} />
      </div>

      <div className="flex flex-col gap-3">
        {quantity >= selectedSizeStock && selectedSizeStock > 0 && (
          <p className="text-xs text-muted-foreground">
            Only {selectedSizeStock} unit{selectedSizeStock > 1 ? 's' : ''} left in stock.
          </p>
        )}
        {selectedSizeStock > 0 ? (
          <>
            <div className="flex items-center gap-3">
              <div className="flex shrink-0 items-center rounded-lg border border-border">
                <button
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  disabled={quantity <= 1}
                  className="p-2.5 text-muted-foreground hover:text-primary disabled:opacity-40"
                  aria-label="Decrease quantity"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <span className="w-8 text-center text-sm font-semibold">{quantity}</span>
                <button
                  onClick={() => setQuantity((q) => Math.min(selectedSizeStock, q + 1))}
                  disabled={quantity >= selectedSizeStock}
                  className="p-2.5 text-muted-foreground hover:text-primary disabled:opacity-40"
                  aria-label="Increase quantity"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
              <Button
                onClick={onAdd}
                size="lg"
                variant="outline"
                className="flex-1 gap-2 border-primary text-base text-primary"
              >
                <ShoppingBag className="h-4 w-4" />
                Add to Bag
              </Button>
            </div>
            <Button
              onClick={onBuyNow}
              size="lg"
              className="btn-shine w-full gap-2 bg-primary text-base text-primary-foreground"
            >
              Buy Now
            </Button>
          </>
        ) : (
          <Button disabled size="lg" variant="outline" className="w-full gap-2 text-base">
            Out of Stock
          </Button>
        )}
      </div>

      {/* Right under the disabled Out of Stock button, above Shop by price. */}
      {!product.inStock && (
        <NotifyMeForm
          productId={product.id}
          variant={{ color: product.colors?.[0] ?? null, slug: product.slug, image: product.images?.[0] ?? null }}
        />
      )}

      {/* On mobile this duplicates what MobileStickyCartBar (fixed at the
          bottom of the screen) already offers -- kept deliberately, since
          the sticky bar alone was easy for shoppers to miss/scroll past
          without noticing while reading the description/highlights below,
          which meant fewer actually tapped Add to Bag / Buy Now. Having
          the buttons right here too, right below the coupon/stock info the
          shopper is already looking at, gives a second clear path to
          purchase instead of relying on the fixed bar being noticed. */}

      <PriceQuickBrowseBar category={product.category} />

      <ProductHighlights product={product} />

      <DeliveryInfo />

      <div className="rounded-lg border border-border/60 bg-card p-4">
        <div className="grid grid-cols-3 gap-3 text-center">
          {[
            {
              icon: Truck,
              label: 'Free Shipping',
              title: 'Pan-India delivery, tracked from dispatch to your door.',
            },
            {
              icon: ShieldCheck,
              label: 'Authentic',
              title: 'Sourced directly from handloom weavers across India — no third-party resellers.',
            },
            {
              icon: RefreshCw,
              label: `${returnWindowBadgeText(fulfillment)} Returns`,
              title: `${returnWindowBadgeText(fulfillment)} easy returns on unworn items with original packaging.`,
            },
          ].map((a) => (
            <div key={a.label} title={a.title} className="flex flex-col items-center gap-1">
              <a.icon className="h-5 w-5 text-secondary" />
              <span className="text-[11px] font-medium leading-tight">{a.label}</span>
            </div>
          ))}
        </div>

        <div className="mt-3 flex items-center justify-between gap-2 border-t border-border/60 pt-3">
          <Dialog>
            <DialogTrigger asChild>
              <button
                type="button"
                className="group flex items-center gap-0.5 text-xs font-semibold text-primary"
              >
                Return Policy
                <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle className="font-serif text-lg text-primary">Return Policy</DialogTitle>
              </DialogHeader>
              <p className="text-sm leading-relaxed text-foreground/80">
                {shippingReturnsSummary(fulfillment, freeShippingThreshold)}
              </p>
              <Link
                href="/legal/refund-policy"
                className="text-xs font-medium text-primary underline-offset-2 hover:underline"
              >
                Read the full policy →
              </Link>
            </DialogContent>
          </Dialog>
          <span className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/40 px-2.5 py-1 text-[10px] font-medium text-muted-foreground">
            <Lock className="h-3 w-3" />
            Razorpay Secured
          </span>
        </div>
      </div>
    </div>
  );
}
