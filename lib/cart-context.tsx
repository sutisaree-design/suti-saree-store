'use client';

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  useCallback,
} from 'react';
import { CartItem, Product, CategoryRow } from './types';
import { fetchProducts, fetchCategories } from './products-api';
import { validateCoupon, computeCouponDiscount, Coupon, CouponResult } from './coupons-api';
import { fetchActivePromotions, ActivePromotion } from './promotions-api';
import {
  fetchPaymentDiscountSettings,
  PaymentDiscountSettings,
  DEFAULT_PAYMENT_DISCOUNT_SETTINGS,
} from './settings-api';
import { toast } from 'sonner';

/* ---------------- Cart ---------------- */

interface CartState {
  items: CartItem[];
}

type CartAction =
  | { type: 'ADD'; product: Product; size: string; quantity?: number; maxStock?: number; isBump?: boolean; feedItemId?: string }
  | { type: 'REMOVE'; productId: string; size: string; color?: string | null }
  | { type: 'UPDATE_QTY'; productId: string; size: string; quantity: number; maxStock?: number; color?: string | null }
  | { type: 'CLEAR' }
  | { type: 'HYDRATE'; items: CartItem[] };

// Colour variants (e.g. a saree's Red / Blue / Green swatches) are separate
// products to the shopper but share the SAME base product.id — the product
// page just overlays the variant's colour/price/images on top of it (see
// the `product` useMemo in app/product/[slug]/product-detail.tsx). Matching
// cart lines by product.id + size alone, without colour, meant switching a
// colour swatch and buying/adding again looked like "the same line" to the
// cart: instead of a new line for the new colour, it bumped the OLD
// colour's quantity up by however many of the new one were just added. This
// pulls out the colour so every cart action below can key on it too.
const itemColor = (product: Product): string | null => product.colors?.[0] ?? null;
const sameLine = (
  item: CartItem,
  productId: string,
  size: string,
  color?: string | null
) =>
  item.product.id === productId &&
  item.size === size &&
  (color === undefined || itemColor(item.product) === color);

/* ---------------- BOGO promotions (Part 2a logic, wired into context state in Part 2b) --------- */
//
// computeBogoDiscount() is intentionally a standalone, side-effect-free function (no hooks,
// no context) so it can be unit-tested with plain arrays. It mirrors how
// computeCouponDiscount() in coupons-api.ts is also a pure function the reducer/useMemo just
// calls into. CartProvider below fetches the active promotions on mount and feeds them (plus
// the live cart items) into this function via a useMemo, the same way couponDiscount works.
//
// Algorithm: for each active promotion, take the qualifying cart units (all units of a
// product if scope='all', or only units of products in promotion.product_ids if
// scope='collection'), expand each line's quantity into individual priced units, sort them
// cheapest-first, and walk them in chunks of (buy_qty + get_qty). Only a FULL chunk qualifies
// (a partial trailing group doesn't get a free item) — the cheapest `get_qty` units in each
// full chunk get `free_item_discount_percent`% off. The result across all promotions is
// summed, same way couponDiscount and bogoDiscount will be summed against the subtotal.

// Whether `product` falls inside a promotion's scope — scope='all' means
// every product qualifies, scope='collection' means only products in that
// promotion's collection (promotion.product_ids, resolved server-side in
// fetchActivePromotions) do. Exported so Part 4b's product-card BOGO badge
// can reuse the exact same "is this product in scope" rule the cart uses
// to apply the discount, instead of a second, possibly-drifting copy of it.
export function isProductInPromotionScope(productId: string, promotion: ActivePromotion): boolean {
  if (promotion.scope === 'all') return true;
  if (promotion.scope === 'collection') {
    return (promotion.product_ids ?? []).includes(productId);
  }
  return false;
}

/** True if `product` currently qualifies for any active BOGO promotion —
 *  drives the "BOGO" badge on components/product-card.tsx (Part 4b). */
export function isProductInAnyActivePromotion(
  productId: string,
  activePromotions: ActivePromotion[]
): boolean {
  return activePromotions.some((promotion) => isProductInPromotionScope(productId, promotion));
}

/** Human label for a promotion's offer, e.g. "Buy 2 Get 1 Free" or
 *  "Buy 1 Get 1 50% off" -- shared by the product-card badge and the
 *  product-page badge so both always agree with what the cart applies. */
export function formatBogoLabel(promotion: Pick<ActivePromotion, 'buy_qty' | 'get_qty' | 'free_item_discount_percent'>): string {
  const discountLabel =
    promotion.free_item_discount_percent === 100 ? 'Free' : `${promotion.free_item_discount_percent}% off`;
  return `Buy ${promotion.buy_qty} Get ${promotion.get_qty} ${discountLabel}`;
}

