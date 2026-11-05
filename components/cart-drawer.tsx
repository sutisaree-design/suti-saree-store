'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { toPublicMediaUrl } from '@/lib/media-url';
import {
  ShoppingBag,
  Tag,
  ArrowLeft,
  X,
  Loader2,
  ChevronDown,
  ChevronRight,
  Wallet,
  PartyPopper,
  Gift,
  MapPin,
  Truck,
  Undo2,
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
import { checkPincodeServiceability, isValidPincode, PincodeResult } from '@/lib/pincode-api';
import { STORE_POLICY } from '@/lib/store-policy';
import {
  fetchFulfillmentSettings,
  DEFAULT_FULFILLMENT_SETTINGS,
  FulfillmentSettings,
} from '@/lib/marketing-api';
import CartBump from '@/components/cart/cart-bump';
import LowStockBadge from '@/components/growth/low-stock-badge';

// ---- Delivery date estimate: SAME rules as components/product/pincode-checker.tsx
// (2 PM IST order cut-off, handling days + zone transit days from Admin >
// Marketing > Shipping & Returns Timing) so both places always show one date. ----
const ORDER_CUTOFF_HOUR = 14;
type DeliveryTier = 'metro' | 'other' | 'remote';
const ZONE_TIER: Record<string, DeliveryTier> = {
  '1': 'metro',
  '2': 'other',
  '3': 'other',
  '4': 'metro',
  '5': 'other',
  '6': 'other',
  '7': 'metro',
  '8': 'remote',
  '9': 'remote',
};
const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmtDate = (d: Date) => `${d.getDate()} ${SHORT_MONTHS[d.getMonth()]}`;
const addDaysTo = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};
function estimateDelivery(pincode: string, f: FulfillmentSettings) {
  const now = new Date();
  const cutoff = new Date(now);
  cutoff.setHours(ORDER_CUTOFF_HOUR, 0, 0, 0);
  const start = new Date(now);
  if (now >= cutoff) start.setDate(start.getDate() + 1);
  const tier = ZONE_TIER[pincode[0]] ?? 'other';
  const w =
    tier === 'metro'
      ? { min: f.delivery_metro_min, max: f.delivery_metro_max }
      : tier === 'remote'
        ? { min: f.delivery_remote_min, max: f.delivery_remote_max }
        : { min: f.delivery_other_min, max: f.delivery_other_max };
  const minDate = addDaysTo(start, f.dispatch_days_min + w.min);
  const maxDate = addDaysTo(start, f.dispatch_days_max + w.max);
  return fmtDate(minDate) === fmtDate(maxDate)
    ? `By ${fmtDate(maxDate)}`
    : `${fmtDate(minDate)} – ${fmtDate(maxDate)}`;
}

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

  // ---- Delivery PIN code bar (same storage key as the product-page checker,
  // so a PIN confirmed there shows up here automatically) ----
  const PIN_KEY = 'aruhi_delivery_pincode';
  const [pinPanelOpen, setPinPanelOpen] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinChecking, setPinChecking] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinResult, setPinResult] = useState<PincodeResult | null>(null);
  const [fulfillment, setFulfillment] = useState<FulfillmentSettings>(DEFAULT_FULFILLMENT_SETTINGS);

  useEffect(() => {
    fetchFulfillmentSettings()
      .then(setFulfillment)
      .catch(() => {});
  }, []);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(PIN_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as PincodeResult;
      if (saved?.serviceable) setPinResult(saved);
    } catch {
      /* storage unavailable -- bar just starts empty */
    }
  }, []);

  const handleCheckPin = async () => {
    const pin = pinInput.trim();
    if (!isValidPincode(pin)) {
      setPinError('Enter a valid 6-digit PIN code');
      return;
    }
    setPinError(null);
    setPinChecking(true);
    try {
      const result = await checkPincodeServiceability(pin);
      if (!result.serviceable) {
        setPinError(result.message || 'Delivery is not available at this PIN code');
        return;
      }
      setPinResult(result);
      setPinPanelOpen(false);
      setPinInput('');
      try {
        window.localStorage.setItem(PIN_KEY, JSON.stringify({ ...result, savedAt: Date.now() }));
      } catch {
        /* ignore */
      }
    } catch {
      setPinError('Could not check this PIN code. Please try again.');
    } finally {
      setPinChecking(false);
    }
  };

  // ---- Tabs (Items / Coupons & Offers / Price Details) that scroll the one
  // long bag to the matching section and follow the scroll position back ----
  type BagTab = 'items' | 'offers' | 'price';
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const sectionRefs = {
    items: useRef<HTMLDivElement | null>(null),
    offers: useRef<HTMLDivElement | null>(null),
    price: useRef<HTMLDivElement | null>(null),
  };
  const [activeTab, setActiveTab] = useState<BagTab>('items');

  const scrollToSection = (tab: BagTab) => {
    const container = scrollRef.current;
    const el = sectionRefs[tab].current;
    if (!container || !el) return;
    setActiveTab(tab);
    container.scrollTo({ top: Math.max(0, el.offsetTop - 8), behavior: 'smooth' });
  };

  const onBagScroll = () => {
    const c = scrollRef.current;
    if (!c) return;
    const y = c.scrollTop + 80;
    const atBottom = c.scrollTop + c.clientHeight >= c.scrollHeight - 4;
    const priceTop = sectionRefs.price.current?.offsetTop ?? Infinity;
    const offersTop = sectionRefs.offers.current?.offsetTop ?? Infinity;
    const next: BagTab = atBottom || y >= priceTop ? 'price' : y >= offersTop ? 'offers' : 'items';
    setActiveTab((prev) => (prev === next ? prev : next));
  };

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
  const totalMrp = items.reduce((sum, i) => {
    const mrp = i.product.mrp ?? i.product.price;
    return sum + Math.max(mrp, i.product.price) * i.quantity;
  }, 0);
  const discountOnMrp = Math.max(0, totalMrp - subtotal);
  const bestCouponSaving = availableCoupons.reduce((best, c) => {
    const v = c.discount_type === 'percentage' ? (subtotal * c.discount_value) / 100 : c.discount_value;
    return Math.max(best, Math.round(v));
  }, 0);

  const tabs: { key: BagTab; label: string }[] = [
    { key: 'items', label: 'Items' },
    { key: 'offers', label: 'Coupons & Offers' },
    { key: 'price', label: 'Price Details' },
  ];

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
        hideClose
        className="flex w-full flex-col gap-0 bg-background p-0 sm:max-w-md"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
      >
        {/* Header */}
        <SheetHeader className="flex-row items-center gap-3 space-y-0 border-b border-border/60 bg-card px-4 py-3.5">
          <button
            type="button"
            onClick={() => setCartOpen(false)}
            aria-label="Back"
            className="-ml-1 rounded-sm p-1 text-foreground/80 transition-colors hover:text-primary"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <SheetTitle className="font-serif text-base font-bold tracking-wide text-primary">
            SHOPPING BAG
          </SheetTitle>
          <span className="text-xs text-muted-foreground">
            {count} item{count === 1 ? '' : 's'}
          </span>
          <SheetDescription className="sr-only">Review the items in your shopping bag</SheetDescription>
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
            {/* Delivery PIN code bar */}
            <div className="border-b border-primary/10 bg-primary/5">
              <div className="flex items-center justify-between gap-3 px-4 py-2.5">
                {pinResult ? (
                  <span className="flex min-w-0 items-start gap-2 text-sm text-foreground">
                    <Truck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span className="min-w-0">
                      <span className="block leading-snug">
                        Delivering to <b>{pinResult.pincode}</b>
                        {pinResult.city ? `, ${pinResult.city}` : ''}
                      </span>
                      <span className="block text-xs font-semibold text-emerald-700">
                        Delivery: {estimateDelivery(pinResult.pincode, fulfillment)}
                      </span>
                    </span>
                  </span>
                ) : (
                  <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <MapPin className="h-4 w-4 shrink-0 text-primary" />
                    Check delivery time &amp; services
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setPinPanelOpen((o) => !o)}
                  className="shrink-0 text-xs font-bold tracking-wide text-primary"
                >
                  {pinResult ? 'CHANGE' : 'ENTER PIN CODE'}
                </button>
              </div>
              {pinPanelOpen && (
                <div className="px-4 pb-3">
                  <div className="flex gap-2">
                    <Input
                      inputMode="numeric"
                      maxLength={6}
                      placeholder="6-digit PIN code"
                      value={pinInput}
                      onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ''))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleCheckPin();
                      }}
                      className="h-9 bg-card"
                    />
                    <Button
                      type="button"
                      className="h-9 shrink-0 bg-primary"
                      disabled={pinChecking || pinInput.length !== 6}
                      onClick={handleCheckPin}
                    >
                      {pinChecking ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Check'}
                    </Button>
                  </div>
                  {pinError && <p className="mt-1.5 text-xs text-destructive">{pinError}</p>}
                </div>
              )}
            </div>

            {/* Tabs */}
            <div className="flex gap-2 border-b border-border/60 bg-card px-4 py-2">
              {tabs.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => scrollToSection(t.key)}
                  className={`rounded-full border px-3.5 py-1 text-xs font-semibold transition-colors ${
                    activeTab === t.key
                      ? 'border-primary bg-primary/5 text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* One long scrolling bag */}
            <div
              ref={scrollRef}
              onScroll={onBagScroll}
              className="relative flex flex-1 flex-col gap-3 overflow-y-auto bg-muted/40 p-3"
            >
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

              {/* ---------- ITEMS ---------- */}
              <div ref={sectionRefs.items} className="flex flex-col gap-3">
                {items.map((item) => {
                  const mrp = item.product.mrp ?? item.product.price;
                  const rupeesOff = Math.max(0, mrp - item.product.price) * item.quantity;
                  const lineTotal = item.product.price * item.quantity;
                  const itemCouponDiscount =
                    appliedCoupon && couponDiscount > 0
                      ? computeItemCouponDiscount(appliedCoupon, lineTotal)
                      : 0;
                  const linePriceAfterCoupon = Math.max(0, lineTotal - itemCouponDiscount);
                  // Same "is this product currently on an active, badge-eligible
                  // BOGO promotion" check the product card / product page use.
                  const itemBogoPromotion = getVisibleBogoPromotion(item.product.id, activePromotions);
                  const stock = item.product.stock_quantity;
                  const maxQty = Math.max(item.quantity, Math.min(10, stock > 0 ? stock : 10));
                  const color = item.product.colors?.[0] ?? null;
                  return (
                    <div
                      key={`${item.product.id}-${item.size}-${color ?? ''}`}
                      className="rounded-xl border border-border/60 bg-card p-3 shadow-sm"
                    >
                      <div className="flex gap-3">
                        <Link
                          href={`/product/${item.product.slug}`}
                          onClick={() => setCartOpen(false)}
                          className="relative h-[104px] w-[78px] shrink-0 overflow-hidden rounded-md bg-muted"
                        >
                          <Image
                            src={toPublicMediaUrl(item.product.images[0]) || 'https://placehold.co/78x104?text=No+Image'}
                            alt={`${item.product.name} - ${item.product.fabric} ${item.product.category}`}
                            fill
                            sizes="78px"
                            className="object-cover"
                          />
                        </Link>
                        <div className="flex min-w-0 flex-1 flex-col">
                          <div className="flex items-start justify-between gap-2">
                            <Link
                              href={`/product/${item.product.slug}`}
                              onClick={() => setCartOpen(false)}
                              className="line-clamp-2 text-sm font-semibold leading-snug hover:text-primary"
                            >
                              {item.product.name}
                            </Link>
                            <button
                              onClick={() => removeItem(item.product.id, item.size, color)}
                              className="-mr-1 -mt-0.5 shrink-0 rounded p-1 text-muted-foreground transition-colors hover:text-destructive"
                              aria-label="Remove item"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                          {item.product.fabric && (
                            <p className="mt-0.5 truncate text-xs text-muted-foreground">
                              {item.product.fabric} {item.product.category}
                            </p>
                          )}

                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <span className="rounded border border-border bg-muted/50 px-2 py-1 text-xs font-medium">
                              Size: {item.size}
                            </span>
                            <label className="relative">
                              <span className="sr-only">Quantity</span>
                              <select
                                value={item.quantity}
                                onChange={(e) =>
                                  updateQuantity(item.product.id, item.size, Number(e.target.value), color)
                                }
                                className="appearance-none rounded border border-border bg-muted/50 py-1 pl-2 pr-6 text-xs font-medium focus:border-primary focus:outline-none"
                              >
                                {Array.from({ length: maxQty }, (_, i) => i + 1).map((q) => (
                                  <option key={q} value={q}>
                                    Qty: {q}
                                  </option>
                                ))}
                              </select>
                              <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
                            </label>
                            {color && <span className="text-xs text-muted-foreground">{color}</span>}
                          </div>

                          <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                            <span className="font-serif text-base font-bold text-foreground">
                              {formatINR(lineTotal)}
                            </span>
                            {mrp > item.product.price && (
                              <span className="text-xs text-muted-foreground line-through">
                                {formatINR(mrp * item.quantity)}
                              </span>
                            )}
                            {rupeesOff > 0 && (
                              <span className="text-xs font-semibold text-primary">
                                {formatINR(rupeesOff)} Off
                              </span>
                            )}
                          </div>

                          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                            <LowStockBadge stockQuantity={item.product.stock_quantity} />
                            {itemBogoPromotion && (
                              <Badge className="border-transparent bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary">
                                {formatBogoLabel(itemBogoPromotion)}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>

                      <p className="mt-3 flex items-center gap-1.5 border-t border-border/60 pt-2.5 text-xs text-muted-foreground">
                        <Undo2 className="h-3.5 w-3.5" />
                        {STORE_POLICY.returnWindowDays} days return
                      </p>

                      {appliedCoupon && itemCouponDiscount > 0 && (
                        <div className="mt-2 flex items-center justify-between text-xs">
                          <span className="flex items-center gap-1 text-secondary-foreground">
                            <Tag className="h-3 w-3" /> {appliedCoupon.code} applied — you pay
                          </span>
                          <span className="flex items-center gap-2">
                            <span className="text-muted-foreground line-through">{formatINR(lineTotal)}</span>
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

              {!user && (
                <div className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-card p-3">
                  <p className="text-sm text-foreground">
                    Login to see items from your existing bag and wishlist.
                  </p>
                  <Link
                    href="/login"
                    onClick={() => setCartOpen(false)}
                    className="shrink-0 text-xs font-bold tracking-wide text-primary"
                  >
                    LOGIN NOW
                  </Link>
                </div>
              )}

              {/* ---------- COUPONS & OFFERS ---------- */}
              <div ref={sectionRefs.offers} className="rounded-xl border border-border/60 bg-card">
                <div className="flex items-center justify-between gap-2 border-b border-border/60 px-4 py-3">
                  <span className="text-sm font-bold">Coupons &amp; Offers</span>
                  {!appliedCoupon && bestCouponSaving > 0 && (
                    <span className="text-xs font-semibold text-emerald-700">
                      Save up to {formatINR(bestCouponSaving)}
                    </span>
                  )}
                </div>

                {appliedCoupon ? (
                  <div className="flex items-center justify-between px-4 py-3">
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
                  <>
                    {availableCoupons.map((c) => (
                      <div
                        key={c.id}
                        className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-3"
                      >
                        <div className="min-w-0">
                          <p className="flex flex-wrap items-center gap-x-2 text-sm font-bold text-primary">
                            <Tag className="h-3.5 w-3.5 text-secondary" />
                            <span className="font-mono tracking-wide">{c.code}</span>
                            <span className="text-xs font-semibold text-secondary-foreground">
                              {c.discount_type === 'percentage'
                                ? `${c.discount_value}% OFF`
                                : `Extra ${formatINR(c.discount_value)} OFF`}
                            </span>
                          </p>
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">
                            {c.min_order_value > 0
                              ? `On minimum purchase of ${formatINR(c.min_order_value)}`
                              : 'No minimum order value'}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleApplyFromList(c)}
                          disabled={applyingFromList === c.code}
                          className="shrink-0 rounded-md border border-primary bg-background px-3.5 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary hover:text-primary-foreground disabled:opacity-60"
                        >
                          {applyingFromList === c.code ? 'Applying…' : 'Apply'}
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => setCouponPanelOpen((o) => !o)}
                      className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
                    >
                      <span className="text-sm font-medium">Have a coupon code?</span>
                      {couponPanelOpen ? (
                        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
                    </button>
                    {couponPanelOpen && (
                      <div className="flex flex-col gap-1.5 px-4 pb-3">
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
                    )}
                  </>
                )}
                {appliedCoupon && couponError && (
                  <p className="px-4 pb-3 text-xs text-destructive">{couponError}</p>
                )}

                {/* Gift card */}
                <div className="border-t border-border/60">
                  {appliedGiftCard ? (
                    <div className="flex items-center justify-between px-4 py-3">
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
                      className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
                    >
                      <span className="flex items-center gap-2 text-sm font-medium">
                        <Gift className="h-4 w-4 text-primary" /> Redeem gift card
                      </span>
                      {giftCardPanelOpen ? (
                        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
                    </button>
                  )}
                  {!appliedGiftCard && giftCardPanelOpen && (
                    <div className="flex flex-col gap-1.5 px-4 pb-3">
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
                  )}
                </div>
              </div>

              {/* You may also like (admin-configured bump product; hidden when off) */}
              <CartBump compact />

              {/* ---------- PRICE DETAILS ---------- */}
              <div ref={sectionRefs.price} className="rounded-xl border border-border/60 bg-card">
                <div className="px-4 pt-3.5 text-sm font-bold">Price Details ({count} item{count === 1 ? '' : 's'})</div>
                <div className="flex flex-col gap-2.5 p-4 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Total MRP</span>
                    <span>{formatINR(totalMrp)}</span>
                  </div>
                  {discountOnMrp > 0 && (
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Discount on MRP</span>
                      <span className="text-emerald-700">-{formatINR(discountOnMrp)}</span>
                    </div>
                  )}
                  {appliedCoupon && couponDiscount - recoveryDiscount > 0 && (
                    <div className="flex items-center justify-between text-secondary-foreground">
                      <span className="flex items-center gap-1.5">
                        <Tag className="h-3.5 w-3.5" /> Coupon ({appliedCoupon.code})
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
                  <div className="flex items-center justify-between font-serif text-base font-bold">
                    <span>Total Amount</span>
                    <span className="text-primary">{formatINR(finalTotal)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Shipping &amp; taxes calculated at checkout.</p>
                </div>
                {totalSavings > 0 && (
                  <p className="mx-3 mb-3 rounded-lg bg-emerald-100 px-3 py-2 text-center text-sm font-semibold text-emerald-800">
                    You&apos;re saving {formatINR(totalSavings)} on this order
                  </p>
                )}
              </div>

              <Link
                href="/cart"
                onClick={() => setCartOpen(false)}
                className="pb-1 text-center text-xs font-semibold text-primary underline-offset-2 hover:underline"
              >
                View full bag
              </Link>
            </div>

            {/* Sticky bottom bar */}
            <div className="border-t border-border/60 bg-card shadow-[0_-4px_14px_rgba(0,0,0,0.06)]">
              {onlinePaymentSavings > 0 && (
                <div className="flex items-center gap-1.5 border-b border-emerald-200/70 bg-emerald-50 px-4 py-1.5 text-[11px] leading-snug text-emerald-700">
                  <Wallet className="h-3.5 w-3.5 shrink-0" />
                  <span>
                    Pay online &amp; get this at{' '}
                    <b>{formatINR(Math.max(0, finalTotal - onlinePaymentSavings))}</b> — extra{' '}
                    {formatINR(onlinePaymentSavings)} ({paymentDiscount.percent}%) off with{' '}
                    {paymentDiscount.label}, applied at checkout
                  </span>
                </div>
              )}
              <div className="flex items-center gap-3 px-4 py-3">
                <button
                  type="button"
                  onClick={() => scrollToSection('price')}
                  className="min-w-0 flex-1 text-left"
                >
                  <span className="flex items-baseline gap-1.5">
                    {totalMrp > finalTotal && (
                      <span className="text-xs text-muted-foreground line-through">{formatINR(totalMrp)}</span>
                    )}
                    <span className="font-serif text-lg font-bold text-primary">{formatINR(finalTotal)}</span>
                  </span>
                  <span className="text-[11px] font-semibold text-primary underline-offset-2 hover:underline">
                    View price details
                  </span>
                </button>
                <Button
                  asChild
                  className="h-11 flex-1 bg-primary text-base font-semibold"
                  onClick={() => {
                    setCartOpen(false);
                    clearBuyNow();
                    markCheckoutEntry();
                  }}
                >
                  <Link href="/checkout">Checkout</Link>
                </Button>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
