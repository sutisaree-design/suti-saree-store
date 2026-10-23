'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { toPublicMediaUrl } from '@/lib/media-url';
import {
  Minus,
  Plus,
  Trash2,
  ShoppingBag,
  Tag,
  ArrowLeft,
  X,
  Loader2,
  ChevronDown,
  ChevronRight,
  Info,
  Wallet,
  PartyPopper,
  Gift,
} from 'lucide-react';
import {
  useCart,
  usePaymentDiscount,
  getBogoCartProgress,
  getVisibleBogoPromotion,
  formatBogoLabel,
} from '@/lib/cart-context';
import { useAuth } from '@/lib/auth-context';
import { markCheckoutEntry } from '@/lib/checkout-return';
import { fireGtagEvent } from '@/lib/gtag-track';
import { formatINR, discountPct } from '@/lib/format';
import { fetchProductPageCoupons, computeItemCouponDiscount, Coupon } from '@/lib/coupons-api';
import { validateGiftCard, GiftCard } from '@/lib/giftcards-api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';
import CartBump from '@/components/cart/cart-bump';
import LowStockBadge from '@/components/growth/low-stock-badge';

export default function CartDrawer() {
  const {
    items,
    isCartOpen,
    setCartOpen,
    updateQuantity,
    removeItem,
    subtotal,
    count,
    appliedCoupon,
    couponDiscount,
    recoveryOffer,
    recoveryDiscount,
    applyCoupon,
    removeCoupon,
    bogoDiscount,
    activePromotions,
    clearBuyNow,
  } = useCart();
  const { user } = useAuth();
  const { paymentDiscount } = usePaymentDiscount();

  // "Add N more to get M FREE!" progress hint -- the promotion(s) the
  // current cart is closest to (re-)triggering. Same group-of-(buy+get)
  // math the cart actually applies (computeBogoDiscount), so this can
  // never promise something checkout doesn't deliver.
  const bogoProgress = useMemo(
    () => getBogoCartProgress(items, activePromotions),
    [items, activePromotions]
  );
  const nextBogoHint = useMemo(
    () =>
      bogoProgress.length === 0
        ? null
        : [...bogoProgress].sort((a, b) => a.unitsToNextFree - b.unitsToNextFree)[0],
    [bogoProgress]
  );
  const totalFreeUnitsUnlocked = bogoProgress.reduce((sum, p) => sum + p.freeUnitsUnlocked, 0);

  const onlinePaymentSavings =
    paymentDiscount.enabled && paymentDiscount.percent > 0
      ? Math.round(
          (Math.max(0, subtotal - couponDiscount - bogoDiscount) * paymentDiscount.percent) / 100
        )
      : 0;

  const [couponInput, setCouponInput] = useState('');
  const [applyingCoupon, setApplyingCoupon] = useState(false);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [couponPanelOpen, setCouponPanelOpen] = useState(false);
  const [priceDetailsOpen, setPriceDetailsOpen] = useState(false);

  // Gift card — same collapsed-pill pattern as Coupons above. Applying here
  // is a preview (checkout re-validates and does the actual redemption
  // against the order), same relationship the checkout page's own gift
  // card box has to the /api/giftcards/redeem call.
  const [giftCardInput, setGiftCardInput] = useState('');
  const [applyingGiftCard, setApplyingGiftCard] = useState(false);
  const [giftCardError, setGiftCardError] = useState<string | null>(null);
  const [giftCardPanelOpen, setGiftCardPanelOpen] = useState(false);
  const [appliedGiftCard, setAppliedGiftCard] = useState<GiftCard | null>(null);
  const [giftCardDiscount, setGiftCardDiscount] = useState(0);
  const clampedGiftCardDiscount = Math.min(
    giftCardDiscount,
    Math.max(0, subtotal - couponDiscount - bogoDiscount)
  );
  const finalTotal = Math.max(0, subtotal - couponDiscount - bogoDiscount - clampedGiftCardDiscount);

  // Coupons the admin has flagged "Show on Product Page" (Admin > Coupons)
  // — surfaced here too, in the cart drawer, so a shopper who never
  // visited a product page still sees offers they qualify for. Only
  // fetched/shown while nothing is applied yet; once a coupon is active
  // there's nothing to pick from.
  const [availableCoupons, setAvailableCoupons] = useState<Coupon[]>([]);
  const [applyingFromList, setApplyingFromList] = useState<string | null>(null);

  useEffect(() => {
    if (appliedCoupon) return;
    let cancelled = false;
    fetchProductPageCoupons()
      .then((c) => {
        if (!cancelled) setAvailableCoupons(c);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [appliedCoupon]);

  // Whenever a coupon becomes active, pop the Price Details accordion open
  // automatically so the live after-coupon total is visible immediately —
  // no extra tap needed to confirm what just got applied.
  useEffect(() => {
    if (appliedCoupon) setPriceDetailsOpen(true);
  }, [appliedCoupon]);

  // Fire GA4 / Google Ads view_cart once each time the side cart opens —
  // not on every re-render while it stays open (e.g. quantity changes).
  // Unlike begin_checkout on the checkout page, there's no localStorage
  // hydration race to guard against here: isCartOpen only ever flips to
  // true from a user action (tapping the cart icon, or "Add to Bag" — see
  // product-detail.tsx), by which point cart-context's client-side state
  // (and therefore `items`) is already populated.
  useEffect(() => {
    if (!isCartOpen) return;
    fireGtagEvent('view_cart', {
      currency: 'INR',
      value: subtotal,
      items: items.map((item) => ({
        // feedItemId (set when the line was added — see product-detail.tsx)
        // matches the Merchant Center feed's <g:id> for this exact
        // colour/size; falls back to the base product id for lines added
        // before this field existed, or products with no colour variants.
        item_id: item.feedItemId ?? item.product.id,
        item_group_id: item.product.id,
        item_name: item.product.name,
        price: item.product.price,
        quantity: item.quantity ?? 1,
      })),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCartOpen]);

  // Swipe-to-close for the side cart on mobile — drag the panel toward the
  // right edge (the side it slides in from) to dismiss it, same gesture
  // shoppers already expect from apps like this. Kept as plain touch
  // handlers + direct style writes on the panel DOM node (not React state
  // per move) so dragging feels immediate with no re-render lag. Only
  // engages once a touch clearly moves more horizontally than vertically,
  // so scrolling the item list up/down is never hijacked.
  const panelRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    lastX: number;
    lastT: number;
    velocity: number;
    mode: 'undecided' | 'horizontal' | 'vertical';
  } | null>(null);

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    dragRef.current = {
      startX: t.clientX,
      startY: t.clientY,
      lastX: t.clientX,
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
      drag.mode = Math.abs(dx) > Math.abs(dy) && dx > 0 ? 'horizontal' : 'vertical';
    }
    if (drag.mode !== 'horizontal') return;

    e.preventDefault();
    const now = Date.now();
    const dt = now - drag.lastT;
    if (dt > 0) drag.velocity = (t.clientX - drag.lastX) / dt;
    drag.lastX = t.clientX;
    drag.lastT = now;

    const translate = Math.max(0, dx);
    if (panelRef.current) {
      panelRef.current.style.transition = 'none';
      panelRef.current.style.transform = `translateX(${translate}px)`;
    }
  };

  const onTouchEnd = () => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag || drag.mode !== 'horizontal' || !panelRef.current) return;

    const dx = Math.max(0, drag.lastX - drag.startX);
    const panelWidth = panelRef.current.offsetWidth || 1;
    const shouldClose = dx > panelWidth * 0.3 || drag.velocity > 0.5;

    if (shouldClose) {
      // Hand off to Radix's own close animation instead of fighting it
      // with our inline transform.
      panelRef.current.style.transition = '';
      panelRef.current.style.transform = '';
      setCartOpen(false);
    } else {
      panelRef.current.style.transition = 'transform 200ms ease';
      panelRef.current.style.transform = 'translateX(0px)';
    }
  };

  const handleApplyCoupon = async () => {
    if (!couponInput.trim()) return;
    setCouponError(null);
    setApplyingCoupon(true);
    const result = await applyCoupon(couponInput);
    setApplyingCoupon(false);
    if (!result.ok) {
      setCouponError(result.error || 'Invalid coupon');
      return;
    }
    setCouponInput('');
    setCouponPanelOpen(false);
  };

  const handleRemoveCoupon = () => {
    removeCoupon();
    setCouponInput('');
    setCouponError(null);
  };

  const handleApplyGiftCard = async () => {
    if (!giftCardInput.trim()) return;
    setGiftCardError(null);
    setApplyingGiftCard(true);
    const result = await validateGiftCard(
      giftCardInput,
      Math.max(0, subtotal - couponDiscount - bogoDiscount)
    );
    setApplyingGiftCard(false);
    if (!result.ok || !result.giftCard) {
      setGiftCardError(result.error || 'Invalid gift card code');
      return;
    }
    setAppliedGiftCard(result.giftCard);
    setGiftCardDiscount(result.redeemable || 0);
    setGiftCardInput('');
    setGiftCardPanelOpen(false);
  };

  const handleRemoveGiftCard = () => {
    setAppliedGiftCard(null);
    setGiftCardDiscount(0);
    setGiftCardInput('');
    setGiftCardError(null);
  };

  const handleApplyFromList = async (c: Coupon) => {
    setApplyingFromList(c.code);
    setCouponError(null);
    try {
      const result = await applyCoupon(c.code);
      if (!result.ok) {
        setCouponError(result.error || 'Could not apply this coupon');
      } else {
        setCouponPanelOpen(false);
      }
    } finally {
      setApplyingFromList(null);
    }
  };

  // Total rupee amount the shopper is saving on this bag — MRP discount on
  // every line item, plus whatever the applied coupon knocks off. Drives
  // the green savings strip pinned above the Checkout button.
  const mrpSavings = items.reduce((sum, i) => {
    const mrp = i.product.mrp ?? i.product.price;
    return sum + Math.max(0, mrp - i.product.price) * i.quantity;
  }, 0);
  const totalSavings = mrpSavings + couponDiscount + bogoDiscount;

  return (
    <Sheet
      open={isCartOpen}
      onOpenChange={(open) => {
        if (open && panelRef.current) {
          panelRef.current.style.transition = '';
          panelRef.current.style.transform = '';
        }
        setCartOpen(open);
      }}
    >
      <SheetContent
        ref={panelRef}
        side="right"
        className="flex w-full flex-col gap-0 bg-background p-0 sm:max-w-md"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
      >
        <SheetHeader className="flex-row items-center gap-3 space-y-0 border-b border-border/60 p-5">
          <button
            type="button"
            onClick={() => setCartOpen(false)}
            aria-label="Back"
            className="-ml-1 rounded-sm p-1 text-foreground/80 transition-colors hover:text-primary"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex items-baseline gap-2">
            <SheetTitle className="font-serif text-xl font-bold text-primary">
              Bag
            </SheetTitle>
            <span className="text-sm text-muted-foreground">
              {count} item{count === 1 ? '' : 's'}
            </span>
          </div>
          <SheetDescription className="sr-only">
            Review the items in your shopping bag
          </SheetDescription>
        </SheetHeader>

        {items.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
            <div className="rounded-full bg-muted p-5">
              <ShoppingBag className="h-8 w-8 text-muted-foreground" />
            </div>
            <div>
              <p className="font-serif text-lg font-semibold">Your bag is empty</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Add some beautiful pieces to get started.
              </p>
            </div>
            <Button asChild onClick={() => setCartOpen(false)} className="bg-primary">
              <Link href="/shop">Browse Collection</Link>
            </Button>
          </div>
        ) : (
          <>
            <div className="flex flex-1 flex-col gap-3 overflow-y-auto bg-muted/40 p-4">
              {totalFreeUnitsUnlocked > 0 && (
                <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-3">
                  <p className="flex items-center gap-1.5 text-sm font-semibold text-emerald-700">
                    <PartyPopper className="h-4 w-4 shrink-0" />
                    Wow! You got {totalFreeUnitsUnlocked}{' '}
                    {totalFreeUnitsUnlocked > 1 ? 'items' : 'item'} discount FREE — BOGO applied!
                  </p>
                  <p className="mt-0.5 text-xs text-emerald-700/80">
                    {formatINR(bogoDiscount)} off already added to your bag.
                  </p>
                  {nextBogoHint && (
                    <p className="mt-1.5 flex items-center gap-1.5 border-t border-emerald-200 pt-1.5 text-xs font-medium text-emerald-700">
                      <Tag className="h-3.5 w-3.5 shrink-0" />
                      {nextBogoHint.unitsToNextFree === 1
                        ? `Add 1 more to unlock another ${
                            nextBogoHint.promotion.free_item_discount_percent === 100
                              ? 'FREE item'
                              : `${nextBogoHint.promotion.free_item_discount_percent}% off item`
                          }!`
                        : `Add ${nextBogoHint.unitsToNextFree} more to unlock another ${
                            nextBogoHint.promotion.free_item_discount_percent === 100
                              ? 'FREE item'
                              : `${nextBogoHint.promotion.free_item_discount_percent}% off item`
                          }!`}
                    </p>
                  )}
                </div>
              )}
              {totalFreeUnitsUnlocked === 0 && nextBogoHint && (
                <div className="rounded-lg border border-secondary/40 bg-secondary/10 p-3">
                  <p className="flex items-center gap-1.5 text-sm font-semibold text-secondary-foreground">
                    <Tag className="h-3.5 w-3.5 shrink-0 text-secondary" />
                    {nextBogoHint.unitsToNextFree === 1
                      ? `Add 1 more qualifying item to get ${nextBogoHint.promotion.get_qty} ${
                          nextBogoHint.promotion.free_item_discount_percent === 100
                            ? 'FREE'
                            : `at ${nextBogoHint.promotion.free_item_discount_percent}% off`
                        }!`
                      : `Add ${nextBogoHint.unitsToNextFree} more qualifying items to unlock ${
                          nextBogoHint.promotion.get_qty
                        } ${
                          nextBogoHint.promotion.free_item_discount_percent === 100 ? 'FREE' : 'discounted'
                        } item${nextBogoHint.promotion.get_qty > 1 ? 's' : ''}!`}
                  </p>
                  <p className="mt-0.5 text-xs text-secondary-foreground/70">
                    {nextBogoHint.promotion.buy_qty} + {nextBogoHint.promotion.get_qty} deal — the cheapest
                    item{nextBogoHint.promotion.get_qty > 1 ? 's' : ''} in every full set get
                    {nextBogoHint.promotion.get_qty > 1 ? '' : 's'} discounted automatically.
                  </p>
                </div>
              )}
              {!user && (
                <div className="rounded-lg border border-border/60 bg-card p-4">
                  <p className="text-sm font-medium text-foreground">
                    Get Started &amp; grab best offers!
                  </p>
                  <Link
                    href="/login"
                    onClick={() => setCartOpen(false)}
                    className="mt-3 block rounded-full border border-primary/40 py-2 text-center text-sm font-semibold text-primary transition-colors hover:bg-primary/5"
                  >
                    Login / Register
                  </Link>
                </div>
              )}

              <div className="flex flex-col gap-3">
                {items.map((item) => {
                  const discount = discountPct(item.product.price, item.product.mrp);
                  const mrp = item.product.mrp ?? item.product.price;
                  const lineTotal = item.product.price * item.quantity;
                  const itemCouponDiscount =
                    appliedCoupon && couponDiscount > 0
                      ? computeItemCouponDiscount(appliedCoupon, lineTotal)
                      : 0;
                  const linePriceAfterCoupon = Math.max(0, lineTotal - itemCouponDiscount);
                  // Same "is this product currently on an active, badge-eligible
                  // BOGO promotion" check the product card / product page use —
                  // so a shopper who adds a BOGO item to the bag keeps seeing the
                  // exact same offer badge here, and it's simply absent for any
                  // item that isn't part of a live offer.
                  const itemBogoPromotion = getVisibleBogoPromotion(item.product.id, activePromotions);
                  return (
                    <div
                      key={`${item.product.id}-${item.size}-${item.product.colors?.[0] ?? ''}`}
                      className="rounded-lg border border-border/60 bg-card p-4"
                    >
                      <div className="flex gap-3">
                        <Link
                          href={`/product/${item.product.slug}`}
                          onClick={() => setCartOpen(false)}
                          className="relative h-20 w-16 shrink-0 overflow-hidden rounded-md bg-muted"
                        >
                          <Image
                            src={toPublicMediaUrl(item.product.images[0]) || 'https://placehold.co/64x80?text=No+Image'}
                            alt={`${item.product.name} - ${item.product.fabric} ${item.product.category}`}
                            fill
                            sizes="64px"
                            className="object-cover"
                          />
                        </Link>
                        <div className="flex flex-1 flex-col">
                          <div className="flex items-start justify-between gap-2">
                            <Link
                              href={`/product/${item.product.slug}`}
                              onClick={() => setCartOpen(false)}
                              className="line-clamp-2 text-sm font-medium hover:text-primary"
                            >
                              {item.product.name}
                            </Link>
                            <button
                              onClick={() =>
                                removeItem(item.product.id, item.size, item.product.colors?.[0] ?? null)
                              }
                              className="shrink-0 text-muted-foreground transition-colors hover:text-destructive"
                              aria-label="Remove item"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            Size: {item.size}
                            {item.product.colors?.[0] ? ` · ${item.product.colors[0]}` : ''}
                          </p>
                          <div className="mt-1 flex flex-wrap items-center gap-1.5">
                            <LowStockBadge stockQuantity={item.product.stock_quantity} />
                            {itemBogoPromotion && (
                              <Badge className="border-transparent bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary">
                                {formatBogoLabel(itemBogoPromotion)}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>

                      <Separator className="my-3" />

                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Quantity :</span>
                        <div className="flex items-center rounded-md border border-border">
                          <button
                            onClick={() =>
                              updateQuantity(item.product.id, item.size, item.quantity - 1, item.product.colors?.[0] ?? null)
                            }
                            className="p-1.5 text-muted-foreground hover:text-primary"
                            aria-label="Decrease quantity"
                          >
                            <Minus className="h-3.5 w-3.5" />
                          </button>
                          <span className="w-7 text-center text-sm font-medium">
                            {item.quantity}
                          </span>
                          <button
                            onClick={() =>
                              updateQuantity(item.product.id, item.size, item.quantity + 1, item.product.colors?.[0] ?? null)
                            }
                            className="p-1.5 text-muted-foreground hover:text-primary"
                            aria-label="Increase quantity"
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>

                      <Separator className="my-3" />

                      <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-1 text-muted-foreground">
                          You Pay <Info className="h-3.5 w-3.5" />
                        </span>
                        <span className="flex items-center gap-2">
                          <span className="font-serif text-base font-bold text-primary">
                            {formatINR(item.product.price * item.quantity)}
                          </span>
                          {mrp > item.product.price && (
                            <span className="text-xs text-muted-foreground line-through">
                              {formatINR(mrp * item.quantity)}
                            </span>
                          )}
                          {discount > 0 && (
                            <span className="text-xs font-semibold text-green-600">
                              {discount}% off
                            </span>
                          )}
                        </span>
                      </div>

                      {appliedCoupon && itemCouponDiscount > 0 && (
                        <div className="mt-2 flex items-center justify-between text-xs">
                          <span className="flex items-center gap-1 text-secondary-foreground">
                            <Tag className="h-3 w-3" /> {appliedCoupon.code} applied — you pay
                          </span>
                          <span className="flex items-center gap-2">
                            <span className="text-muted-foreground line-through">
                              {formatINR(lineTotal)}
                            </span>
                            <span className="font-serif text-sm font-bold text-primary">
                              {formatINR(linePriceAfterCoupon)}
                            </span>
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Coupons + Gift card — one combined card so the two
                  offer rows read as a single collapsible unit instead of
                  two separate boxes. */}
              <div className="divide-y divide-border/60 rounded-lg border border-border/60 bg-card">
                <div>
                {appliedCoupon ? (
                  <div className="flex items-center justify-between p-4">
                    <span className="flex items-center gap-1.5 text-sm font-medium text-secondary-foreground">
                      <Tag className="h-3.5 w-3.5" /> {appliedCoupon.code} applied
                    </span>
                    <button
                      type="button"
                      onClick={handleRemoveCoupon}
                      aria-label="Remove coupon"
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setCouponPanelOpen((o) => !o)}
                    className="flex w-full items-center justify-between gap-2 p-4 text-left"
                  >
                    <span className="flex items-center gap-3">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-primary">
                        <Tag className="h-4 w-4" />
                      </span>
                      <span>
                        <span className="block text-sm font-semibold">Coupons</span>
                        <span className="block text-xs text-primary">
                          Apply now and save extra!
                        </span>
                      </span>
                    </span>
                    {couponPanelOpen ? (
                      <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                  </button>
                )}
                {!appliedCoupon && couponPanelOpen && (
                  <div className="border-t border-border/60 p-4">
                    <div className="flex flex-col gap-1.5">
                      <div className="flex gap-2">
                        <Input
                          placeholder="Coupon code"
                          value={couponInput}
                          onChange={(e) => setCouponInput(e.target.value)}
                          className="h-9"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          className="h-9 shrink-0"
                          disabled={applyingCoupon || !couponInput.trim()}
                          onClick={handleApplyCoupon}
                        >
                          {applyingCoupon ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Apply'}
                        </Button>
                      </div>
                      {couponError && <p className="text-xs text-destructive">{couponError}</p>}
                    </div>
                  </div>
                )}
                </div>

                <div>
                {appliedGiftCard ? (
                  <div className="flex items-center justify-between p-4">
                    <span className="flex items-center gap-1.5 text-sm font-medium text-secondary-foreground">
                      <Gift className="h-3.5 w-3.5" /> {appliedGiftCard.code} applied (-
                      {formatINR(giftCardDiscount)})
                    </span>
                    <button
                      type="button"
                      onClick={handleRemoveGiftCard}
                      aria-label="Remove gift card"
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setGiftCardPanelOpen((o) => !o)}
                    className="flex w-full items-center justify-between gap-2 p-4 text-left"
                  >
                    <span className="flex items-center gap-3">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-primary">
                        <Gift className="h-4 w-4" />
                      </span>
                      <span>
                        <span className="block text-sm font-semibold">Gift card</span>
                        <span className="block text-xs text-primary">
                          Redeem your gift card balance
                        </span>
                      </span>
                    </span>
                    {giftCardPanelOpen ? (
                      <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                  </button>
                )}
                {!appliedGiftCard && giftCardPanelOpen && (
                  <div className="border-t border-border/60 p-4">
                    <div className="flex flex-col gap-1.5">
                      <div className="flex gap-2">
                        <Input
                          placeholder="Gift card code"
                          value={giftCardInput}
                          onChange={(e) => setGiftCardInput(e.target.value)}
                          className="h-9"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          className="h-9 shrink-0"
                          disabled={applyingGiftCard || !giftCardInput.trim()}
                          onClick={handleApplyGiftCard}
                        >
                          {applyingGiftCard ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Apply'}
                        </Button>
                      </div>
                      {giftCardError && <p className="text-xs text-destructive">{giftCardError}</p>}
                    </div>
                  </div>
                )}
                </div>
              </div>

              {/* Available coupons (admin-flagged "Show on Product Page"), only
                  while nothing is applied yet — same offers a shopper would see
                  on a product page, surfaced here too. */}
              {!appliedCoupon && availableCoupons.length > 0 && (
                <div className="flex flex-col gap-2 rounded-lg border border-border/60 bg-card p-4">
                  <div className="flex items-center gap-1.5 text-sm font-semibold">
                    <Tag className="h-4 w-4 text-secondary" />
                    Available Coupons
                  </div>
                  {availableCoupons.map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center justify-between gap-3 rounded-lg border border-dashed border-secondary/60 bg-secondary/10 px-3 py-2.5"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-sm font-bold tracking-wide text-primary">
                            {c.code}
                          </span>
                          <span className="text-xs font-semibold text-secondary-foreground">
                            {c.discount_type === 'percentage'
                              ? `${c.discount_value}% OFF`
                              : `${formatINR(c.discount_value)} OFF`}
                          </span>
                        </div>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {c.min_order_value > 0
                            ? `On orders above ${formatINR(c.min_order_value)}`
                            : 'No minimum order value'}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleApplyFromList(c)}
                        disabled={applyingFromList === c.code}
                        className="flex shrink-0 items-center gap-1 rounded-md border border-primary bg-background px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary hover:text-primary-foreground disabled:opacity-60"
                      >
                        {applyingFromList === c.code ? 'Applying…' : 'Apply'}
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Price details */}
              <div className="rounded-lg border border-border/60 bg-card">
                <button
                  type="button"
                  onClick={() => setPriceDetailsOpen((o) => !o)}
                  className="flex w-full items-center justify-between p-4 text-left"
                >
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    <ShoppingBag className="h-4 w-4 text-muted-foreground" /> Price details
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="text-sm font-semibold">
                      {formatINR(finalTotal)}
                    </span>
                    {priceDetailsOpen ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                  </span>
                </button>
                {priceDetailsOpen && (
                  <div className="flex flex-col gap-2 border-t border-border/60 p-4 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Subtotal</span>
                      <span>{formatINR(subtotal)}</span>
                    </div>
                    {appliedCoupon && couponDiscount - recoveryDiscount > 0 && (
                      <div className="flex items-center justify-between text-secondary-foreground">
                        <span className="flex items-center gap-1.5">
                          <Tag className="h-3.5 w-3.5" /> {appliedCoupon.code}
                        </span>
                        <span>-{formatINR(couponDiscount - recoveryDiscount)}</span>
                      </div>
                    )}
                    {recoveryOffer && recoveryDiscount > 0 && (
                      <div className="flex items-center justify-between font-medium text-emerald-700">
                        <span className="flex items-center gap-1.5">
                          <Tag className="h-3.5 w-3.5" /> Special offer {recoveryOffer.code}
                        </span>
                        <span>-{formatINR(recoveryDiscount)}</span>
                      </div>
                    )}
                    {bogoDiscount > 0 && (
                      <div className="flex items-center justify-between text-secondary-foreground">
                        <span className="flex items-center gap-1.5">
                          <Tag className="h-3.5 w-3.5" />
                          {totalFreeUnitsUnlocked > 0
                            ? `${totalFreeUnitsUnlocked} item${totalFreeUnitsUnlocked > 1 ? 's' : ''} discounted (BOGO)`
                            : 'BOGO offer applied'}
                        </span>
                        <span>-{formatINR(bogoDiscount)}</span>
                      </div>
                    )}
                    {appliedGiftCard && clampedGiftCardDiscount > 0 && (
                      <div className="flex items-center justify-between text-secondary-foreground">
                        <span className="flex items-center gap-1.5">
                          <Gift className="h-3.5 w-3.5" /> {appliedGiftCard.code}
                        </span>
                        <span>-{formatINR(clampedGiftCardDiscount)}</span>
                      </div>
                    )}
                    <Separator />
                    <div className="flex items-center justify-between font-serif text-base font-bold text-primary">
                      <span>Total</span>
                      <span>{formatINR(finalTotal)}</span>
                    </div>
                  </div>
                )}
              </div>

              <CartBump compact />
            </div>

            <div className="border-t border-border/60">
              {totalSavings > 0 && (
                <p className="bg-secondary/15 px-5 py-2 text-center text-sm font-medium text-secondary-foreground">
                  You are saving {formatINR(totalSavings)} on this order
                </p>
              )}
              {appliedCoupon && couponDiscount > 0 && (
                <div className="flex items-center justify-between px-5 pt-4 text-sm">
                  <span className="flex items-center gap-1.5 font-medium text-secondary-foreground">
                    <Tag className="h-3.5 w-3.5" /> {appliedCoupon.code} applied — you pay
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="text-muted-foreground line-through">{formatINR(subtotal)}</span>
                    <span className="font-serif text-base font-bold text-primary">
                      {formatINR(finalTotal)}
                    </span>
                  </span>
                </div>
              )}
              {appliedGiftCard && clampedGiftCardDiscount > 0 && (
                <div className="flex items-center justify-between px-5 pt-4 text-sm">
                  <span className="flex items-center gap-1.5 font-medium text-secondary-foreground">
                    <Gift className="h-3.5 w-3.5" /> {appliedGiftCard.code} applied — you pay
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="text-muted-foreground line-through">{formatINR(subtotal)}</span>
                    <span className="font-serif text-base font-bold text-primary">
                      {formatINR(finalTotal)}
                    </span>
                  </span>
                </div>
              )}
              {onlinePaymentSavings > 0 && (
                <div className="mx-5 mt-4 flex flex-col gap-1 rounded-xl border border-emerald-200/70 bg-gradient-to-br from-emerald-50 via-emerald-50/60 to-white px-3.5 py-2.5 shadow-sm">
                  <div className="flex items-baseline gap-1.5">
                    <Wallet className="h-3.5 w-3.5 shrink-0 self-center text-emerald-600" />
                    <span className="text-[11px] font-medium uppercase tracking-wide text-emerald-700/80">
                      Pay online &amp; get this at
                    </span>
                    <span className="font-serif text-base font-bold text-emerald-700">
                      {formatINR(Math.max(0, finalTotal - onlinePaymentSavings))}
                    </span>
                  </div>
                  <p className="text-[11px] leading-snug text-emerald-700/80">
                    Extra {formatINR(onlinePaymentSavings)} ({paymentDiscount.percent}%) off with{' '}
                    {paymentDiscount.label} — applied automatically at checkout
                  </p>
                </div>
              )}
              <div className="p-5">
                <p className="mb-3 text-xs text-muted-foreground">
                  Shipping &amp; taxes calculated at checkout.
                </p>
                <div className="flex flex-col gap-2">
                  <Button
                    asChild
                    className="bg-primary"
                    onClick={() => {
                      setCartOpen(false);
                      clearBuyNow();
                      markCheckoutEntry();
                    }}
                  >
                    <Link href="/checkout">Checkout</Link>
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setCartOpen(false)}
                    asChild
                  >
                    <Link href="/cart">View Bag</Link>
                  </Button>
                </div>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