/** The first active promotion `product` qualifies for whose target
 *  collection (or, for scope='all', always) has the "show BOGO badge"
 *  toggle on -- i.e. the one whose label the shop grid / product page
 *  should actually display. Returns null when the product isn't in any
 *  active promotion, or the only one(s) it qualifies for have their
 *  badge hidden (Admin > Collections > "Show Buy X Get Y badge"). */
export function getVisibleBogoPromotion(
  productId: string,
  activePromotions: ActivePromotion[]
): ActivePromotion | null {
  return (
    activePromotions.find(
      (promotion) => promotion.show_bogo_badge && isProductInPromotionScope(productId, promotion)
    ) ?? null
  );
}

function isQualifyingItem(item: CartItem, promotion: ActivePromotion): boolean {
  return isProductInPromotionScope(item.product.id, promotion);
}

/** Per-promotion snapshot of how close the current cart is to unlocking
 *  (another) free/discounted item -- powers the "Add 1 more to get 1
 *  FREE!" progress hint in the cart drawer. Only promotions with at least
 *  one qualifying unit already in the cart are returned, so an empty/
 *  unrelated cart shows nothing. */
export interface BogoCartProgress {
  promotion: ActivePromotion;
  /** Qualifying units currently in the cart (summed across matching lines). */
  qualifyingUnits: number;
  /** How many more qualifying units get the *next* free/discounted item
   *  unlocked. Always > 0 -- once a full group completes, this resets to
   *  a fresh groupSize for the next cycle. */
  unitsToNextFree: number;
  /** Free/discounted units already earned by items currently in the cart
   *  (i.e. how many full groups have already completed). */
  freeUnitsUnlocked: number;
}

export function getBogoCartProgress(
  items: CartItem[],
  activePromotions: ActivePromotion[]
): BogoCartProgress[] {
  const results: BogoCartProgress[] = [];
  for (const promotion of activePromotions) {
    const buyQty = Math.max(1, promotion.buy_qty || 1);
    const getQty = Math.max(1, promotion.get_qty || 1);
    const groupSize = buyQty + getQty;

    let qualifyingUnits = 0;
    for (const item of items) {
      if (isQualifyingItem(item, promotion)) qualifyingUnits += item.quantity;
    }
    if (qualifyingUnits === 0) continue;

    const completedGroups = Math.floor(qualifyingUnits / groupSize);
    const remainder = qualifyingUnits % groupSize;

    results.push({
      promotion,
      qualifyingUnits,
      unitsToNextFree: remainder === 0 ? groupSize : groupSize - remainder,
      freeUnitsUnlocked: completedGroups * getQty,
    });
  }
  return results;
}

export function computeBogoDiscount(items: CartItem[], activePromotions: ActivePromotion[]): number {
  if (items.length === 0 || activePromotions.length === 0) return 0;

  let total = 0;

  for (const promotion of activePromotions) {
    const buyQty = Math.max(1, promotion.buy_qty || 1);
    const getQty = Math.max(1, promotion.get_qty || 1);
    const groupSize = buyQty + getQty;
    const discountPct = Math.min(100, Math.max(0, promotion.free_item_discount_percent ?? 100));

    // Expand qualifying lines into one entry per unit, cheapest first.
    const units: number[] = [];
    for (const item of items) {
      if (!isQualifyingItem(item, promotion)) continue;
      for (let i = 0; i < item.quantity; i++) units.push(item.product.price);
    }
    units.sort((a, b) => a - b);

    for (let i = 0; i + groupSize <= units.length; i += groupSize) {
      const group = units.slice(i, i + groupSize);
      const freeUnits = group.slice(0, getQty); // cheapest `getQty` units in this full group
      const groupDiscount = freeUnits.reduce((sum, price) => sum + (price * discountPct) / 100, 0);
      total += groupDiscount;
    }
  }

  return Math.round(total);
}

