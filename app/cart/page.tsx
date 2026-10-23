'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { toPublicMediaUrl } from '@/lib/media-url';
import { Minus, Plus, Trash2, ShoppingBag, ArrowRight, Tag, X, Loader2, PartyPopper, Sparkles, Wallet, Gift, ChevronDown, ChevronRight } from 'lucide-react';
import {
  useCart,
  usePaymentDiscount,
  getVisibleBogoPromotion,
  formatBogoLabel,
  getBogoCartProgress,
} from '@/lib/cart-context';
import { markCheckoutEntry } from '@/lib/checkout-return';
import { fireGtagEvent } from '@/lib/gtag-track';
import { formatINR } from '@/lib/format';
import { validateGiftCard, GiftCard } from '@/lib/giftcards-api';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import CartBump from '@/components/cart/cart-bump';
import LowStockBadge from '@/components/growth/low-stock-badge';
import {
  ShippingSettings,
  DEFAULT_SHIPPING_SETTINGS,
  fetchShippingSettings,
} from '@/lib/pincode-api';

export default function CartPage() {
  const {
    items,
    updateQuantity,
    removeItem,
    subtotal,
    clearCart,
    appliedCoupon,
    couponDiscount,
    primaryCouponDiscount,
    recoveryOffer,
    recoveryDiscount,
    removeRecoveryOffer,
    applyCoupon,
    applyCouponIfBetter,
    removeCoupon,
    clearBuyNow,
    activePromotions,
    bogoDiscount,
  } = useCart();
  const { paymentDiscount } = usePaymentDiscount();
  const [shippingSettings, setShippingSettings] = useState<ShippingSettings>(
    DEFAULT_SHIPPING_SETTINGS
  );
  const [couponInput, setCouponInput] = useState('');
  const [applyingCoupon, setApplyingCoupon] = useState(false);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [couponPanelOpen, setCouponPanelOpen] = useState(false);

  // Gift card — same collapsed-pill pattern as Coupons, and same
  // "checkout re-validates before actually redeeming" relationship the
  // checkout page's own gift card box has to /api/giftcards/redeem.
  const [giftCardInput, setGiftCardInput] = useState('');
  const [applyingGiftCard, setApplyingGiftCard] = useState(false);
  const [giftCardError, setGiftCardError] = useState<string | null>(null);
  const [giftCardPanelOpen, setGiftCardPanelOpen] = useState(false);
  const [appliedGiftCard, setAppliedGiftCard] = useState<GiftCard | null>(null);
  const [giftCardDiscount, setGiftCardDiscount] = useState(0);

  const handleApplyCoupon = async () => {
    setCouponError(null);
    setApplyingCoupon(true);
    const result = await applyCouponIfBetter(couponInput);
    setApplyingCoupon(false);
    if (!result.ok) {
      setCouponError(result.error || 'Invalid coupon');
      return;
    }
    if (result.outcome === 'kept') {
      // One coupon per order — don't silently swap a bigger discount for a smaller one.
      setCouponError(`"${result.coupon?.code}" already gives you a bigger discount, so we kept it. Only one coupon can be used per order.`);
      return;
    }
    if (result.outcome === 'same') {
      setCouponError('This coupon is already applied.');
      return;
    }
    toast.success(
      result.outcome === 'replaced'
        ? `"${result.coupon?.code}" applied — it saves more than your previous coupon`
        : `Coupon "${result.coupon?.code}" applied`
    );
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

  // Same "Add N more to get M FREE!" progress + "already unlocked" math the
  // cart drawer uses (getBogoCartProgress mirrors computeBogoDiscount), so
  // this page never disagrees with the drawer or the actual discount applied.
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

  useEffect(() => {
    fetchShippingSettings().then(setShippingSettings).catch(() => {
      // fall back to defaults already set above
    });
  }, []);

  // Fire GA4 / Google Ads view_cart once per page load — same hydration
  // race as begin_checkout on the checkout page (cart-context loads items
  // from localStorage in its own effect *after* mount, so items.length is
  // 0 on first render even with a non-empty cart). Depend on items.length
  // so this re-runs once hydration lands, guarded so it still only
  // actually fires once per visit to this page.
  const viewCartFiredRef = useRef(false);
  useEffect(() => {
    if (items.length > 0 && !viewCartFiredRef.current) {
      viewCartFiredRef.current = true;
      fireGtagEvent('view_cart', {
        currency: 'INR',
        value: subtotal,
        items: items.map((item) => ({
          // See components/cart-drawer.tsx — same feed-matched id, falling
          // back to the base product id for older lines / variant-less products.
          item_id: item.feedItemId ?? item.product.id,
          item_group_id: item.product.id,
          item_name: item.product.name,
          price: item.product.price,
          quantity: item.quantity ?? 1,
        })),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length]);

  if (items.length === 0) {
    return (
      <div className="container-boutique flex flex-col items-center gap-5 py-24 text-center">
        <div className="rounded-full bg-muted p-6">
          <ShoppingBag className="h-10 w-10 text-muted-foreground" />
        </div>
        <div>
          <h1 className="font-serif text-2xl font-bold text-primary">Your cart is empty</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Looks like you haven’t added anything yet.
          </p>
        </div>
        <Button asChild className="bg-primary">
          <Link href="/shop">Start Shopping</Link>
        </Button>
      </div>
    );
  }

  const shipping =
    shippingSettings.free_shipping_threshold > 0 &&
    subtotal >= shippingSettings.free_shipping_threshold
      ? 0
      : shippingSettings.flat_rate;
  const discountedSubtotal = Math.max(0, subtotal - couponDiscount - bogoDiscount);
  const priceBeforeRecovery = Math.max(0, subtotal - primaryCouponDiscount - bogoDiscount);
  const priceAfterRecovery = Math.max(0, priceBeforeRecovery - recoveryDiscount);
  const clampedGiftCardDiscount = Math.min(giftCardDiscount, discountedSubtotal);
  const total = discountedSubtotal - clampedGiftCardDiscount + shipping;
  const onlinePaymentSavings =
    paymentDiscount.enabled && paymentDiscount.percent > 0
      ? Math.round((discountedSubtotal * paymentDiscount.percent) / 100)
      : 0;

  return (
    <div className="container-boutique py-8">
      <h1 className="mb-6 font-serif text-3xl font-bold text-primary sm:text-4xl">
        Shopping Cart
      </h1>

      {recoveryOffer && (
        <div className="mb-6 overflow-hidden rounded-lg border border-amber-300 bg-gradient-to-r from-amber-50 to-rose-50 p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2 font-serif text-lg font-bold text-primary">
              <Sparkles className="h-5 w-5 shrink-0 text-amber-600" />
              {recoveryDiscount > 0
                ? 'A little thank-you from us 🎁'
                : `Your special offer ${recoveryOffer.code} is saved for you`}
            </div>
            <button
              type="button"
              onClick={removeRecoveryOffer}
              aria-label="Remove special offer"
              className="text-muted-foreground hover:text-destructive"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          {recoveryDiscount > 0 && (
            <p className="mt-1 text-sm text-muted-foreground">
              Thank you for your interest in our handlooms. We've added an extra {formatINR(recoveryDiscount)} off your order.
            </p>
          )}
          {recoveryDiscount > 0 ? (
            <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
              <div className="rounded-md bg-white/70 p-3">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  {appliedCoupon && primaryCouponDiscount > 0 ? `After ${appliedCoupon.code}` : 'Your price'}
                </div>
                <div className="text-lg font-semibold line-through decoration-muted-foreground/60">
                  {formatINR(priceBeforeRecovery)}
                </div>
              </div>
              <div className="rounded-md bg-white/70 p-3">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  Special offer {recoveryOffer.code}
                </div>
                <div className="text-lg font-semibold text-emerald-700">-{formatINR(recoveryDiscount)}</div>
              </div>
              <div className="rounded-md bg-white/70 p-3 ring-1 ring-emerald-300">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Your final price</div>
                <div className="text-lg font-bold text-primary">{formatINR(priceAfterRecovery)}</div>
              </div>
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              Add items worth ₹{recoveryOffer.min_order_value} or more and this special offer will be added for you.
            </p>
          )}
          {appliedCoupon && primaryCouponDiscount > 0 && recoveryDiscount > 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              Thank you for coming back! Your coupon {appliedCoupon.code} (-{formatINR(primaryCouponDiscount)}) stays applied, and this is an extra saving on top of it.
            </p>
          )}
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {totalFreeUnitsUnlocked > 0 && (
            <div className="mb-4 rounded-lg border border-emerald-300 bg-emerald-50 p-3">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-emerald-700">
                <PartyPopper className="h-4 w-4 shrink-0" />
                Wow! You got {totalFreeUnitsUnlocked}{' '}
                {totalFreeUnitsUnlocked > 1 ? 'items' : 'item'} discount FREE — BOGO applied!
              </p>
              <p className="mt-0.5 text-xs text-emerald-700/80">
                {formatINR(bogoDiscount)} off already added to your cart.
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
            <div className="mb-4 rounded-lg border border-secondary/40 bg-secondary/10 p-3">
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
          <ul className="flex flex-col gap-4">
            {items.map((item) => {
              // Same "is this product currently on an active, badge-eligible
              // BOGO promotion" check the product card / product page use —
              // keeps the offer badge consistent everywhere it can appear.
              const itemBogoPromotion = getVisibleBogoPromotion(item.product.id, activePromotions);
              return (
              <li
                key={`${item.product.id}-${item.size}`}
                className="flex gap-4 rounded-lg border border-border/60 bg-card p-4"
              >
                <Link
                  href={`/product/${item.product.slug}`}
                  className="relative h-32 w-24 shrink-0 overflow-hidden rounded-md bg-muted"
                >
                  <Image
                    src={toPublicMediaUrl(item.product.images[0]) || 'https://placehold.co/96x120?text=No+Image'}
                    alt={`${item.product.name} - ${item.product.fabric} ${item.product.category}`}
                    fill
                    sizes="96px"
                    className="object-cover"
                  />
                </Link>
                <div className="flex flex-1 flex-col">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <Link
                        href={`/product/${item.product.slug}`}
                        className="font-serif text-base font-semibold hover:text-primary"
                      >
                        {item.product.name}
                      </Link>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {item.product.category} · Size: {item.size}
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
                    <button
                      onClick={() => removeItem(item.product.id, item.size, item.product.colors?.[0] ?? null)}
                      className="text-muted-foreground transition-colors hover:text-destructive"
                      aria-label="Remove item"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="mt-auto flex items-end justify-between pt-3">
                    <div className="flex items-center rounded-md border border-border">
                      <button
                        onClick={() => updateQuantity(item.product.id, item.size, item.quantity - 1, item.product.colors?.[0] ?? null)}
                        className="p-2 text-muted-foreground hover:text-primary"
                        aria-label="Decrease quantity"
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <span className="w-8 text-center text-sm font-semibold">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() => updateQuantity(item.product.id, item.size, item.quantity + 1, item.product.colors?.[0] ?? null)}
                        className="p-2 text-muted-foreground hover:text-primary"
                        aria-label="Increase quantity"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="text-right">
                      <p className="font-serif text-base font-bold text-primary">
                        {formatINR(item.product.price * item.quantity)}
                      </p>
                      {item.quantity > 1 && (
                        <p className="text-xs text-muted-foreground">
                          {formatINR(item.product.price)} each
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </li>
              );
            })}
          </ul>

          <div className="mt-4 flex justify-between">
            <Button asChild variant="outline">
              <Link href="/shop">Continue Shopping</Link>
            </Button>
            <Button variant="ghost" onClick={clearCart} className="text-destructive">
              Clear cart
            </Button>
          </div>
        </div>

        <aside className="lg:col-span-1">
          <div className="sticky top-24 rounded-lg border border-border/60 bg-card p-5">
            <h2 className="font-serif text-lg font-bold text-primary">
              Order Summary
            </h2>
            <Separator className="my-4" />

            {/* Coupon + Gift card — one combined card */}
            <div className="divide-y divide-border/60 rounded-lg border border-border/60">
              <div>
              {appliedCoupon ? (
                <div className="flex items-center justify-between p-3 text-sm">
                  <span className="flex items-center gap-1.5 font-medium text-secondary-foreground">
                    <Tag className="h-3.5 w-3.5" /> {appliedCoupon.code} applied
                  </span>
                  <span className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setCouponPanelOpen((o) => !o)}
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      Try another code
                    </button>
                    <button
                      type="button"
                      onClick={handleRemoveCoupon}
                      aria-label="Remove coupon"
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </span>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setCouponPanelOpen((o) => !o)}
                  className="flex w-full items-center justify-between gap-2 p-3 text-left"
                >
                  <span className="flex items-center gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-primary">
                      <Tag className="h-4 w-4" />
                    </span>
                    <span>
                      <span className="block text-sm font-semibold">Coupons</span>
                      <span className="block text-xs text-primary">Apply now and save extra!</span>
                    </span>
                  </span>
                  {couponPanelOpen ? (
                    <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                </button>
              )}
              {couponPanelOpen && (
                <div className="border-t border-border/60 p-3">
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
                    {appliedCoupon && !couponError && (
                      <p className="text-xs text-muted-foreground">
                        You can use one coupon per order, and we'll keep whichever saves you more. If we've sent you a special offer, it is added on top.
                      </p>
                    )}
                  </div>
                </div>
              )}
              </div>

              <div>
              {appliedGiftCard ? (
                <div className="flex items-center justify-between p-3 text-sm">
                  <span className="flex items-center gap-1.5 font-medium text-secondary-foreground">
                    <Gift className="h-3.5 w-3.5" /> {appliedGiftCard.code} applied (-
                    {formatINR(clampedGiftCardDiscount)})
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
                  className="flex w-full items-center justify-between gap-2 p-3 text-left"
                >
                  <span className="flex items-center gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-primary">
                      <Gift className="h-4 w-4" />
                    </span>
                    <span>
                      <span className="block text-sm font-semibold">Gift card</span>
                      <span className="block text-xs text-primary">Redeem your gift card balance</span>
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
                <div className="border-t border-border/60 p-3">
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
            <Separator className="my-4" />

            <div className="flex flex-col gap-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-medium">{formatINR(subtotal)}</span>
              </div>
              {primaryCouponDiscount > 0 && (
                <div className="flex justify-between text-secondary-foreground">
                  <span>Coupon discount{appliedCoupon ? ` (${appliedCoupon.code})` : ''}</span>
                  <span>-{formatINR(primaryCouponDiscount)}</span>
                </div>
              )}
              {recoveryOffer && recoveryDiscount > 0 && (
                <div className="flex justify-between font-medium text-emerald-700">
                  <span>Special offer ({recoveryOffer.code})</span>
                  <span>-{formatINR(recoveryDiscount)}</span>
                </div>
              )}
              {bogoDiscount > 0 && (
                <div className="flex justify-between text-secondary-foreground">
                  <span>
                    {totalFreeUnitsUnlocked > 0
                      ? `${totalFreeUnitsUnlocked} item${totalFreeUnitsUnlocked > 1 ? 's' : ''} discounted (BOGO)`
                      : 'BOGO offer applied'}
                  </span>
                  <span>-{formatINR(bogoDiscount)}</span>
                </div>
              )}
              {appliedGiftCard && clampedGiftCardDiscount > 0 && (
                <div className="flex justify-between text-secondary-foreground">
                  <span className="flex items-center gap-1.5">
                    <Gift className="h-3.5 w-3.5" /> Gift card ({appliedGiftCard.code})
                  </span>
                  <span>-{formatINR(clampedGiftCardDiscount)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Shipping</span>
                <span className="font-medium">
                  {shipping === 0 ? (
                    <span className="text-secondary">FREE</span>
                  ) : (
                    formatINR(shipping)
                  )}
                </span>
              </div>
              {shipping > 0 && (
                <p className="text-xs text-muted-foreground">
                  Add {formatINR(2000 - subtotal)} more for free shipping.
                </p>
              )}
            </div>

            <div className="mt-4">
              <CartBump />
            </div>

            <Separator className="my-4" />
            <div className="flex items-center justify-between">
              <span className="font-serif text-base font-semibold">Total</span>
              <span className="font-serif text-xl font-bold text-primary">
                {formatINR(total)}
              </span>
            </div>

            {onlinePaymentSavings > 0 && (
              <div className="mt-4 flex flex-col gap-1 rounded-xl border border-emerald-200/70 bg-gradient-to-br from-emerald-50 via-emerald-50/60 to-white px-3.5 py-2.5 shadow-sm">
                <div className="flex items-baseline gap-1.5">
                  <Wallet className="h-3.5 w-3.5 shrink-0 self-center text-emerald-600" />
                  <span className="text-[11px] font-medium uppercase tracking-wide text-emerald-700/80">
                    Pay online &amp; get this at
                  </span>
                  <span className="font-serif text-base font-bold text-emerald-700">
                    {formatINR(Math.max(0, total - onlinePaymentSavings))}
                  </span>
                </div>
                <p className="text-[11px] leading-snug text-emerald-700/80">
                  Extra {formatINR(onlinePaymentSavings)} ({paymentDiscount.percent}%) off with{' '}
                  {paymentDiscount.label} — applied automatically at checkout
                </p>
              </div>
            )}

            <Button asChild size="lg" className="mt-5 w-full gap-2 bg-primary" onClick={() => { clearBuyNow(); markCheckoutEntry(); }}>
              <Link href="/checkout">
                Proceed to Checkout <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </aside>
      </div>
    </div>
  );
}