function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case 'ADD': {
      const qty = action.quantity ?? 1;
      const cap = action.maxStock ?? Infinity;
      const color = itemColor(action.product);
      if (cap <= 0) return state;
      const existing = state.items.find((i) => sameLine(i, action.product.id, action.size, color));
      if (existing) {
        return {
          items: state.items.map((i) =>
            sameLine(i, action.product.id, action.size, color)
              ? {
                  ...i,
                  quantity: Math.min(i.quantity + qty, cap),
                  isBump: i.isBump || action.isBump,
                  // Backfill for lines added before this field existed
                  // (e.g. still sitting in someone's localStorage cart) —
                  // otherwise view_cart/begin_checkout would keep sending
                  // the un-matched base id for that line indefinitely.
                  feedItemId: i.feedItemId ?? action.feedItemId,
                }
              : i
          ),
        };
      }
      return {
        items: [
          ...state.items,
          {
            product: action.product,
            size: action.size,
            quantity: Math.min(qty, cap),
            isBump: action.isBump,
            feedItemId: action.feedItemId,
          },
        ],
      };
    }
    case 'REMOVE':
      return {
        items: state.items.filter(
          (i) => !sameLine(i, action.productId, action.size, action.color)
        ),
      };
    case 'UPDATE_QTY': {
      const cap = action.maxStock ?? Infinity;
      return {
        items: state.items
          .map((i) =>
            sameLine(i, action.productId, action.size, action.color)
              ? { ...i, quantity: Math.min(Math.max(0, action.quantity), cap) }
              : i
          )
          .filter((i) => i.quantity > 0),
      };
    }
    case 'CLEAR':
      return { items: [] };
    case 'HYDRATE':
      return { items: action.items };
    default:
      return state;
  }
}

interface CartContextValue {
  items: CartItem[];
  count: number;
  subtotal: number;
  addItem: (product: Product, size: string, quantity?: number, options?: { silent?: boolean; isBump?: boolean; feedItemId?: string }) => void;
  removeItem: (productId: string, size: string, color?: string | null) => void;
  updateQuantity: (productId: string, size: string, quantity: number, color?: string | null) => void;
  clearCart: () => void;
  isCartOpen: boolean;
  setCartOpen: (open: boolean) => void;
  /** Coupon currently applied to the cart, shared across cart drawer, cart page & checkout. */
  appliedCoupon: Coupon | null;
  /** Total rupee amount saved by coupons (applied coupon + recovery offer), recalculated live. */
  couponDiscount: number;
  applyCoupon: (code: string, overrideSubtotal?: number, overrideItemCount?: number) => Promise<CouponResult>;
  removeCoupon: () => void;
  /**
   * Tries a coupon on top of whatever is already applied. The store supports ONE coupon per order
   * (orders/invoices store a single coupon_code), so instead of blindly replacing the current
   * coupon this keeps whichever of the two saves the customer more money.
   */
  applyCouponIfBetter: (code: string) => Promise<ApplyIfBetterResult>;
  /** Abandoned-cart "recovery offer" (from an email / WhatsApp link). Unlike a normal coupon it is
   *  stacked ON TOP of whatever coupon is already applied, and computed on the amount left after it. */
  recoveryOffer: Coupon | null;
  /** Rupee amount the recovery offer takes off (0 when none / not eligible). Already included in couponDiscount. */
  recoveryDiscount: number;
  /** Discount from the normal applied coupon only (couponDiscount minus recoveryDiscount). */
  primaryCouponDiscount: number;
  removeRecoveryOffer: () => void;
  /** Currently-active BOGO promotions, fetched once on mount — exposed so pages that need to
   * recompute the discount against a different item set (e.g. checkout's Buy Now flow) can call
   * computeBogoDiscount() themselves instead of refetching. */
  activePromotions: ActivePromotion[];
  /** Rupee amount saved by auto-applied BOGO promotions, recalculated live against the current
   * cart items — same "always live, never a frozen number" approach as couponDiscount. */
  bogoDiscount: number;
  /** Single-item "Buy Now" checkout — set when the customer taps Buy Now on
   * a product page, kept separate from the persistent cart so it doesn't
   * pull in whatever else is already sitting in the cart. Checkout reads
   * this (when present) instead of the full cart's items. */
  buyNowItem: CartItem | null;
  startBuyNow: (product: Product, size: string, quantity?: number, feedItemId?: string) => void;
  updateBuyNowQuantity: (quantity: number) => void;
  clearBuyNow: () => void;
}

const CartContext = createContext<CartContextValue | undefined>(undefined);
const STORAGE_KEY = 'saaj-cart-v1';
const COUPON_STORAGE_KEY = 'saaj-cart-coupon-v1';
// Coupon code carried in by an abandoned-cart email / WhatsApp link (?coupon=CODE). Kept in
// localStorage until the cart has items to validate it against.
const PENDING_COUPON_KEY = 'saaj-pending-coupon-v1';
const RECOVERY_OFFER_STORAGE_KEY = 'saaj-recovery-offer-v1';
const PENDING_COUPON_MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;
const COUPON_PARAM_RE = /^[A-Za-z0-9_-]{2,40}$/;

export interface ApplyIfBetterResult {
  ok: boolean;
  error?: string;
  coupon?: Coupon;
  /** applied = nothing was applied before; replaced = new coupon beat the old one;
   *  kept = the existing coupon is better so it stays; same = that coupon is already applied. */
  outcome?: 'applied' | 'replaced' | 'kept' | 'same';
  discount?: number;
}

/** Remember a recovery-offer code (from /recover/CODE or ?offer=CODE links) so CartProvider auto-applies it. */
export function queuePendingCoupon(code: string | null | undefined) {
  try {
    const c = (code || '').trim();
    if (!COUPON_PARAM_RE.test(c)) return;
    localStorage.setItem(PENDING_COUPON_KEY, JSON.stringify({ code: c.toUpperCase(), ts: Date.now() }));
  } catch {
    // ignore
  }
}
const BUY_NOW_STORAGE_KEY = 'saaj-buy-now-v1';

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(cartReducer, { items: [] });
  const [isCartOpen, setCartOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [appliedCoupon, setAppliedCoupon] = useState<Coupon | null>(null);
  const [recoveryOffer, setRecoveryOffer] = useState<Coupon | null>(null);
  const [buyNowItem, setBuyNowItem] = useState<CartItem | null>(null);
  const [activePromotions, setActivePromotions] = useState<ActivePromotion[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as CartItem[];
        dispatch({ type: 'HYDRATE', items: Array.isArray(parsed) ? parsed.filter((i: CartItem) => (i?.quantity ?? 0) > 0) : parsed });
      }
      const rawCoupon = localStorage.getItem(COUPON_STORAGE_KEY);
      if (rawCoupon) {
        setAppliedCoupon(JSON.parse(rawCoupon) as Coupon);
      }
      const rawRecovery = localStorage.getItem(RECOVERY_OFFER_STORAGE_KEY);
      if (rawRecovery) {
        setRecoveryOffer(JSON.parse(rawRecovery) as Coupon);
      }
      // sessionStorage (not localStorage) — a Buy Now selection should only
      // survive the current tab/session, e.g. a checkout page refresh, not
      // linger around like the persistent cart does.
      const rawBuyNow = sessionStorage.getItem(BUY_NOW_STORAGE_KEY);
      if (rawBuyNow) {
        setBuyNowItem(JSON.parse(rawBuyNow) as CartItem);
      }
    } catch {
      // ignore
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.items));
    } catch {
      // ignore
    }
  }, [state.items, hydrated]);

  // Active BOGO promotions — fetched once on mount, same as the payment discount
  // settings fetch in PaymentDiscountProvider below. fetchActivePromotions() already
  // fails quiet (returns []) so a promotions outage never breaks the cart.
  useEffect(() => {
    fetchActivePromotions().then(setActivePromotions);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      if (appliedCoupon) {
        localStorage.setItem(COUPON_STORAGE_KEY, JSON.stringify(appliedCoupon));
      } else {
        localStorage.removeItem(COUPON_STORAGE_KEY);
      }
    } catch {
      // ignore
    }
  }, [appliedCoupon, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      if (recoveryOffer) {
        localStorage.setItem(RECOVERY_OFFER_STORAGE_KEY, JSON.stringify(recoveryOffer));
      } else {
        localStorage.removeItem(RECOVERY_OFFER_STORAGE_KEY);
      }
    } catch {
      // ignore
    }
  }, [recoveryOffer, hydrated]);

  const addItem = useCallback(
    (product: Product, size: string, quantity?: number, options?: { silent?: boolean; isBump?: boolean; feedItemId?: string }) => {
      const qty = quantity ?? 1;
      const stock = product.stock_quantity ?? Infinity;
      // Out-of-stock products can never be added (previously this showed a toast but
      // still created a 0-quantity / ₹0 line in the bag).
      if (stock <= 0 || product.inStock === false) {
        toast.error('This item is out of stock');
        return;
      }
      const existing = state.items.find((i) => sameLine(i, product.id, size, itemColor(product)));
      const desired = (existing?.quantity ?? 0) + qty;
      if (stock < Infinity && desired > stock) {
        toast.error(
          stock <= 0
            ? 'Out of stock'
            : `Only ${stock} unit${stock > 1 ? 's' : ''} in stock`
        );
      }
      dispatch({ type: 'ADD', product, size, quantity: qty, maxStock: stock, isBump: options?.isBump, feedItemId: options?.feedItemId });
      if (!options?.silent) {
        setCartOpen(true);
      }
    },
    [state.items]
  );
  const removeItem = useCallback((productId: string, size: string, color?: string | null) => {
    dispatch({ type: 'REMOVE', productId, size, color });
  }, []);
  const updateQuantity = useCallback(
    (productId: string, size: string, quantity: number, color?: string | null) => {
      const item = state.items.find((i) => sameLine(i, productId, size, color));
      const stock = item?.product.stock_quantity ?? Infinity;
      if (stock < Infinity && quantity > stock) {
        toast.error(`Only ${stock} unit${stock > 1 ? 's' : ''} in stock`);
      }
      dispatch({ type: 'UPDATE_QTY', productId, size, quantity, maxStock: stock, color });
    },
    [state.items]
  );
  const clearCart = useCallback(() => {
    dispatch({ type: 'CLEAR' });
    setAppliedCoupon(null);
    setRecoveryOffer(null);
  }, []);

  const count = useMemo(
    () => state.items.reduce((sum, i) => sum + i.quantity, 0),
    [state.items]
  );
  const subtotal = useMemo(
    () => state.items.reduce((sum, i) => sum + i.product.price * i.quantity, 0),
    [state.items]
  );

  // Recalculated live off the current subtotal and item count (not stored
  // as a frozen number) so it stays correct as items are added/removed
  // anywhere in the app — cart drawer, cart page, or checkout. Flat
  // coupons are priced per distinct product line, so adding/removing a
  // product updates the discount too, not just changing quantities.
  const primaryCouponDiscount = useMemo(() => {
    if (!appliedCoupon || subtotal <= 0) return 0;
    if (subtotal < appliedCoupon.min_order_value) return 0;
    return computeCouponDiscount(appliedCoupon, subtotal, state.items.length);
  }, [appliedCoupon, subtotal, state.items.length]);

  // Abandoned-cart recovery offer: stacked ON TOP of the normal coupon, priced on what is
  // left after it (same order the server uses in place_order_with_items()).
  const recoveryDiscount = useMemo(() => {
    if (!recoveryOffer || subtotal <= 0) return 0;
    if (subtotal < recoveryOffer.min_order_value) return 0;
    if (appliedCoupon && appliedCoupon.code.toUpperCase() === recoveryOffer.code.toUpperCase()) return 0;
    return computeCouponDiscount(recoveryOffer, Math.max(0, subtotal - primaryCouponDiscount), state.items.length);
  }, [recoveryOffer, appliedCoupon, subtotal, primaryCouponDiscount, state.items.length]);

  // Everything downstream (cart drawer, cart page, checkout totals) already subtracts
  // `couponDiscount`, so it now carries both discounts.
  const couponDiscount = primaryCouponDiscount + recoveryDiscount;

  // BOGO discount, recomputed live off the current cart items and active promotions —
  // same "always live, never a frozen number" reasoning as couponDiscount above. A coupon
  // and a BOGO promo can both be active at once; they're summed independently wherever the
  // total is calculated (cart drawer, checkout), never nested inside one another here.
  const bogoDiscount = useMemo(
    () => computeBogoDiscount(state.items, activePromotions),
    [state.items, activePromotions]
  );

  // A coupon that qualified when it was applied can stop qualifying later
  // purely because the cart changed — e.g. the item that met "orders above
  // ₹X" gets removed and a cheaper one takes its place. Without this, the
  // coupon stayed silently "applied" (still showing its badge/tag) even
  // though couponDiscount above had already dropped to ₹0 — it looked like
  // the coupon was still attached and working, but zero discount was
  // actually being applied. Auto-drop it the moment the cart falls below
  // its minimum, and say why, so it never looks stuck on a product it no
  // longer qualifies for.
  useEffect(() => {
    if (!appliedCoupon) return;
    if (subtotal > 0 && subtotal < appliedCoupon.min_order_value) {
      const code = appliedCoupon.code;
      const minOrder = appliedCoupon.min_order_value;
      setAppliedCoupon(null);
      toast.error(
        `"${code}" removed — your cart total dropped below the ₹${minOrder} minimum required for this coupon.`
      );
    }
  }, [appliedCoupon, subtotal]);

  const applyCoupon = useCallback(
    async (
      code: string,
      overrideSubtotal?: number,
      overrideItemCount?: number
    ): Promise<CouponResult> => {
      const effSubtotal = overrideSubtotal ?? subtotal;
      const effItemCount = overrideItemCount ?? state.items.length;
      const result = await validateCoupon(code, effSubtotal, effItemCount);
      if (result.ok && result.coupon) {
        setAppliedCoupon(result.coupon);
      }
      return result;
    },
    [subtotal, state.items.length]
  );

  const removeCoupon = useCallback(() => setAppliedCoupon(null), []);
  const removeRecoveryOffer = useCallback(() => setRecoveryOffer(null), []);

  const applyCouponIfBetter = useCallback(
    async (code: string): Promise<ApplyIfBetterResult> => {
      const result = await validateCoupon(code, subtotal, state.items.length);
      if (!result.ok || !result.coupon) return { ok: false, error: result.error || 'Invalid coupon code' };
      const next = result.coupon;
      const nextDiscount = result.discount ?? 0;
      if (appliedCoupon && appliedCoupon.code.toUpperCase() === next.code.toUpperCase()) {
        return { ok: true, coupon: appliedCoupon, outcome: 'same', discount: couponDiscount };
      }
      if (!appliedCoupon) {
        setAppliedCoupon(next);
        return { ok: true, coupon: next, outcome: 'applied', discount: nextDiscount };
      }
      if (nextDiscount > couponDiscount) {
        setAppliedCoupon(next);
        return { ok: true, coupon: next, outcome: 'replaced', discount: nextDiscount };
      }
      return { ok: true, coupon: appliedCoupon, outcome: 'kept', discount: couponDiscount };
    },
    [subtotal, state.items.length, appliedCoupon, couponDiscount]
  );

  // Pick up ?offer=CODE from the URL (abandoned-cart WhatsApp links land on
  // /cart-link/<id>?offer=CODE; emails use /recover/CODE) and queue it.
  useEffect(() => {
    if (!hydrated) return;
    try {
      const url = new URL(window.location.href);
      const c = url.searchParams.get('offer') || url.searchParams.get('coupon');
      if (c) {
        queuePendingCoupon(c);
        url.searchParams.delete('offer');
        url.searchParams.delete('coupon');
        window.history.replaceState(null, '', url.pathname + url.search + url.hash);
      }
    } catch {
      // ignore
    }
  }, [hydrated]);

  // Auto-apply the queued coupon as soon as the cart has items (min-order checks need a subtotal).
  const pendingBusyRef = useRef(false);
  const pendingNotifiedEmptyRef = useRef(false);
  useEffect(() => {
    if (!hydrated || pendingBusyRef.current) return;
    let pending: { code: string; ts: number } | null = null;
    try {
      const raw = localStorage.getItem(PENDING_COUPON_KEY);
      if (raw) pending = JSON.parse(raw);
    } catch {
      pending = null;
    }
    if (!pending || !pending.code) return;
    if (Date.now() - (pending.ts || 0) > PENDING_COUPON_MAX_AGE_MS) {
      try { localStorage.removeItem(PENDING_COUPON_KEY); } catch {}
      return;
    }
    if (subtotal <= 0) {
      if (!pendingNotifiedEmptyRef.current) {
        pendingNotifiedEmptyRef.current = true;
        toast.info(`Your special offer "${pending.code}" is saved for you — it will be added as soon as you add an item to your cart.`);
      }
      return;
    }
    pendingBusyRef.current = true;
    const code = pending.code;
    (async () => {
      try {
        const r = await validateCoupon(code, subtotal, state.items.length);
        try { localStorage.removeItem(PENDING_COUPON_KEY); } catch {}
        if (!r.ok || !r.coupon) {
          toast.error(`Sorry, we couldn't add your offer "${code}": ${r.error}`);
        } else if (appliedCoupon && appliedCoupon.code.toUpperCase() === r.coupon.code.toUpperCase()) {
          toast.info(`"${r.coupon.code}" is already applied to your cart.`);
        } else {
          setRecoveryOffer(r.coupon);
          toast.success(`Thank you for coming back! Your special offer "${r.coupon.code}" has been added.`);
        }
      } finally {
        pendingBusyRef.current = false;
      }
    })();
  }, [hydrated, subtotal, state.items.length, appliedCoupon]);

  const startBuyNow = useCallback(
    (product: Product, size: string, quantity?: number, feedItemId?: string) => {
      const qty = quantity ?? 1;
      const item: CartItem = { product, size, quantity: qty, feedItemId };
      setBuyNowItem(item);
      try {
        sessionStorage.setItem(BUY_NOW_STORAGE_KEY, JSON.stringify(item));
      } catch {
        // ignore
      }
    },
    []
  );

  const clearBuyNow = useCallback(() => {
    setBuyNowItem(null);
    try {
      sessionStorage.removeItem(BUY_NOW_STORAGE_KEY);
    } catch {
      // ignore
    }
  }, []);

  const updateBuyNowQuantity = useCallback((quantity: number) => {
    setBuyNowItem((prev) => {
      if (!prev) return prev;
      const stock = prev.product.stock_quantity ?? Infinity;
      const next = { ...prev, quantity: Math.min(Math.max(1, quantity), stock) };
      try {
        sessionStorage.setItem(BUY_NOW_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  const value: CartContextValue = {
    items: state.items,
    count,
    subtotal,
    addItem,
    removeItem,
    updateQuantity,
    clearCart,
    isCartOpen,
    setCartOpen,
    appliedCoupon,
    couponDiscount,
    applyCoupon,
    removeCoupon,
    applyCouponIfBetter,
    recoveryOffer,
    recoveryDiscount,
    primaryCouponDiscount,
    removeRecoveryOffer,
    activePromotions,
    bogoDiscount,
    buyNowItem,
    startBuyNow,
    updateBuyNowQuantity,
    clearBuyNow,
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}

/* ---------------- Categories (light, root-safe) ---------------- */
//
// Split out of ProductsProvider so pages that only need the category list
// (header nav, vendor "choose a category" forms, admin categories panel)
// never have to pull in the full product catalog just to render a dropdown.
// Cheap enough to sit at the root layout for every page.

interface CategoriesContextValue {
  categories: CategoryRow[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const CategoriesContext = createContext<CategoriesContextValue | undefined>(undefined);

export function CategoriesProvider({ children }: { children: React.ReactNode }) {
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const cats = await fetchCategories();
      setCategories(cats);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load categories');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const value: CategoriesContextValue = { categories, loading, error, refresh };

  return (
    <CategoriesContext.Provider value={value}>{children}</CategoriesContext.Provider>
  );
}

export function useCategories() {
  const ctx = useContext(CategoriesContext);
  if (!ctx) throw new Error('useCategories must be used within CategoriesProvider');
  return ctx;
}

/* ---------------- Payment discount settings (light, root-safe) ---------------- */
//
// Split out of ProductsProvider — the cart drawer (mounted on every page) and
// checkout only ever needed this one setting, not the whole product catalog.

interface PaymentDiscountContextValue {
  /** Admin-configured "extra % off on online payment" incentive — shared by the
   * product page, cart drawer, and checkout so they never fall out of sync. */
  paymentDiscount: PaymentDiscountSettings;
}

const PaymentDiscountContext = createContext<PaymentDiscountContextValue | undefined>(
  undefined
);
const PAYMENT_DISCOUNT_CACHE_KEY = 'saaj-payment-discount-v1';

// Reads whatever was cached from the last successful fetch, synchronously,
// so the very first render already has real data instead of the "off"
// placeholder — that placeholder is what made the discount badge look like
// it was "delayed" until something else (e.g. a scroll) forced a re-render
// once the network call finally came back. Falls through safely on SSR
// (no window) and on any parse error.
const readCachedPaymentDiscount = (): PaymentDiscountSettings => {
  if (typeof window === 'undefined') return DEFAULT_PAYMENT_DISCOUNT_SETTINGS;
  try {
    const raw = localStorage.getItem(PAYMENT_DISCOUNT_CACHE_KEY);
    return raw ? (JSON.parse(raw) as PaymentDiscountSettings) : DEFAULT_PAYMENT_DISCOUNT_SETTINGS;
  } catch {
    return DEFAULT_PAYMENT_DISCOUNT_SETTINGS;
  }
};

export function PaymentDiscountProvider({
  children,
  initialValue,
}: {
  children: React.ReactNode;
  /** Server-fetched value passed down from app/layout.tsx (see there for
   *  why) — used as the very first state instead of the generic default,
   *  so there's nothing to "catch up" to on the client at all. Falls back
   *  to the localStorage cache, then the hardcoded default, only for the
   *  rare case this provider is mounted somewhere without it. */
  initialValue?: PaymentDiscountSettings;
}) {
  const [paymentDiscount, setPaymentDiscount] = useState<PaymentDiscountSettings>(
    () => initialValue ?? readCachedPaymentDiscount()
  );

  useEffect(() => {
    // Server already gave us a fresh value for this request — still worth
    // a background refresh (an admin could save a change between this
    // page's server render and the moment it's viewed), but no rush.
    fetchPaymentDiscountSettings()
      .then((settings) => {
        setPaymentDiscount(settings);
        try {
          localStorage.setItem(PAYMENT_DISCOUNT_CACHE_KEY, JSON.stringify(settings));
        } catch {
          // storage full/unavailable — cache is a nice-to-have, safe to skip
        }
      })
      .catch(() => {
        // keep whatever we already have (server value or cache) rather
        // than clobbering it with the generic default on a failed refresh
      });
  }, []);

  const value: PaymentDiscountContextValue = { paymentDiscount };

  return (
    <PaymentDiscountContext.Provider value={value}>
      {children}
    </PaymentDiscountContext.Provider>
  );
}

export function usePaymentDiscount() {
  const ctx = useContext(PaymentDiscountContext);
  if (!ctx) throw new Error('usePaymentDiscount must be used within PaymentDiscountProvider');
  return ctx;
}

/* ---------------- Products (Supabase-backed, heavy) ---------------- */
//
// This now only carries the full product catalog (with variants/images) —
// categories and paymentDiscount moved to the light providers above, so this
// only needs to be mounted on the pages that actually render/search the
// catalog (product page, home, /categories, admin), not the whole app.

interface ProductsContextValue {
  products: Product[];
  /** Re-exposed from CategoriesContext for convenience/back-compat — this
   * provider must be mounted inside a CategoriesProvider (true everywhere,
   * since CategoriesProvider sits at the root). It's not fetched here. */
  categories: CategoryRow[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  getBySlug: (slug: string) => Product | undefined;
  getById: (id: string) => Product | undefined;
}

const ProductsContext = createContext<ProductsContextValue | undefined>(undefined);

// ---------------------------------------------------------------------
// Egress saver: the full catalog (~100 kB) used to be re-downloaded from
// Supabase on EVERY product-page / categories-page view. Now it is kept in
// memory + sessionStorage for 10 minutes and shared between concurrent
// callers, so a shopper browsing 10 products downloads it once, not 10x.
// Cache is cleared automatically when the tab/session ends or after TTL.
// refresh() (used by admin screens) can force a fresh download.
// ---------------------------------------------------------------------
const PRODUCTS_CACHE_KEY = 'aruhi:products-catalog:v1';
const PRODUCTS_CACHE_TTL_MS = 10 * 60 * 1000;
let productsMemo: { data: Product[]; expiresAt: number } | null = null;
let productsInFlight: Promise<Product[]> | null = null;

export async function loadProductsCached(force = false): Promise<Product[]> {
  const now = Date.now();
  if (!force) {
    if (productsMemo && productsMemo.expiresAt > now) return productsMemo.data;
    if (typeof window !== 'undefined') {
      try {
        const raw = window.sessionStorage.getItem(PRODUCTS_CACHE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as { data: Product[]; expiresAt: number };
          if (parsed && Array.isArray(parsed.data) && parsed.expiresAt > now) {
            productsMemo = parsed;
            return parsed.data;
          }
        }
      } catch {
        /* sessionStorage unavailable or corrupt -- fall through to network */
      }
    }
    if (productsInFlight) return productsInFlight;
  }
  const promise = fetchProducts()
    .then((prods) => {
      const entry = { data: prods, expiresAt: Date.now() + PRODUCTS_CACHE_TTL_MS };
      productsMemo = entry;
      if (typeof window !== 'undefined') {
        try {
          window.sessionStorage.setItem(PRODUCTS_CACHE_KEY, JSON.stringify(entry));
        } catch {
          /* quota exceeded / private mode -- memory cache still works */
        }
      }
      return prods;
    })
    .finally(() => {
      if (productsInFlight === promise) productsInFlight = null;
    });
  productsInFlight = promise;
  return promise;
}

export function ProductsProvider({ children }: { children: React.ReactNode }) {
  const { categories } = useCategories();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const prods = await loadProductsCached(true);
      setProducts(prods);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load products');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // First load may use the shared cache; explicit refresh() always re-fetches.
    let cancelled = false;
    (async () => {
      try {
        const prods = await loadProductsCached(false);
        if (!cancelled) {
          setProducts(prods);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load products');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const getBySlug = useCallback(
    (slug: string) => products.find((p) => p.slug === slug),
    [products]
  );
  const getById = useCallback(
    (id: string) => products.find((p) => p.id === id),
    [products]
  );

  const value: ProductsContextValue = {
    products,
    categories,
    loading,
    error,
    refresh,
    getBySlug,
    getById,
  };

  return (
    <ProductsContext.Provider value={value}>{children}</ProductsContext.Provider>
  );
}

export function useProducts() {
  const ctx = useContext(ProductsContext);
  if (!ctx) throw new Error('useProducts must be used within ProductsProvider');
  return ctx;
}
