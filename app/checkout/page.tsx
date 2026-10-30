'use client';

import { useState, useEffect, useRef, FormEvent } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { toPublicMediaUrl } from '@/lib/media-url';
import NextScript from 'next/script';
import { useRouter } from 'next/navigation';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Lock, Loader2, CreditCard, Tag, X, Wallet, Sparkles, Gift, Store, Minus, Plus, ChevronRight, ChevronDown, BadgePercent, BadgeCheck, MapPin, Phone, Pencil } from 'lucide-react';
import {
  useCart,
  usePaymentDiscount,
  computeBogoDiscount,
  getVisibleBogoPromotion,
  formatBogoLabel,
} from '@/lib/cart-context';
import { useAuth } from '@/lib/auth-context';
import { formatINR } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { getSupabaseBrowser } from '@/lib/supabase-browser';
import { validateGiftCard, GiftCard } from '@/lib/giftcards-api';
import { computeCouponDiscount, fetchProductPageCoupons, Coupon } from '@/lib/coupons-api';
import { fetchAddresses } from '@/lib/addresses-api';
import { Address } from '@/lib/types';
import { joinResellerProgram, fetchMyResellerOverview } from '@/lib/reseller-api';
import { getStoredAffiliateCode, clearStoredAffiliateCode } from '@/lib/affiliate-api';
import { saveOrderAttribution } from '@/lib/attribution';
import {
  fetchLoyaltySettings,
  fetchMyLoyaltyBalance,
  DEFAULT_LOYALTY_SETTINGS,
  LoyaltySettings,
} from '@/lib/loyalty-api';
import {
  ShippingSettings,
  DEFAULT_SHIPPING_SETTINGS,
  fetchShippingSettings,
  checkPincodeServiceability,
  isValidPincode,
  PincodeResult,
} from '@/lib/pincode-api';
import { trackEvent, getSessionId } from '@/lib/track-api';
import { fireGtagEvent } from '@/lib/gtag-track';
import {
  CheckoutBumpSettings,
  DEFAULT_CHECKOUT_BUMP_SETTINGS,
  fetchCheckoutBumpSettings,
} from '@/lib/checkout-bump-api';
import { fetchProductById } from '@/lib/products-api';
import { decrementStockForOrder } from '@/lib/stock-api';
import { Product, CartItem } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import TrustBadges from '@/components/checkout/trust-badges';
import PaymentMethodSelector, { type CheckoutPaymentMethod } from '@/components/checkout/payment-method-selector';
import {
  fetchPartialPaySettings,
  computeAdvance,
  isPartialPayEligible,
  DEFAULT_PARTIAL_PAY_SETTINGS,
  type PartialPaySettings,
} from '@/lib/partial-pay';
import StickyOrderBar from '@/components/checkout/sticky-order-bar';
import { useForceMobileRepaint } from '@/hooks/use-force-mobile-repaint';
import { usePaymentGateway } from '@/hooks/use-payment-gateway';
import { payWithCashfree } from '@/lib/cashfree-client';
import { toast } from 'sonner';
import { computeCheckoutGst } from '@/lib/gst-report';

// All Indian states & union territories, for the Shipping Address "State"
// dropdown. Pincode auto-fill (via India Post's API) sets this field to
// whatever it returns — if that ever doesn't exactly match an entry here,
// we add it in on the fly (see the `stateOptions` list below) so the
// dropdown never silently loses/blanks out a real value.
const INDIAN_STATES = [
  'Andhra Pradesh',
  'Arunachal Pradesh',
  'Assam',
  'Bihar',
  'Chhattisgarh',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jharkhand',
  'Karnataka',
  'Kerala',
  'Madhya Pradesh',
  'Maharashtra',
  'Manipur',
  'Meghalaya',
  'Mizoram',
  'Nagaland',
  'Odisha',
  'Punjab',
  'Rajasthan',
  'Sikkim',
  'Tamil Nadu',
  'Telangana',
  'Tripura',
  'Uttar Pradesh',
  'Uttarakhand',
  'West Bengal',
  'Andaman and Nicobar Islands',
  'Chandigarh',
  'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi',
  'Jammu and Kashmir',
  'Ladakh',
  'Lakshadweep',
  'Puducherry',
];

declare global {
  interface Window {
    Razorpay: any;
  }
}

export default function CheckoutPage() {
  const router = useRouter();
  const {
    items: cartItems,
    subtotal: cartSubtotal,
    clearCart,
    addItem,
    removeItem,
    updateQuantity,
    appliedCoupon,
    couponDiscount: cartCouponDiscount,
    primaryCouponDiscount: cartPrimaryCouponDiscount,
    recoveryOffer: cartRecoveryOffer,
    recoveryDiscount: cartRecoveryDiscount,
    applyCoupon,
    removeCoupon,
    bogoDiscount: cartBogoDiscount,
    activePromotions,
    buyNowItem,
    updateBuyNowQuantity,
    clearBuyNow,
  } = useCart();
  const { paymentDiscount } = usePaymentDiscount();
  // Buy Now sends the shopper straight here with just the one item, kept
  // separate from whatever else is sitting in the persistent cart. Extra
  // add-ons picked up on this page (currently just the checkout bump) are
  // tracked locally here rather than going into the real cart.
  const isBuyNow = !!buyNowItem;
  const [buyNowExtras, setBuyNowExtras] = useState<CartItem[]>([]);
  const items = buyNowItem ? [buyNowItem, ...buyNowExtras] : cartItems;
  const subtotal = isBuyNow
    ? items.reduce((sum, i) => sum + i.product.price * i.quantity, 0)
    : cartSubtotal;
  // The abandoned-cart recovery offer only stacks on normal cart checkouts, not Buy Now.
  const recoveryOffer = isBuyNow ? null : cartRecoveryOffer;
  const recoveryDiscount = isBuyNow ? 0 : cartRecoveryDiscount;
  const couponDiscount = isBuyNow
    ? appliedCoupon && subtotal >= appliedCoupon.min_order_value
      ? computeCouponDiscount(appliedCoupon, subtotal, items.length)
      : 0
    : cartCouponDiscount;
  // Buy Now checks out with just buyNowItem (+ any local extras), not the persistent cart,
  // so — same as couponDiscount above — the BOGO discount has to be recomputed against that
  // item set rather than reused from cart context, which only tracks the real cart.
  const bogoDiscount = isBuyNow
    ? computeBogoDiscount(items, activePromotions)
    : cartBogoDiscount;
  const [placing, setPlacing] = useState(false);
  const [orderPlaced, setOrderPlaced] = useState(false);
  // Prepaid is pre-selected: it is the option the product page price ("Get this at ₹X via
  // online payment") refers to, so the customer never sees the price jump up at checkout.
  // COD stays one tap away and is never hidden.
  const [paymentMethod, setPaymentMethod] = useState<CheckoutPaymentMethod>('online');
  // Partial Pay (advance online, rest on delivery) -- switched on/off and sized in Admin > Settings.
  const [partialPaySettings, setPartialPaySettings] = useState<PartialPaySettings>(DEFAULT_PARTIAL_PAY_SETTINGS);
  useEffect(() => {
    fetchPartialPaySettings().then(setPartialPaySettings).catch(() => {});
  }, []);
  const { user } = useAuth();
  // Admin > Settings > Payment Gateways: which gateway (Razorpay / Cashfree) takes online payments, or none (COD only).
  const gateway = usePaymentGateway();
  const onlineAvailable = !gateway.loaded || gateway.active !== null;

  // Same real-device repaint bug as StickyOrderBar (see
  // hooks/use-force-mobile-repaint.ts): the Payment section's selected-card
  // highlight and the "Get ₹X off" line only change border/background
  // color, no layout shift, so once this section has been painted once,
  // iOS Safari / some Android WebViews cache that layer and only repaint it
  // on the next scroll or touch — not on the React re-render triggered by
  // tapping "Pay Online" / "Cash on Delivery". Desktop and DevTools mobile
  // emulation don't show this, which is why it can look fine while testing
  // and only show up for real phone users.
  const paymentSectionRef = useRef<HTMLDivElement>(null);
  const orderSummaryRef = useRef<HTMLDivElement>(null);

  // Saved addresses — lets a logged-in customer pick a previously saved
  // address instead of retyping it. Shipping fields are controlled so we
  // can fill them in programmatically when one is picked.
  const [savedAddresses, setSavedAddresses] = useState<Address[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string>('new');
  // When a logged-in customer has a saved/default address, we show a compact
  // read-only summary instead of the full editable form. "Change address"
  // flips this to true to reveal the picker + editable fields again.
  const [showAddressForm, setShowAddressForm] = useState(false);
  // "Choose Address" opens a dialog with a radio list of saved addresses,
  // a "+ New Address" option, and an "Edit" action for the highlighted one.
  const [showAddressPicker, setShowAddressPicker] = useState(false);
  const [pickerSelectedId, setPickerSelectedId] = useState<string>('new');
  // Guest / no-saved-address flow: contact + address fields live in a bottom
  // sheet (opened from the "Delivery details" card) instead of two long inline
  // sections -- no OTP or account needed.
  const [detailsSheetOpen, setDetailsSheetOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [shipPhone, setShipPhone] = useState('');
  const [addressLine1, setAddressLine1] = useState('');
  const [addressLine2, setAddressLine2] = useState('');
  const [landmark, setLandmark] = useState('');
  const [city, setCity] = useState('');
  const [stateName, setStateName] = useState('');
  const [pincode, setPincode] = useState('');
  const [country, setCountry] = useState('India');
  const [deliveryEstimate, setDeliveryEstimate] = useState<PincodeResult | null>(null);
  const [verifyingPincode, setVerifyingPincode] = useState(false);
  // Tracks whether the current city/state values were filled in by us (from
  // the pincode lookup) rather than typed by the shopper, so the auto-fill
  // effect below never clobbers something they entered by hand. Reset to
  // false the moment the shopper edits either field themselves.
  const cityAutoFilledRef = useRef(false);
  const stateAutoFilledRef = useRef(false);

  // Bug fix: clicking "Log In" / "Create Account" from the resell prompt used
  // to send the shopper to /login or /signup and back, which remounts this
  // page and wipes out whatever address they'd already typed. We snapshot the
  // in-progress form into sessionStorage right before navigating away, and
  // restore it here once they land back on /checkout — so guest or existing
  // customer, they never have to retype the address.
  const CHECKOUT_ADDRESS_DRAFT_KEY = 'aruhi_checkout_address_draft';
  // Tracks whether a draft was restored on this mount, so the saved-address
  // effect below (which normally auto-fills the customer's default address
  // once we know who they are) doesn't clobber it.
  const draftRestoredRef = useRef(false);
  // Remembers the order we just created via place_order_with_items() for
  // an online-payment attempt, so that if the customer closes/cancels the
  // Razorpay popup (or it fails) and clicks "Place Order" again without
  // changing anything, we resume paying for that SAME pending order
  // instead of calling place_order_with_items() again and creating a
  // second order row for what the customer experienced as one checkout.
  // Cleared automatically whenever the cart/address/total no longer
  // matches (a new `signature`), or once the order actually succeeds.
  const pendingOrderRef = useRef<{ id: string; signature: string } | null>(null);
  // See preserveExisting above — true unless the restored draft was saved
  // by the deliberate "Log in" link, in which case we let a saved address
  // apply on top of it once the account is known.
  const suppressSavedAddressAutoApplyRef = useRef(false);

  // preserveExisting=true means "never let a saved address silently
  // override this draft" (used for accidental-refresh protection and the
  // resale login flow, where we must keep exactly what the shopper typed).
  // preserveExisting=false means "this login was explicitly to fetch a
  // saved address" (our Contact Information "Log in" link) — in that case
  // we WANT the account's default address to apply once we know who they
  // are, instead of leaving the guest draft in place.
  const saveAddressDraft = (preserveExisting: boolean = true) => {
    if (typeof window === 'undefined') return;
    try {
      sessionStorage.setItem(
        CHECKOUT_ADDRESS_DRAFT_KEY,
        JSON.stringify({
          email,
          firstName,
          lastName,
          shipPhone,
          addressLine1,
          addressLine2,
          landmark,
          city,
          stateName,
          pincode,
          country,
          preserveExisting,
        })
      );
    } catch {
      // sessionStorage unavailable (e.g. private mode) — nothing we can do,
      // the shopper will just need to retype the address as before.
    }
  };

  const clearAddressDraft = () => {
    if (typeof window === 'undefined') return;
    try {
      sessionStorage.removeItem(CHECKOUT_ADDRESS_DRAFT_KEY);
    } catch {
      // ignore
    }
  };

  // Auto-save the in-progress address on every keystroke (not just before
  // navigating to login) so an accidental refresh/back-button/tab-close
  // doesn't wipe out what the shopper already typed — the mount effect
  // below restores it. Skipped while showing the compact saved-address
  // summary, since there's nothing being freshly typed in that view.
  useEffect(() => {
    if (showAddressForm === false && selectedAddressId !== 'new') return;
    const hasAnyInput =
      email || firstName || lastName || shipPhone || addressLine1 || addressLine2 || city || stateName || pincode;
    if (!hasAnyInput) return;
    saveAddressDraft();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email, firstName, lastName, shipPhone, addressLine1, addressLine2, city, stateName, pincode, country]);

  // Runs once on mount, before we know whether the shopper is logged in, so
  // it always wins over the saved-address auto-fill below.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = sessionStorage.getItem(CHECKOUT_ADDRESS_DRAFT_KEY);
      if (!raw) return;
      sessionStorage.removeItem(CHECKOUT_ADDRESS_DRAFT_KEY);
      const draft = JSON.parse(raw) as Partial<{
        email: string;
        firstName: string;
        lastName: string;
        shipPhone: string;
        addressLine1: string;
        addressLine2: string;
        landmark: string;
        city: string;
        stateName: string;
        pincode: string;
        country: string;
        preserveExisting: boolean;
      }>;
      // A draft with no preserveExisting field at all was written by an
      // older version of this page (before that flag existed) — rather
      // than guess, we discard it and let the shopper's account/session
      // resolve normally. Only ever matters for one draft, right after a
      // deploy, for a tab that was already mid-checkout.
      if (!('preserveExisting' in draft)) return;
      setEmail(draft.email || '');
      setFirstName(draft.firstName || '');
      setLastName(draft.lastName || '');
      setShipPhone(draft.shipPhone || '');
      setAddressLine1(draft.addressLine1 || '');
      setAddressLine2(draft.addressLine2 || '');
      setLandmark(draft.landmark || '');
      setCity(draft.city || '');
      setStateName(draft.stateName || '');
      setPincode(draft.pincode || '');
      setCountry(draft.country || 'India');
      setSelectedAddressId('new');
      setShowAddressForm(true);
      draftRestoredRef.current = true;
      suppressSavedAddressAutoApplyRef.current = draft.preserveExisting !== false;
    } catch {
      // Corrupt/unreadable draft — ignore and fall back to normal behaviour.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applySavedAddress = (addr: Address) => {
    const nameParts = (addr.full_name || '').trim().split(/\s+/);
    setFirstName(nameParts[0] || '');
    setLastName(nameParts.slice(1).join(' '));
    setShipPhone(addr.phone || '');
    setAddressLine1(addr.line1 || '');
    setAddressLine2(addr.line2 || '');
    // Saved addresses don't store a landmark, so clear any leftover value
    // from a previous manual entry rather than leaving it stuck on this
    // different address.
    setLandmark('');
    // These are the customer's own saved values, not a pincode-lookup guess
    // — mark them as "manual" so the pincode auto-fill effect doesn't
    // silently swap them out.
    cityAutoFilledRef.current = false;
    stateAutoFilledRef.current = false;
    setCity(addr.city || '');
    setStateName(addr.state || '');
    setPincode(addr.pincode || '');
    // A real saved address is now in place — any leftover guest draft from
    // earlier in this tab's session (e.g. typed before logging in) is now
    // stale and must not survive to confuse a later reload/remount.
    clearAddressDraft();
  };

  const handleSelectSavedAddress = (id: string) => {
    setSelectedAddressId(id);
    if (id === 'new') {
      setFirstName('');
      setLastName('');
      setShipPhone('');
      setAddressLine1('');
      setAddressLine2('');
      setLandmark('');
      setCity('');
      setStateName('');
      setPincode('');
      setShowAddressForm(true);
      return;
    }
    const addr = savedAddresses.find((a) => a.id === id);
    if (addr) {
      applySavedAddress(addr);
      setShowAddressForm(false);
    }
  };

  const openAddressPicker = () => {
    // If the shopper had tapped "Add a new address" (selection is 'new'),
    // start the picker on their default/first saved address instead so
    // "Select this address" works straight away.
    const fallback = savedAddresses.find((a) => a.is_default)?.id ?? savedAddresses[0]?.id ?? 'new';
    setPickerSelectedId(selectedAddressId === 'new' ? fallback : selectedAddressId);
    setDetailsSheetOpen(false); // never stack the picker on top of the sheet
    setShowAddressPicker(true);
  };

  const confirmPickerSelection = () => {
    handleSelectSavedAddress(pickerSelectedId);
    setShowAddressPicker(false);
    // Picking "+ Add a new address" should land on the empty form sheet.
    if (pickerSelectedId === 'new') setDetailsSheetOpen(true);
  };

  const editPickerSelection = () => {
    setSelectedAddressId(pickerSelectedId);
    if (pickerSelectedId === 'new') {
      setFirstName('');
      setLastName('');
      setShipPhone('');
      setAddressLine1('');
      setAddressLine2('');
      setLandmark('');
      setCity('');
      setStateName('');
      setPincode('');
    } else {
      const addr = savedAddresses.find((a) => a.id === pickerSelectedId);
      if (addr) applySavedAddress(addr);
    }
    setShowAddressForm(true);
    setShowAddressPicker(false);
    setDetailsSheetOpen(true); // edit happens in the delivery-details sheet
  };

  useEffect(() => {
    if (!user) {
      setSavedAddresses([]);
      return;
    }
    if (!draftRestoredRef.current) setEmail(user.email ?? '');
    fetchAddresses()
      .then((list) => {
        setSavedAddresses(list);
        // If we just restored an in-progress address draft that must be
        // preserved (resale login, or refresh/back-button recovery), keep
        // what the shopper typed instead of silently swapping in their
        // saved default address.
        if (suppressSavedAddressAutoApplyRef.current) return;
        const preferred = list.find((a) => a.is_default) || list[0];
        if (preferred) {
          setSelectedAddressId(preferred.id);
          applySavedAddress(preferred);
          // They either arrived fresh (no draft) or explicitly used the
          // "Log in" link to fetch this address — either way, show the
          // compact saved-address summary instead of the editable form.
          setShowAddressForm(false);
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Resale — lets a customer mark this checkout as an order they're
  // reselling to their own customer, at a price they set themselves.
  const [isResale, setIsResale] = useState(false);
  const [showResaleConfirm, setShowResaleConfirm] = useState(false);
  const [showResaleLoginPrompt, setShowResaleLoginPrompt] = useState(false);
  const [resaleSellingPrice, setResaleSellingPrice] = useState('');
  const [resaleBrandName, setResaleBrandName] = useState('');
  const [defaultMarkup, setDefaultMarkup] = useState(100);
  useEffect(() => {
    if (!user) return;
    fetchMyResellerOverview()
      .then((o) => {
        if (o.profile) setDefaultMarkup(o.profile.default_markup_amount);
      })
      .catch(() => {});
  }, [user]);

  const [couponInput, setCouponInput] = useState('');
  const [applyingCoupon, setApplyingCoupon] = useState(false);
  const [couponError, setCouponError] = useState<string | null>(null);
  // Same collapsed-pill teaser as the cart drawer / cart page — closed by
  // default, expands on tap to reveal the offer banner / manual entry.
  const [couponPanelOpen, setCouponPanelOpen] = useState(false);

  // Coupons the admin has flagged "Show on Product Page" (Admin > Coupons)
  // — same list already shown on product pages and in the cart drawer,
  // surfaced here too so a shopper who reaches checkout without ever
  // opening the drawer still sees offers they qualify for. Only fetched
  // while nothing is applied yet; once a coupon is active there's nothing
  // left to pick from.
  const [availableCoupons, setAvailableCoupons] = useState<Coupon[]>([]);
  const [applyingFromList, setApplyingFromList] = useState<string | null>(null);
  // Collapsed by default — the coupon banner shows just the single best
  // offer (fetchProductPageCoupons already sorts by discount_value desc),
  // and "View all coupons" expands to the full list + manual code entry.
  const [showAllCoupons, setShowAllCoupons] = useState(false);

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

  const [giftCardInput, setGiftCardInput] = useState('');
  const [applyingGiftCard, setApplyingGiftCard] = useState(false);
  const [giftCardError, setGiftCardError] = useState<string | null>(null);
  const [appliedGiftCard, setAppliedGiftCard] = useState<GiftCard | null>(null);
  const [giftCardDiscount, setGiftCardDiscount] = useState(0);
  const [giftCardPanelOpen, setGiftCardPanelOpen] = useState(false);

  const [shippingSettings, setShippingSettings] = useState<ShippingSettings>(
    DEFAULT_SHIPPING_SETTINGS
  );

  // Loyalty points — only relevant for logged-in customers.
  const [loyaltySettings, setLoyaltySettings] = useState<LoyaltySettings>(
    DEFAULT_LOYALTY_SETTINGS
  );
  const [pointsBalance, setPointsBalance] = useState(0);
  const [redeemPoints, setRedeemPoints] = useState(false);
  const [pointsToRedeem, setPointsToRedeem] = useState(0);

  // Abandoned-cart recovery: once the shopper has typed an email, ping the
  // tracking API (debounced) so we can email them later if they never finish.
  const [trackingEmail, setTrackingEmail] = useState('');
  useEffect(() => {
    if (!trackingEmail || !trackingEmail.includes('@') || items.length === 0) return;
    const timer = setTimeout(() => {
      fetch('/api/cart-track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: trackingEmail,
          // Sent as typed — /api/cart-track stores it as-is; the admin
          // panel's wa.me link normalizes it before building the URL.
          phone: shipPhone,
          items: items.map((i) => ({
            product_name: i.product.name,
            // Slug/image/colour so the admin panel's abandoned-cart list
            // and its "Send WhatsApp" recovery message can show exactly
            // what the shopper left behind — same fields used on the real
            // order payload above.
            slug: i.product.slug,
            image_url: i.product.images?.[0] ?? null,
            color: i.product.colors?.[0] ?? null,
            size: i.size,
            quantity: i.quantity,
            price: i.product.price,
          })),
          cartValue: subtotal,
        }),
      }).catch(() => {});
    }, 1500);
    return () => clearTimeout(timer);
    // Re-fires (debounced) when the phone number is filled in/edited too,
    // not just the email, so a late-typed phone still gets captured.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackingEmail, shipPhone, items, subtotal]);

  useEffect(() => {
    fetchShippingSettings().then(setShippingSettings).catch(() => {
      // fall back to defaults already set above
    });
  }, []);

  // Show the customer a real estimated delivery window for their own pincode
  // right on the checkout page, so shipping timing isn't a surprise after
  // they've already placed the order.
  useEffect(() => {
    if (!/^[1-9][0-9]{5}$/.test(pincode.trim())) {
      setDeliveryEstimate(null);
      setVerifyingPincode(false);
      return;
    }
    let cancelled = false;
    setVerifyingPincode(true);
    checkPincodeServiceability(pincode).then((res) => {
      if (cancelled) return;
      setDeliveryEstimate(res);
      setVerifyingPincode(false);
      // Auto-fill City & State from the pincode — free, via the same India
      // Post lookup (api.postalpincode.in) already used for the delivery
      // estimate above, no extra API/key needed. Only overwrite a field if
      // it's empty or still holds a value we auto-filled ourselves, so we
      // never stomp on something the shopper typed in by hand.
      if (res.serviceable && res.city && (!city || cityAutoFilledRef.current)) {
        setCity(res.city);
        cityAutoFilledRef.current = true;
      }
      if (res.serviceable && res.state && (!stateName || stateAutoFilledRef.current)) {
        setStateName(res.state);
        stateAutoFilledRef.current = true;
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pincode]);

  useEffect(() => {
    fetchLoyaltySettings().then(setLoyaltySettings).catch(() => {
      // fall back to defaults already set above
    });
    fetchMyLoyaltyBalance()
      .then((bal) => setPointsBalance(bal))
      .catch(() => setPointsBalance(0));
  }, []);

  // Checkout order bump — single admin-picked add-on product, independent
  // of whatever's already in the cart. Loaded once; if the customer already
  // has this exact product in cart, we don't show the bump for it again.
  const [bumpSettings, setBumpSettings] = useState<CheckoutBumpSettings>(
    DEFAULT_CHECKOUT_BUMP_SETTINGS
  );
  const [bumpProduct, setBumpProduct] = useState<Product | null>(null);
  const BUMP_SIZE = 'Free Size';

  useEffect(() => {
    fetchCheckoutBumpSettings()
      .then(async (s) => {
        setBumpSettings(s);
        if (s.enabled && s.product_id) {
          const p = await fetchProductById(s.product_id).catch(() => null);
          setBumpProduct(p);
        }
      })
      .catch(() => {});
  }, []);

  const bumpSize = bumpProduct?.sizes?.[0] || BUMP_SIZE;
  const bumpPrice = bumpProduct
    ? Math.round(bumpProduct.price * (1 - bumpSettings.discount_percent / 100))
    : 0;
  const bumpInCart = !!bumpProduct && items.some((i) => i.product.id === bumpProduct.id);

  const toggleBump = (checked: boolean) => {
    if (!bumpProduct) return;
    if (checked) {
      // Clone the product with the checkout-only bump price — cart totals,
      // the order summary and the final order_items row all read
      // item.product.price directly, so this is all that's needed.
      if (isBuyNow) {
        setBuyNowExtras((prev) => [
          ...prev,
          { product: { ...bumpProduct, price: bumpPrice }, size: bumpSize, quantity: 1, isBump: true },
        ]);
      } else {
        addItem({ ...bumpProduct, price: bumpPrice }, bumpSize, 1, { isBump: true });
      }
    } else {
      if (isBuyNow) {
        setBuyNowExtras((prev) => prev.filter((i) => i.product.id !== bumpProduct.id));
      } else {
        removeItem(bumpProduct.id, bumpSize, bumpProduct.colors?.[0] ?? null);
      }
    }
  };

  // Clears whichever mode produced this order — the single Buy Now item, or
  // the full persistent cart — without touching the other. Also drops the
  // in-progress address draft, so a completed order doesn't leave stale
  // address data sitting around for the shopper's next checkout.
  const clearOrderedItems = () => {
    if (isBuyNow) {
      clearBuyNow();
      setBuyNowExtras([]);
    } else {
      clearCart();
    }
    clearAddressDraft();
  };

  // +/- stepper in the order summary. Routes to whichever store actually
  // holds this line item: the Buy Now slot, a locally-tracked bump add-on,
  // or the real persistent cart.
  const changeItemQuantity = (item: CartItem, delta: number) => {
    const stock = item.product.stock_quantity ?? Infinity;
    const nextQty = Math.min(Math.max(1, item.quantity + delta), stock);
    if (nextQty === item.quantity) return;
    const itemColorKey = item.product.colors?.[0] ?? null;

    if (
      buyNowItem &&
      !item.isBump &&
      item.product.id === buyNowItem.product.id &&
      item.size === buyNowItem.size &&
      (buyNowItem.product.colors?.[0] ?? null) === itemColorKey
    ) {
      updateBuyNowQuantity(nextQty);
      return;
    }
    if (isBuyNow) {
      setBuyNowExtras((prev) =>
        prev.map((i) =>
          i.product.id === item.product.id &&
          i.size === item.size &&
          (i.product.colors?.[0] ?? null) === itemColorKey
            ? { ...i, quantity: nextQty }
            : i
        )
      );
      return;
    }
    updateQuantity(item.product.id, item.size, nextQty, itemColorKey);
  };

  // Log the funnel step once — used by Admin > Analytics for conversion rate.
  //
  // items comes from the cart context, which hydrates from localStorage in
  // its own effect *after* mount — so on first render items.length is 0
  // even when the cart genuinely has items. A [] dependency array here
  // would fire this exactly once, at that moment, and never again. We
  // depend on items.length instead (so it re-runs once hydration lands)
  // and guard with a ref so it still only actually fires once.
  const beginCheckoutFiredRef = useRef(false);
  useEffect(() => {
    if (items.length > 0 && !beginCheckoutFiredRef.current) {
      beginCheckoutFiredRef.current = true;
      // Fire one checkout_start event per cart item (each tagged with its
      // productId) instead of a single cart-level event, so Admin >
      // Analytics > Product Performance can show a per-product "Begin
      // checkout" count. The session-level funnel is unaffected — it only
      // checks whether *any* checkout_start event exists for the session,
      // so firing several here doesn't inflate that count.
      items.forEach((item) => {
        trackEvent('checkout_start', {
          productId: item.product.id,
          metadata: {
            itemCount: items.length,
            cartValue: subtotal,
            quantity: item.quantity ?? 1,
            // Which colour was actually in the cart at checkout, so Admin >
            // Analytics > Product Performance can break "Begin checkout"
            // down by colour variation too, matching add_to_cart/purchase.
            color: item.product.colors?.[0] ?? null,
          },
        });
      });
      // Fire GA4 / Google Ads begin_checkout event (retries if gtag.js
      // hasn't finished loading yet — see lib/gtag-track.ts)
      fireGtagEvent('begin_checkout', {
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

  const shipping =
    shippingSettings.free_shipping_threshold > 0 &&
    subtotal >= shippingSettings.free_shipping_threshold
      ? 0
      : shippingSettings.flat_rate;
  // Both a coupon and a BOGO promo can be active at once — same as the cart drawer, they're
  // subtracted independently here rather than one feeding off the other.
  const afterCouponSubtotal = Math.max(0, subtotal - couponDiscount - bogoDiscount);
  const clampedGiftCardDiscount = Math.min(giftCardDiscount, afterCouponSubtotal);
  const afterGiftCardSubtotal = Math.max(0, afterCouponSubtotal - clampedGiftCardDiscount);

  // Loyalty points can never discount more than what's left to pay after
  // the coupon and any gift card, and never more than the customer
  // actually has.
  const maxRedeemablePoints =
    loyaltySettings.redeem_value_per_point > 0
      ? Math.min(
          pointsBalance,
          Math.floor(afterGiftCardSubtotal / loyaltySettings.redeem_value_per_point)
        )
      : 0;
  const canRedeemPoints =
    loyaltySettings.enabled && pointsBalance >= loyaltySettings.min_redeem_points && maxRedeemablePoints > 0;
  const loyaltyDiscount =
    redeemPoints && canRedeemPoints
      ? Math.round(pointsToRedeem * loyaltySettings.redeem_value_per_point)
      : 0;

  const discountedSubtotal = Math.max(0, afterGiftCardSubtotal - loyaltyDiscount);
  // Extra incentive discount, only applied once the customer actually
  // chooses to pay online (never for COD) — computed on the merchandise
  // subtotal after coupon/gift card/loyalty, before shipping/tax.
  const onlinePaymentDiscount =
    paymentMethod === 'online' && paymentDiscount.enabled && paymentDiscount.percent > 0
      ? Math.round((discountedSubtotal * paymentDiscount.percent) / 100)
      : 0;
  // Same discount, computed regardless of which payment method is currently
  // selected — used to show the customer the actual rupee amount (not just
  // the percent) next to "Pay Online", even before they've picked it.
  const potentialOnlinePaymentDiscount =
    paymentDiscount.enabled && paymentDiscount.percent > 0
      ? Math.round((discountedSubtotal * paymentDiscount.percent) / 100)
      : 0;
  const subtotalAfterPaymentDiscount = Math.max(0, discountedSubtotal - onlinePaymentDiscount);
  // Prices are GST-inclusive: the tax is already baked into discountedSubtotal,
  // so we only extract it here for display/invoice purposes and do NOT add it
  // on top of the total again.
  // Each product carries its own GST rate (e.g. sarees 5%, garments above Rs 2,500 18%).
  // The server recomputes the same split on the order (orders_set_gst trigger), so this is
  // only the preview; items without a known rate fall back to the flat store rate.
  const tax = computeCheckoutGst(
    items.map((i) => ({ price: i.product.price, quantity: i.quantity, gstRate: i.product.gstRate })),
    subtotalAfterPaymentDiscount + clampedGiftCardDiscount + shipping,
    shippingSettings.gst_rate_percent
  );
  const total = subtotalAfterPaymentDiscount + shipping;

  const resaleSellingPriceNum = Math.max(0, Number(resaleSellingPrice) || 0);
  // What the reseller's own customer actually pays — the price the reseller
  // typed in themselves. This is what gets charged/COD'd and stored as the
  // order's total_amount when resale is on. Falls back to cost if they
  // haven't set a price yet (shouldn't normally happen — see validation below).
  const payableTotal = isResale && resaleSellingPriceNum > 0 ? resaleSellingPriceNum : total;
  const resaleProfit = payableTotal - total;

  // What the customer would pay under each payment option — shown side by
  // side in the Payment card so the price is never a surprise. For resale
  // orders the payable amount is the reseller's price either way.
  const codTotalDisplay = isResale ? payableTotal : discountedSubtotal + shipping;
  const onlineTotalDisplay = isResale
    ? payableTotal
    : Math.max(0, discountedSubtotal - potentialOnlinePaymentDiscount) + shipping;
  const onlineSavingsDisplay = isResale ? 0 : potentialOnlinePaymentDiscount;

  // Partial Pay is priced like COD (no online-payment discount) and never offered for resale orders.
  // The advance shown here is display-only: the server (orders_apply_partial_pay trigger) recomputes
  // it from the stored total and the admin setting, and Razorpay is charged that amount.
  const partialEligible = !isResale && onlineAvailable && isPartialPayEligible(partialPaySettings, codTotalDisplay);
  const partialAmounts = computeAdvance(codTotalDisplay, partialPaySettings.percent);
  const partialOption = partialEligible
    ? {
        title: partialPaySettings.label,
        percent: partialPaySettings.percent,
        advance: partialAmounts.advance,
        balance: partialAmounts.balance,
      }
    : null;
  // If the cart/settings change so Partial Pay no longer applies, fall back to full online payment.
  useEffect(() => {
    if (paymentMethod === 'partial' && !partialEligible) setPaymentMethod('online');
  }, [paymentMethod, partialEligible]);
  // All online gateways switched off by the admin -> only Cash on Delivery is possible.
  useEffect(() => {
    if (!onlineAvailable && paymentMethod !== 'cod') setPaymentMethod('cod');
  }, [onlineAvailable, paymentMethod]);

  // Repaint fix (see hooks/use-force-mobile-repaint.ts) — must sit here,
  // after payableTotal/total/onlinePaymentDiscount exist, not up near the
  // other useRef() calls.
  //
  // paymentSectionRef: the Payment card's selected-option highlight only
  // changes border/background color (no layout shift), so on a real phone
  // it can silently wait for the next scroll/tap to repaint.
  //
  // orderSummaryRef: the big Order Summary card is `sticky top-24` on ALL
  // screen sizes (not just desktop), so on a real phone its price line and
  // "Place Order (COD) / Pay ₹X" button label are exactly the kind of
  // stuck layer iOS Safari / some Android WebViews only repaint on
  // scroll/touch, not on the re-render triggered by tapping "Pay Online" /
  // "Cash on Delivery". This is almost certainly the one users notice.
  useForceMobileRepaint(paymentSectionRef, [paymentMethod]);
  useForceMobileRepaint(orderSummaryRef, [paymentMethod, payableTotal, onlinePaymentDiscount, total]);

  // Everything the customer is saving vs. sticker price, rolled into one
  // number for the sticky order bar up top: MRP markdown on each item, plus
  // every discount actually applied (coupon, BOGO, gift card, loyalty
  // points, online-payment incentive).
  const mrpSavings = items.reduce((sum, item) => {
    const mrp = item.product.mrp;
    if (!mrp || mrp <= item.product.price) return sum;
    return sum + (mrp - item.product.price) * item.quantity;
  }, 0);
  // Sum of each item's MRP (falling back to its selling price when it has
  // no MRP set) — the "struck-through" total shown above Subtotal in the
  // sticky order bar, so the customer sees exactly how the sticker price
  // came down to what they're actually paying.
  const mrpTotal = items.reduce((sum, item) => {
    const mrp = item.product.mrp && item.product.mrp > item.product.price ? item.product.mrp : item.product.price;
    return sum + mrp * item.quantity;
  }, 0);
  const totalSavings =
    couponDiscount +
    bogoDiscount +
    clampedGiftCardDiscount +
    loyaltyDiscount +
    onlinePaymentDiscount;
  const resalePriceTooLow = isResale && resaleSellingPriceNum > 0 && resaleSellingPriceNum < total;

  // Every individual discount that's actually active right now (coupon,
  // BOGO, gift card, loyalty points) rolled into one list — shown, with
  // amounts, inside the collapsible order-details tab so the customer can
  // see exactly where the savings came from without cluttering the top banner.
  const discountBreakdown: { label: string; amount: number }[] = [
    ...(couponDiscount > 0
      ? [
          ...(couponDiscount - recoveryDiscount > 0
            ? [{ label: `Coupon${appliedCoupon?.code ? ` (${appliedCoupon.code})` : ''}`, amount: couponDiscount - recoveryDiscount }]
            : []),
          ...(recoveryOffer && recoveryDiscount > 0
            ? [{ label: `Special offer (${recoveryOffer.code})`, amount: recoveryDiscount }]
            : []),
        ]
      : []),
    ...(bogoDiscount > 0 ? [{ label: 'BOGO offer applied', amount: bogoDiscount }] : []),
    ...(clampedGiftCardDiscount > 0
      ? [{ label: `Gift card${appliedGiftCard?.code ? ` (${appliedGiftCard.code})` : ''}`, amount: clampedGiftCardDiscount }]
      : []),
    ...(loyaltyDiscount > 0
      ? [{ label: `Points redeemed (${pointsToRedeem})`, amount: loyaltyDiscount }]
      : []),
  ];

  const handleResaleCheckboxChange = (checked: boolean) => {
    if (checked) {
      if (!user) {
        setShowResaleLoginPrompt(true);
        return;
      }
      setShowResaleConfirm(true);
    } else {
      setIsResale(false);
    }
  };

  const confirmResaleYes = () => {
    setIsResale(true);
    setShowResaleConfirm(false);
    setResaleSellingPrice((prev) => prev || String(total + defaultMarkup));
  };

  const confirmResaleNo = () => {
    setIsResale(false);
    setShowResaleConfirm(false);
  };

  const goToResaleLogin = () => {
    saveAddressDraft();
    setShowResaleLoginPrompt(false);
    router.push('/login?next=/checkout');
  };

  // Lets a guest who's mid-checkout decide to log in (e.g. to use a saved
  // address or loyalty points) without losing whatever they've already
  // typed if their account turns out to have no saved address — same
  // draft-save-and-restore trick as the resale login flow above, just
  // reachable directly from Contact Information. Unlike the resale flow,
  // this one explicitly wants their saved default address applied once
  // we know who they are, so we pass preserveExisting=false.
  const goToLoginFromCheckout = () => {
    saveAddressDraft(false);
    router.push('/login?next=/checkout');
  };

  const goToResaleSignup = () => {
    saveAddressDraft();
    setShowResaleLoginPrompt(false);
    router.push('/signup?next=/checkout');
  };

  const handleToggleRedeemPoints = (checked: boolean) => {
    setRedeemPoints(checked);
    if (checked) {
      setPointsToRedeem(maxRedeemablePoints);
    } else {
      setPointsToRedeem(0);
    }
  };

  const handleApplyCoupon = async () => {
    setCouponError(null);
    setApplyingCoupon(true);
    const result = await applyCoupon(couponInput, subtotal, items.length);
    setApplyingCoupon(false);
    if (!result.ok || !result.coupon) {
      setCouponError(result.error || 'Invalid coupon');
      return;
    }
    toast.success(`Coupon "${result.coupon.code}" applied`);
  };

  const handleApplyFromList = async (c: Coupon) => {
    setApplyingFromList(c.code);
    setCouponError(null);
    try {
      const result = await applyCoupon(c.code, subtotal, items.length);
      if (!result.ok || !result.coupon) {
        setCouponError(result.error || 'Could not apply this coupon');
      } else {
        toast.success(`Coupon "${result.coupon.code}" applied`);
      }
    } finally {
      setApplyingFromList(null);
    }
  };

  const handleRemoveCoupon = () => {
    removeCoupon();
    setCouponInput('');
    setCouponError(null);
  };

  const handleApplyGiftCard = async () => {
    setGiftCardError(null);
    setApplyingGiftCard(true);
    const result = await validateGiftCard(giftCardInput, afterCouponSubtotal);
    setApplyingGiftCard(false);
    if (!result.ok || !result.giftCard) {
      setGiftCardError(result.error || 'Invalid gift card code');
      return;
    }
    setAppliedGiftCard(result.giftCard);
    setGiftCardDiscount(result.redeemable || 0);
    toast.success(`Gift card "${result.giftCard.code}" applied`);
  };

  const handleRemoveGiftCard = () => {
    setAppliedGiftCard(null);
    setGiftCardDiscount(0);
    setGiftCardInput('');
    setGiftCardError(null);
  };

  const openRazorpayCheckout = (
    razorpayOrderId: string,
    keyId: string,
    internalOrderId: string,
    customerName: string,
    customerEmail: string,
    customerPhone: string
  ) => {
    return new Promise<void>((resolve, reject) => {
      const options = {
        key: keyId,
        order_id: razorpayOrderId,
        name: 'Sutisaree',
        description: 'Handwoven Ethnic Wear Purchase',
        image: 'https://images.pexels.com/photos/1191349/pexels-photo-1191349.jpeg?auto=compress&cs=tinysrgb&w=200',
        prefill: {
          name: customerName,
          email: customerEmail,
          contact: customerPhone,
        },
        theme: {
          color: '#7c3a1d',
        },
        handler: async (response: any) => {
          try {
            // SECURITY: verify-payment now performs the status: 'paid'
            // write itself (service-role client, after checking the
            // signature AND that this razorpay_order_id belongs to this
            // internalOrderId). The browser no longer writes to `orders`
            // directly — anon no longer has UPDATE rights on that table.
            const verifyRes = await fetch('/api/razorpay/verify-payment', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
                internalOrderId,
              }),
            });
            const verifyData = await verifyRes.json();
            if (!verifyRes.ok || !verifyData.verified) {
              throw new Error(verifyData.error || 'Signature verification failed');
            }

            resolve();
          } catch (err) {
            reject(err);
          }
        },
        modal: {
          ondismiss: () => {
            reject(new Error('Payment cancelled'));
          },
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.on('payment.failed', (resp: any) => {
        reject(new Error(resp.error?.description || 'Payment failed'));
      });
      rzp.open();
    });
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (items.length === 0) return;

    // The State field is a custom Radix <Select>, not a native <select>, so
    // it never gets a `required` attribute wired to it -- unlike City/PIN
    // code/Address (native <input required>), the browser's built-in
    // "please fill this field" validation silently does nothing for State.
    // Without this explicit check, an order can be placed with
    // shipping_address.state === "" (as happened for at least one real
    // order), which then breaks anything downstream that assumes state is
    // always present (shipping labels, state-wise reports, etc).
    // Guest details live in the bottom sheet (no native `required` there), so
    // make sure they're complete before anything else; reopen the sheet if not.
    if (!hasSavedAddressSummary) {
      const detailsError = validateDeliveryDetails();
      if (detailsError) {
        toast.error(detailsError);
        setDetailsSheetOpen(true);
        return;
      }
    }
    if (!stateName.trim()) {
      toast.error('Please select your state');
      return;
    }

    // Same class of bug as State above: Phone and PIN code are native
    // <input required>, so the browser blocks an EMPTY value -- but
    // `required` only checks presence, not shape. Nothing was checking
    // that the phone number is actually a 10-digit Indian mobile number or
    // that the PIN code is a real 6-digit PIN, so "123" or "abc" could
    // slip through the same way the blank State did. A bad phone number
    // means the courier/admin can't reach the customer, and a bad PIN
    // code means Delhivery will reject the shipment later at dispatch
    // time instead of catching it here where the shopper can still fix it.
    let phoneDigits = shipPhone.replace(/[^0-9]/g, '');
    if (phoneDigits.startsWith('91') && phoneDigits.length === 12) phoneDigits = phoneDigits.slice(2);
    if (phoneDigits.startsWith('0') && phoneDigits.length === 11) phoneDigits = phoneDigits.slice(1);
    if (!/^[6-9][0-9]{9}$/.test(phoneDigits)) {
      toast.error('Please enter a valid 10-digit phone number');
      return;
    }
    if (!isValidPincode(pincode)) {
      toast.error('Please enter a valid 6-digit PIN code');
      return;
    }

    // Format-valid isn't the same as REAL -- "411111" or a transposed
    // digit can look like a valid 6-digit PIN but not correspond to any
    // actual post office. Confirm existence against India Post's real
    // database before letting the order through (reuses the estimate
    // already fetched by the effect above when it matches the current
    // pincode, so this is usually instant with no extra network call).
    let pincodeCheck = deliveryEstimate;
    if (!pincodeCheck || pincodeCheck.pincode !== pincode.trim()) {
      setVerifyingPincode(true);
      pincodeCheck = await checkPincodeServiceability(pincode);
      setDeliveryEstimate(pincodeCheck);
      setVerifyingPincode(false);
    }
    if (pincodeCheck.verified === 'no') {
      toast.error("This PIN code doesn't exist. Please double-check it and try again.");
      return;
    }
    // verified === 'unknown' (India Post API was unreachable) -> don't
    // block; we simply couldn't confirm either way.

    const customerName = `${firstName} ${lastName}`.trim();
    // Normalize to lowercase/trimmed so this always matches the email a
    // customer later logs in with (Supabase Auth stores emails lowercase;
    // mobile keyboards/autofill can capitalize what a guest types here).
    const customerEmail = email.trim().toLowerCase();
    const customerPhone = shipPhone;
    const shippingAddress = {
      address: addressLine1,
      address2: addressLine2,
      landmark: landmark.trim() || undefined,
      city,
      state: stateName,
      pincode,
      country: country || 'India',
    };

    setPlacing(true);

    // Re-check the admin's gateway choice right now (the page may have been open for a while),
    // BEFORE an order row is created, so a switched-off gateway never leaves an orphan order.
    let activeGateway = gateway.active;
    if (paymentMethod === 'online' || paymentMethod === 'partial') {
      try {
        const gw = await fetch('/api/payment-gateways', { cache: 'no-store' }).then((r) => r.json());
        activeGateway = gw?.active ?? null;
      } catch {
        // keep the last known value
      }
      if (!activeGateway) {
        setPaymentMethod('cod');
        toast.error('Online payment is unavailable right now. Please choose Cash on Delivery.');
        setPlacing(false);
        return;
      }
    }

    try {
      // 1. Create internal order in Supabase with status 'pending'
      const orderItems = items.map((i) => ({
        product_id: i.product.id,
        product_name: i.product.name,
        // The exact colour-variant slug the shopper actually bought, so an
        // order-item link (admin, account, email) opens that same
        // variation instead of falling back to the product's default
        // colour. See the `slug: variant.slug` fix in product-detail.tsx.
        slug: i.product.slug,
        image_url: i.product.images?.[0] ?? null,
        color: i.product.colors?.[0] ?? null,
        size: i.size,
        quantity: i.quantity,
        price: i.product.price,
        // Same colour/size-matched id used in the Merchant Center feed's
        // <g:id> (see lib/gtag-track.ts's feedMatchedItemId). Carried through
        // to the order row so PurchaseTracker on the confirmation page can
        // report the *exact* feed item that was bought, keeping the
        // "purchase" event's item_id consistent with view_item/add_to_cart —
        // without this, Google Ads can't reliably match this event back to
        // the feed item for retail audiences / dynamic remarketing.
        feed_item_id: i.feedItemId ?? i.product.id,
      }));

      const {
        data: { user: loggedInUser },
      } = await getSupabaseBrowser().auth.getUser();

      if (isResale && !loggedInUser) {
        toast.error('Please log in to place a resale order');
        setPlacing(false);
        return;
      }

      if (isResale && (resaleSellingPriceNum <= 0 || resaleSellingPriceNum < total)) {
        toast.error(`Selling price must be at least ${formatINR(total)} (your cost)`);
        setPlacing(false);
        return;
      }

      // Identifies "is this literally the same order attempt as last time"
      // -- same items, address, total, and payment method. Used below to
      // decide whether to resume the still-pending order from a previous
      // attempt instead of creating a new one.
      const orderSignature = JSON.stringify({
        items: orderItems,
        total: payableTotal,
        address: shippingAddress,
        paymentMethod,
        email: customerEmail,
      });

      let internalOrderId: string;

      if (
        (paymentMethod === 'online' || paymentMethod === 'partial') &&
        pendingOrderRef.current &&
        pendingOrderRef.current.signature === orderSignature
      ) {
        // Same cart/address/total as the order we already created for the
        // previous attempt (e.g. the Razorpay popup was closed/cancelled,
        // or the payment failed) -- reuse it instead of calling
        // place_order_with_items() again. Previously every click here
        // created a brand-new order row even when it was really the same
        // checkout being retried, so one customer intent could end up as
        // two (or more) orders in Admin > Orders.
        internalOrderId = pendingOrderRef.current.id;
      } else {
        // If reselling, make sure this account has a reseller profile
        // (created silently on first resale checkout — same login, no
        // separate signup) so the order can be linked to it.
        let resellerId: string | null = null;
        if (isResale) {
          try {
            const resellerProfile = await joinResellerProgram(resaleProfit > 0 ? resaleProfit : defaultMarkup);
            resellerId = resellerProfile.id;
          } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to set up reseller account');
            setPlacing(false);
            return;
          }
        }

        // Phase 3A/3B: place_order_with_items() does the `orders` insert AND
        // the per-item `order_items` insert in one atomic transaction, plus
        // (for vendor-sourced products only) an atomic check+decrement of
        // vendor stock and a vendor_accept_deadline. This replaces what used
        // to be a raw `.from('orders').insert(...)` here — see the Phase 3A
        // migration's header comment for why. Non-vendor products are
        // completely unaffected (vendor_id is NULL for them, so the RPC
        // skips the vendor-stock check for those lines); the existing
        // decrementStockForOrder() call further below still separately
        // handles the legacy customer-facing stock_quantity display for
        // every product, vendor-sourced or not.
        const { data: newOrderId, error: orderError } = await supabase.rpc('place_order_with_items', {
          p_order: {
            user_id: loggedInUser?.id ?? null,
            items: orderItems,
            total_amount: payableTotal,
            status: 'pending',
            payment_method: paymentMethod,
            shipping_address: shippingAddress,
            customer_name: customerName,
            customer_email: customerEmail,
            customer_phone: customerPhone,
            session_id: getSessionId(),
            subtotal,
            shipping_charge: shipping,
            // Stored on the order for the invoice only — prices here are
            // GST-INCLUSIVE, so this must never be added on top of the
            // total. place_order_with_items() used to do exactly that,
            // inflating every order by the GST amount (~4.76% at 5%).
            gst_amount: tax,
            coupon_code: appliedCoupon?.code ?? null,
            // Abandoned-cart recovery offer, stacked on top of coupon_code. The server
            // (place_order_with_items) re-validates it and recomputes the amount itself.
            recovery_coupon_code: recoveryOffer && recoveryDiscount > 0 ? recoveryOffer.code : null,
            coupon_discount: couponDiscount,
            // Sent for parity/debugging only — place_order_with_items()
            // recomputes the BOGO discount itself from the `promotions`
            // table and the authoritative product prices (see the
            // 20261001000000 migration) and stores its own value, exactly
            // like it already does for the coupon. Before that migration
            // BOGO didn't exist server-side at all, so total_amount came
            // out HIGHER than the "Pay ₹X" shown here on any cart with a
            // live Buy-X-Get-Y promo — and that row's total is what
            // /api/razorpay/create-order actually charges.
            bogo_discount: bogoDiscount,
            gift_card_code: appliedGiftCard?.code ?? null,
            gift_card_discount: clampedGiftCardDiscount,
            loyalty_points_redeemed: loyaltyDiscount > 0 ? pointsToRedeem : 0,
            loyalty_discount: loyaltyDiscount,
            online_payment_discount: onlinePaymentDiscount,
            is_reseller_order: isResale,
            reseller_id: resellerId,
            reseller_margin_percent: isResale && total > 0 ? Number(((resaleProfit / total) * 100).toFixed(1)) : null,
            reseller_base_cost: isResale ? total : null,
            reseller_profit: isResale ? resaleProfit : null,
            reseller_brand_name: isResale ? resaleBrandName || null : null,
            // Affiliate referral — the RPC looks this code up server-side
            // against an APPROVED affiliate and computes the commission
            // itself (see place_order_with_items in
            // supabase/migrations/20260913000000_affiliate_program.sql);
            // we never trust or compute a commission amount here.
            affiliate_code: getStoredAffiliateCode(),
          },
          p_items: orderItems,
        });

        if (orderError) {
          // Log the full Postgrest error (code/details/hint), not just
          // message — the UI only ever showed a generic toast with no
          // trace in the console, so any RLS/permission/schema error
          // was completely invisible while debugging "Failed to place
          // order". Check the browser console for this on any future
          // failure.
          console.error('place_order_with_items failed:', orderError);
          if (orderError.message?.includes('INSUFFICIENT_STOCK')) {
            toast.error('Sorry, one of the items in your cart just sold out. Please update your cart and try again.');
            setPlacing(false);
            return;
          }
          if (orderError.message?.includes('PARTIAL_PAY_DISABLED') || orderError.message?.includes('PARTIAL_PAY_NOT_ELIGIBLE')) {
            toast.error('Partial payment is not available for this order. Please choose another payment method.');
            setPaymentMethod('online');
            setPlacing(false);
            return;
          }
          if (orderError.message?.includes('COD_BLOCKED_RETURN_RISK')) {
            toast.error(
              'Cash on Delivery is temporarily unavailable for this number due to past returns/RTOs. Please pay online to place this order.',
              { duration: 8000 }
            );
            setPlacing(false);
            return;
          }
          throw orderError;
        }
        internalOrderId = newOrderId as string;
        if (paymentMethod === 'online' || paymentMethod === 'partial') {
          pendingOrderRef.current = { id: internalOrderId, signature: orderSignature };
        }
      }
      // Order is placed (commission, if any, is already stamped on the
      // row by the RPC) — the referral has done its job, so drop it
      // rather than let it linger and get attributed to a later order.
      clearStoredAffiliateCode();

      // Remember which traffic source / device this order came from (shown in
      // Admin > Orders). Fire-and-forget: it can never block or fail checkout.
      saveOrderAttribution(internalOrderId);

      // 2. Cash on Delivery — no online payment step, order is confirmed as-is
      // and payment is collected at delivery time.
      if (paymentMethod === 'cod') {
        // NOTE: coupon.times_used is NOT incremented here. It's already
        // incremented once, atomically, inside place_order_with_items()
        // itself (see supabase/migrations/..._fix_gift_card_record_not_assigned.sql)
        // whenever the server independently re-validates and accepts the
        // coupon. Incrementing it again here double-counted every coupon
        // use (2 instead of 1), which silently halved every coupon's
        // effective usage_limit — and could increment it even when the
        // server had actually rejected/ignored the coupon (e.g. expired
        // between apply and place-order), since this used the client's
        // own `appliedCoupon` state rather than what the server accepted.
        setOrderPlaced(true);
        clearOrderedItems();
        decrementStockForOrder(orderItems).catch(() => {});
        trackEvent('purchase', {
          orderId: internalOrderId,
          userId: loggedInUser?.id ?? null,
          metadata: { total: payableTotal, itemCount: items.length, paymentMethod: 'cod', email: customerEmail },
        });
        // NOTE: GA4/Google Ads "purchase" conversion is intentionally NOT
        // fired here anymore — it was duplicating the event that
        // <PurchaseTracker /> already fires on the order-confirmation page
        // (which has proper sessionStorage dedupe). Firing it in both
        // places double-counted purchases/revenue in GA4 and Google Ads.
        toast.success('Order placed! Pay cash on delivery.');
        fetch('/api/order-confirm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId: internalOrderId }),
        }).catch(() => {});
        router.push(`/order-confirmation/${internalOrderId}`);
        return;
      }

      // 3. Take the online payment through whichever gateway the admin has switched on.
      if (activeGateway === 'cashfree') {
        // Cashfree: create order -> modal -> server-side verification (lib/cashfree-client.ts).
        try {
          await payWithCashfree(internalOrderId);
        } catch (cfErr) {
          if ((cfErr as { stage?: string })?.stage === 'create') {
            fetch('/api/razorpay/mark-failed', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ internalOrderId }),
            }).catch(() => {});
          }
          throw cfErr;
        }
      } else {
        // 3. Create Razorpay order via API route
        // SECURITY: amount is no longer sent from the client — create-order
        // looks up the authoritative total_amount from the `orders` row
        // itself using internalOrderId, so a tampered client can't change
        // what gets charged.
        const createOrderRes = await fetch('/api/razorpay/create-order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ internalOrderId }),
        });
        const createOrderData = await createOrderRes.json();
        if (!createOrderRes.ok) {
          // Mark order as failed (server-side — anon no longer has UPDATE
          // rights on `orders`).
          fetch('/api/razorpay/mark-failed', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ internalOrderId }),
          }).catch(() => {});
          throw new Error(createOrderData.error || 'Failed to create payment order');
        }

        // 4. Open Razorpay checkout popup
        await openRazorpayCheckout(
          createOrderData.order.id,
          createOrderData.keyId,
          internalOrderId,
          customerName,
          customerEmail,
          customerPhone
        );
      }

      // 5. Payment succeeded and verified.
      // NOTE: coupon.times_used is NOT incremented here — see the matching
      // note in the COD branch above. place_order_with_items() already
      // incremented it once, atomically, at order-creation time (a few
      // lines up), so doing it again here double-counted every coupon use.
      pendingOrderRef.current = null;
      setOrderPlaced(true);
      clearOrderedItems();
      decrementStockForOrder(orderItems).catch(() => {});
      trackEvent('purchase', {
        orderId: internalOrderId,
        userId: loggedInUser?.id ?? null,
        metadata: { total: payableTotal, itemCount: items.length, paymentMethod, email: customerEmail },
      });
      // NOTE: GA4/Google Ads "purchase" conversion is intentionally NOT
      // fired here anymore — see the matching note in the COD branch above.
      toast.success(
        paymentMethod === 'partial'
          ? `Advance paid! Order confirmed — pay the balance on delivery.`
          : 'Payment successful! Order confirmed.'
      );
      fetch('/api/order-confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: internalOrderId }),
      }).catch(() => {});
      router.push(`/order-confirmation/${internalOrderId}`);
      return;
    } catch (err) {
      // Always log the raw error so the real cause (Postgres/RLS error,
      // network failure, etc.) is visible in the browser console instead
      // of only ever seeing the generic "Failed to place order" toast.
      console.error('Order placement failed:', err);
      const message = err instanceof Error ? err.message : 'Failed to place order';
      if (message.includes('cancelled')) {
        toast.error('Payment was cancelled. Your order is saved as pending.');
      } else {
        toast.error(message);
      }
    } finally {
      setPlacing(false);
    }
  };

  if (orderPlaced) {
    return (
      <div className="container-boutique flex flex-col items-center gap-3 py-24 text-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Redirecting to your order confirmation…</p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="container-boutique flex flex-col items-center gap-5 py-24 text-center">
        <h1 className="font-serif text-2xl font-bold text-primary">
          Your cart is empty
        </h1>
        <p className="text-sm text-muted-foreground">
          Add items to your cart before checking out.
        </p>
        <Button asChild className="bg-primary">
          <Link href="/shop">Browse Collection</Link>
        </Button>
      </div>
    );
  }

  const detailsComplete = !!(
    firstName.trim() && email.trim() && shipPhone.trim() && addressLine1.trim() && city.trim() && stateName.trim() && pincode.trim()
  );

  // Native `required` can't see fields inside the bottom sheet (it renders in
  // a portal, outside <form>), so validate explicitly here and in onSubmit.
  const validateDeliveryDetails = (): string | null => {
    if (!firstName.trim()) return 'Please enter your first name';
    if (!lastName.trim()) return 'Please enter your last name';
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return 'Please enter a valid email address';
    let d = shipPhone.replace(/[^0-9]/g, '');
    if (d.startsWith('91') && d.length === 12) d = d.slice(2);
    if (d.startsWith('0') && d.length === 11) d = d.slice(1);
    if (!/^[6-9][0-9]{9}$/.test(d)) return 'Please enter a valid 10-digit phone number';
    if (!addressLine1.trim()) return 'Please enter your street address';
    if (!isValidPincode(pincode)) return 'Please enter a valid 6-digit PIN code';
    if (!city.trim()) return 'Please enter your city';
    if (!stateName.trim()) return 'Please select your state';
    return null;
  };

  const saveDeliveryDetails = () => {
    const err = validateDeliveryDetails();
    if (err) {
      toast.error(err);
      return;
    }
    setDetailsSheetOpen(false);
  };

  // Show a compact read-only summary (name, phone, email, address) instead
  // of the full form when the customer is logged in and has a saved
  // address selected. "Change address" (rendered on the right) reveals the
  // picker + editable fields again.
  const hasSavedAddressSummary =
    !!user && savedAddresses.length > 0 && !showAddressForm && selectedAddressId !== 'new';

  return (
    <div className="container-boutique py-8">
      {/* Loaded only here (not site-wide in app/layout.tsx) since only the
          checkout page ever opens the Razorpay popup — this used to load
          on every single page load across the whole site for no reason. */}
      {gateway.active === 'razorpay' && (
        <NextScript src="https://checkout.razorpay.com/v1/checkout.js" strategy="afterInteractive" />
      )}
      <h1 className="mb-2 font-serif text-3xl font-bold text-primary sm:text-4xl">
        Checkout
      </h1>

      {/* Top coupon banner — same offer shown lower down inside the Order
          Summary card, but surfaced here too so it's visible immediately
          on page load instead of only after scrolling past the whole
          address form (which is what used to happen on mobile, since the
          Order Summary card sits after the form in DOM order there).
          Stays visible after a coupon is applied too — it just switches
          to the "applied" state instead of disappearing. */}
      {appliedCoupon ? (
        <div className="mb-4 overflow-hidden rounded-lg border border-border/60">
          <div className="flex items-center justify-between gap-3 bg-card px-3 py-3">
            <span className="flex items-center gap-1.5 text-sm font-medium text-secondary-foreground">
              <BadgeCheck className="h-4 w-4 text-green-600" />
              &quot;{appliedCoupon.code}&quot; applied
            </span>
            <button
              type="button"
              onClick={handleRemoveCoupon}
              className="shrink-0 text-xs font-semibold text-muted-foreground hover:text-destructive"
            >
              Remove
            </button>
          </div>
          {availableCoupons.length > 1 && (
            <button
              type="button"
              onClick={() => setShowAllCoupons((v) => !v)}
              className="flex w-full items-center gap-0.5 border-t border-border/60 bg-card px-3 py-2 text-xs font-medium text-secondary hover:underline"
            >
              View all coupons <ChevronRight className="h-3 w-3" />
            </button>
          )}
        </div>
      ) : (
        (paymentDiscount.enabled && potentialOnlinePaymentDiscount > 0 || availableCoupons.length > 0 || totalSavings > 0) && (
          <div className="mb-4 overflow-hidden rounded-lg border border-border/60">
            {/* Single banner now doing both jobs: once any discount is
                actually applied (coupon, BOGO, gift card, loyalty points,
                or the online-payment discount) it shows the real combined
                total the customer is saving; before that, it falls back to
                nudging them toward the prepaid discount. Used to be two
                separate banners (a green "you're saving" one up top plus
                this one) — merged into one so only one shows at a time. */}
            {totalSavings > 0 ? (
              <div className="flex items-center justify-center gap-1.5 bg-primary px-3 py-1.5 text-center text-xs font-semibold text-primary-foreground">
                <BadgePercent className="h-3.5 w-3.5" />
                You're saving {formatINR(totalSavings)} on this order
              </div>
            ) : (
              paymentDiscount.enabled && potentialOnlinePaymentDiscount > 0 && (
                <div className="flex items-center justify-center gap-1.5 bg-primary px-3 py-1.5 text-center text-xs font-semibold text-primary-foreground">
                  <BadgePercent className="h-3.5 w-3.5" />
                  Upto {formatINR(potentialOnlinePaymentDiscount)} off on prepaid orders
                </div>
              )
            )}
            {availableCoupons.length > 0 && (
              <div className="flex items-center justify-between gap-3 bg-card px-3 py-3">
                <div className="flex min-w-0 items-start gap-2.5">
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary/15 text-secondary">
                    <Tag className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">
                      Save{' '}
                      {availableCoupons[0].discount_type === 'percentage'
                        ? `${availableCoupons[0].discount_value}%`
                        : formatINR(availableCoupons[0].discount_value)}{' '}
                      with &quot;{availableCoupons[0].code}&quot;
                    </p>
                    {availableCoupons.length > 1 ? (
                      <button
                        type="button"
                        onClick={() => setShowAllCoupons((v) => !v)}
                        className="mt-0.5 flex items-center gap-0.5 text-xs font-medium text-secondary hover:underline"
                      >
                        View all coupons <ChevronRight className="h-3 w-3" />
                      </button>
                    ) : (
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {availableCoupons[0].min_order_value > 0
                          ? `On orders above ${formatINR(availableCoupons[0].min_order_value)}`
                          : 'No minimum order value'}
                      </p>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleApplyFromList(availableCoupons[0])}
                  disabled={applyingFromList === availableCoupons[0].code}
                  className="shrink-0 rounded-md border border-secondary px-3.5 py-1.5 text-xs font-semibold text-secondary transition-colors hover:bg-secondary hover:text-secondary-foreground disabled:opacity-60"
                >
                  {applyingFromList === availableCoupons[0].code ? 'Applying…' : 'Apply'}
                </button>
              </div>
            )}
          </div>
        )
      )}

      <StickyOrderBar
        items={items}
        subtotal={subtotal}
        mrpTotal={subtotal + shipping}
        shipping={shipping}
        payableTotal={payableTotal}
        totalSavings={totalSavings}
        paymentMethod={paymentMethod}
        onlineDiscountAmount={potentialOnlinePaymentDiscount}
        discountBreakdown={discountBreakdown}
      />

      <Dialog open={showAddressPicker} onOpenChange={setShowAddressPicker}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Choose Delivery Address</DialogTitle>
          </DialogHeader>
          <RadioGroup value={pickerSelectedId} onValueChange={setPickerSelectedId} className="gap-3">
            {savedAddresses.map((addr) => (
              <label
                key={addr.id}
                htmlFor={`picker-${addr.id}`}
                className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm transition-colors ${
                  pickerSelectedId === addr.id
                    ? 'border-primary bg-primary/5'
                    : 'border-border/60 hover:border-primary/40'
                }`}
              >
                <RadioGroupItem value={addr.id} id={`picker-${addr.id}`} className="mt-0.5" />
                <div>
                  <p className="font-medium">
                    {addr.full_name}
                    {addr.is_default ? (
                      <span className="ml-2 rounded bg-secondary/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-secondary">
                        Default
                      </span>
                    ) : null}
                  </p>
                  <p className="text-xs text-muted-foreground">{addr.phone}</p>
                  <p className="text-xs text-muted-foreground">
                    {addr.line1}
                    {addr.line2 ? `, ${addr.line2}` : ''}, {addr.city}, {addr.state} -{' '}
                    {addr.pincode}
                  </p>
                </div>
              </label>
            ))}
            <label
              htmlFor="picker-new"
              className={`flex cursor-pointer items-center gap-3 rounded-md border p-3 text-sm transition-colors ${
                pickerSelectedId === 'new'
                  ? 'border-primary bg-primary/5'
                  : 'border-border/60 hover:border-primary/40'
              }`}
            >
              <RadioGroupItem value="new" id="picker-new" />
              <span className="font-medium text-primary">+ Add a new address</span>
            </label>
          </RadioGroup>
          <div className="mt-2 flex items-center justify-between gap-3">
            <Button type="button" variant="outline" onClick={editPickerSelection}>
              Edit
            </Button>
            <Button type="button" className="bg-primary" onClick={confirmPickerSelection}>
              Select this address
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <form onSubmit={onSubmit} className="grid gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {/* Login status — always shown, whether the saved-address summary
              or the editable guest form is what's displayed below it. */}
          <section
            className={`mb-4 flex items-center justify-between gap-3 rounded-lg border p-4 ${
              user ? 'border-green-200 bg-green-50' : 'border-border/60 bg-card'
            }`}
          >
            {user ? (
              <span className="text-sm font-medium text-green-700">
                ✓ Logged in as {user.email}
              </span>
            ) : (
              <>
                <span className="text-sm text-muted-foreground">
                  Checking out as a guest.
                </span>
                <button
                  type="button"
                  onClick={goToLoginFromCheckout}
                  className="shrink-0 text-sm font-medium text-secondary underline-offset-2 hover:underline"
                >
                  Already have an account? Log in
                </button>
              </>
            )}
          </section>

          {hasSavedAddressSummary ? (
            <section className="rounded-lg border border-border/60 bg-card p-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="font-serif text-lg font-bold text-primary">
                  Contact &amp; Shipping Address
                </h2>
                <button
                  type="button"
                  onClick={openAddressPicker}
                  className="shrink-0 rounded-md border border-secondary/60 px-3 py-1.5 text-sm font-medium text-secondary hover:bg-secondary/10"
                >
                  Choose Address
                </button>
              </div>
              <div className="space-y-1 text-sm">
                <p className="font-semibold text-foreground">
                  {firstName} {lastName}
                </p>
                <p className="text-muted-foreground">{shipPhone}</p>
                <p className="text-muted-foreground">{email}</p>
                <p className="text-muted-foreground">
                  {addressLine1}
                  {addressLine2 ? `, ${addressLine2}` : ''}
                  {landmark ? ` (Near ${landmark})` : ''}, {city}, {stateName} - {pincode}
                  {country ? `, ${country}` : ''}
                </p>
              </div>
            </section>
          ) : (
            <>
              {/* Delivery details card -- tap to open the bottom sheet */}
              <section className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
                {detailsComplete ? (
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary/10 text-secondary">
                      <MapPin className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1 text-sm">
                      <p className="font-semibold text-foreground">
                        {firstName} {lastName}
                      </p>
                      <p className="mt-0.5 flex items-center gap-1 text-muted-foreground">
                        <Phone className="h-3 w-3" /> {shipPhone}
                      </p>
                      <p className="mt-1 text-muted-foreground">
                        {addressLine1}
                        {addressLine2 ? `, ${addressLine2}` : ''}
                        {landmark ? ` (Near ${landmark})` : ''}, {city}, {stateName} - {pincode}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => setDetailsSheetOpen(true)}
                        className="flex items-center gap-1 text-sm font-medium text-secondary hover:underline"
                      >
                        <Pencil className="h-3.5 w-3.5" /> Edit
                      </button>
                      {user && savedAddresses.length > 0 && (
                        <button
                          type="button"
                          onClick={openAddressPicker}
                          className="text-xs font-medium text-muted-foreground hover:text-secondary hover:underline"
                        >
                          Choose address
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setDetailsSheetOpen(true)}
                    className="flex w-full items-center gap-3 rounded-xl border border-dashed border-secondary/50 p-4 text-left transition-colors hover:bg-secondary/5"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary/10 text-secondary">
                      <MapPin className="h-5 w-5" />
                    </div>
                    <div className="flex-1">
                      <p className="font-serif text-base font-bold text-primary">Add delivery details</p>
                      <p className="text-xs text-muted-foreground">Name, phone &amp; address — no account or OTP needed</p>
                    </div>
                    <ChevronRight className="h-5 w-5 text-muted-foreground" />
                  </button>
                )}
                {!detailsComplete && user && savedAddresses.length > 0 && (
                  <button
                    type="button"
                    onClick={openAddressPicker}
                    className="mt-3 w-full rounded-xl border border-secondary/60 py-2.5 text-sm font-medium text-secondary hover:bg-secondary/10"
                  >
                    Choose from my saved addresses
                  </button>
                )}
              </section>

              <Sheet open={detailsSheetOpen} onOpenChange={setDetailsSheetOpen}>
                <SheetContent
                  side="bottom"
                  className="mx-auto flex max-h-[92vh] max-w-lg flex-col gap-0 rounded-t-3xl p-0"
                >
                  <SheetHeader className="border-b border-border/60 px-5 pb-4 pt-6 text-left">
                    <SheetTitle className="font-serif text-xl font-bold text-primary">Delivery details</SheetTitle>
                    <SheetDescription>Tell us where to send your handcrafted piece.</SheetDescription>
                    {user && savedAddresses.length > 0 && (
                      <button
                        type="button"
                        onClick={openAddressPicker}
                        className="self-start text-sm font-medium text-secondary underline-offset-2 hover:underline"
                      >
                        Choose from saved addresses
                      </button>
                    )}
                  </SheetHeader>
                  <div className="flex-1 overflow-y-auto px-5 py-5">
              {/* Contact */}
              <section>
                <h2 className="mb-4 font-serif text-lg font-bold text-primary">
                  Contact Information
                </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="firstName">First name *</Label>
                <Input
                  id="firstName"
                  name="firstName"
                  autoComplete="given-name"
                  required
                  placeholder="Aanya"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="lastName">Last name *</Label>
                <Input
                  id="lastName"
                  name="lastName"
                  autoComplete="family-name"
                  required
                  placeholder="Sharma"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="email">Email *</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  placeholder="aanya@example.com"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setTrackingEmail(e.target.value);
                  }}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="phone">Phone *</Label>
                <Input
                  id="phone"
                  name="phone"
                  type="tel"
                  autoComplete="tel"
                  required
                  placeholder="+91 98765 43210"
                  value={shipPhone}
                  onChange={(e) => setShipPhone(e.target.value)}
                />
              </div>
            </div>
          </section>

          {/* Shipping */}
          <section className="mt-7">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="font-serif text-lg font-bold text-primary">Shipping Address</h2>
            </div>
            <div className="grid gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="address">Street address *</Label>
                <Input
                  id="address"
                  name="address"
                  autoComplete="address-line1"
                  required
                  placeholder="12, MG Road, Apt 304"
                  value={addressLine1}
                  onChange={(e) => setAddressLine1(e.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="address2">Apartment, suite, etc. (optional)</Label>
                <Input
                  id="address2"
                  name="address2"
                  autoComplete="address-line2"
                  placeholder="Bandra West"
                  value={addressLine2}
                  onChange={(e) => setAddressLine2(e.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="landmark">Landmark (optional)</Label>
                <Input
                  id="landmark"
                  name="landmark"
                  placeholder="Near City Hospital / Opposite SBI Bank"
                  value={landmark}
                  onChange={(e) => setLandmark(e.target.value)}
                />
                <p className="text-[11px] text-muted-foreground">
                  Helps our delivery partner find your address faster.
                </p>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="pincode">PIN code *</Label>
                <Input
                  id="pincode"
                  name="pincode"
                  autoComplete="postal-code"
                  required
                  placeholder="400050"
                  inputMode="numeric"
                  value={pincode}
                  className={
                    deliveryEstimate?.pincode === pincode.trim() && deliveryEstimate.verified === 'no'
                      ? 'border-red-400 focus-visible:ring-red-400'
                      : undefined
                  }
                  onChange={(e) => {
                    // Typing a new pincode is a clear signal the shopper
                    // wants fresh City/State for THIS pincode — so let the
                    // lookup below overwrite both, even if City/State were
                    // holding an older value (from a saved draft or an
                    // earlier manual edit) that would otherwise block it.
                    cityAutoFilledRef.current = true;
                    stateAutoFilledRef.current = true;
                    setPincode(e.target.value);
                  }}
                />
                {verifyingPincode && (
                  <p className="text-[11px] text-muted-foreground">Checking pincode…</p>
                )}
                {!verifyingPincode && deliveryEstimate?.pincode === pincode.trim() && (
                  <>
                    {deliveryEstimate.verified === 'yes' && (
                      <p className="text-[11px] font-medium text-emerald-600">
                        ✓ Verified: {deliveryEstimate.city}, {deliveryEstimate.state}
                      </p>
                    )}
                    {deliveryEstimate.verified === 'no' && (
                      <p className="text-[11px] font-medium text-red-600">
                        This PIN code doesn't seem to exist. Please double-check it.
                      </p>
                    )}
                  </>
                )}
                {deliveryEstimate?.serviceable && (city || stateName) && (
                  <p className="text-[11px] text-muted-foreground">
                    Auto-filled City/State below — you can edit if needed.
                  </p>
                )}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="city">City *</Label>
                  <Input
                    id="city"
                    name="city"
                    autoComplete="address-level2"
                    required
                    placeholder="Mumbai"
                    value={city}
                    onChange={(e) => {
                      // Shopper is typing city by hand — stop treating it as
                      // ours to overwrite on the next pincode lookup.
                      cityAutoFilledRef.current = false;
                      setCity(e.target.value);
                    }}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="state">State *</Label>
                  <Select
                    value={stateName || undefined}
                    onValueChange={(v) => {
                      stateAutoFilledRef.current = false;
                      setStateName(v);
                    }}
                  >
                    <SelectTrigger id="state">
                      <SelectValue placeholder="Select state" />
                    </SelectTrigger>
                    <SelectContent>
                      {/* If pincode auto-fill or a saved address ever returns
                          a state name that doesn't exactly match our list,
                          add it in so the real value is never lost/blanked. */}
                      {(INDIAN_STATES.includes(stateName) || !stateName
                        ? INDIAN_STATES
                        : [stateName, ...INDIAN_STATES]
                      ).map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="country">Country *</Label>
                <Select value={country || 'India'} onValueChange={setCountry}>
                  <SelectTrigger id="country">
                    <SelectValue placeholder="Select country" />
                  </SelectTrigger>
                  <SelectContent>
                    {/* Only India for now — more countries can be added here
                        later without changing how this field works. */}
                    <SelectItem value="India">India</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </section>
                  </div>
                  <div className="border-t border-border/60 bg-card px-5 pb-6 pt-4">
                    <Button type="button" className="w-full" size="lg" onClick={saveDeliveryDetails}>
                      Save &amp; continue
                    </Button>
                    <p className="mt-2 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
                      <Lock className="h-3 w-3" /> Your details are used only to deliver this order.
                    </p>
                  </div>
                </SheetContent>
              </Sheet>
            </>
          )}

          {/* Payment info */}
          <section
            ref={paymentSectionRef}
            style={{ transform: 'translateZ(0)', WebkitBackfaceVisibility: 'hidden', backfaceVisibility: 'hidden' }}
            className="mt-4 rounded-lg border border-border/60 bg-card p-3.5 sm:p-5"
          >
            <h2 className="mb-0.5 font-serif text-lg font-bold text-primary">Payment</h2>
            <p className="mb-2.5 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Lock className="h-3 w-3" /> Choose how you'd like to pay
            </p>

            <PaymentMethodSelector
              value={paymentMethod}
              onChange={setPaymentMethod}
              partial={partialOption}
              onlineAvailable={onlineAvailable}
              savings={onlineSavingsDisplay}
              onlineTotal={onlineTotalDisplay}
              codTotal={codTotalDisplay}
            />
          </section>
        </div>

        {/* Summary */}
        <aside className="lg:col-span-1">
          <div
            ref={orderSummaryRef}
            style={{ transform: 'translateZ(0)', WebkitBackfaceVisibility: 'hidden', backfaceVisibility: 'hidden' }}
            className="sticky top-24 rounded-lg border border-border/60 bg-card p-5"
          >
            <h2 className="font-serif text-lg font-bold text-primary">Order Summary</h2>
            <Separator className="my-4" />
            <ul className="flex max-h-72 flex-col gap-3 overflow-y-auto">
              {items.map((item) => {
                const isBumpItem = !!item.isBump;
                // Same "is this product currently on an active, badge-eligible
                // BOGO promotion" check the product card / product page / cart
                // use — so the offer badge stays consistent all the way
                // through to checkout for any item that actually qualifies.
                const itemBogoPromotion = getVisibleBogoPromotion(item.product.id, activePromotions);
                return (
                  <li
                    key={`${item.product.id}-${item.size}`}
                    className="flex gap-3"
                  >
                    <div className="relative h-16 w-14 shrink-0 overflow-hidden rounded-md bg-muted">
                      <Image
                        src={toPublicMediaUrl(item.product.images[0]) || 'https://placehold.co/56x64?text=No+Image'}
                        alt={`${item.product.name} - ${item.product.fabric} ${item.product.category}`}
                        fill
                        sizes="56px"
                        className="object-cover"
                      />
                      {isBumpItem && (
                        <span className="absolute -right-1 -top-1 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                          {item.quantity}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-1 flex-col justify-center gap-1">
                      <p className="line-clamp-1 text-xs font-medium">
                        {item.product.name}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        Size: {item.size}
                        {item.product.colors?.[0] ? ` · Color: ${item.product.colors[0]}` : ''}
                      </p>
                      {itemBogoPromotion && (
                        <Badge className="mt-0.5 w-fit border-transparent bg-secondary text-[10px] text-secondary-foreground shadow-sm hover:bg-secondary">
                          {formatBogoLabel(itemBogoPromotion)}
                        </Badge>
                      )}
                      {!isBumpItem && (
                        <div className="mt-0.5 flex items-center gap-2">
                          <button
                            type="button"
                            aria-label="Decrease quantity"
                            onClick={() => changeItemQuantity(item, -1)}
                            disabled={item.quantity <= 1}
                            className="flex h-5 w-5 items-center justify-center rounded border border-border/60 text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <Minus className="h-3 w-3" />
                          </button>
                          <span className="w-4 text-center text-xs font-semibold">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            aria-label="Increase quantity"
                            onClick={() => changeItemQuantity(item, 1)}
                            disabled={item.quantity >= (item.product.stock_quantity ?? Infinity)}
                            className="flex h-5 w-5 items-center justify-center rounded border border-border/60 text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                        </div>
                      )}
                    </div>
                    <span className="flex shrink-0 flex-col items-end self-center gap-0.5">
                      {item.product.mrp && item.product.mrp > item.product.price && (
                        <span className="text-[10px] text-muted-foreground line-through">
                          {formatINR(item.product.mrp * item.quantity)}
                        </span>
                      )}
                      <span className="text-xs font-semibold">
                        {formatINR(item.product.price * item.quantity)}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
            <Separator className="my-4" />

            {/* Coupon + Gift card — one combined card */}
            <div className="divide-y divide-border/60 rounded-lg border border-border/60">
              <div>
              {appliedCoupon ? (
                <div className="flex items-center justify-between p-3 text-sm">
                  <span className="flex items-center gap-1.5 font-medium text-secondary-foreground">
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
              ) : !couponPanelOpen ? (
                <button
                  type="button"
                  onClick={() => setCouponPanelOpen(true)}
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
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </button>
              ) : (
                <div className="overflow-hidden border-t border-border/60">
                  <div className="flex items-center justify-between px-3 pt-3">
                    <span className="flex items-center gap-1.5 text-sm font-semibold">
                      <Tag className="h-3.5 w-3.5 text-primary" /> Coupons
                    </span>
                    <button
                      type="button"
                      onClick={() => setCouponPanelOpen(false)}
                      aria-label="Collapse coupons"
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <ChevronDown className="h-4 w-4" />
                    </button>
                  </div>
                  {availableCoupons.length > 0 ? (
                    <div className="flex items-center justify-between gap-3 bg-card px-3 py-3">
                      <div className="flex min-w-0 items-start gap-2.5">
                        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary/15 text-secondary">
                          <Tag className="h-3.5 w-3.5" />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-foreground">
                            Save{' '}
                            {availableCoupons[0].discount_type === 'percentage'
                              ? `${availableCoupons[0].discount_value}%`
                              : formatINR(availableCoupons[0].discount_value)}{' '}
                            with &quot;{availableCoupons[0].code}&quot;
                          </p>
                          {availableCoupons.length > 1 ? (
                            <button
                              type="button"
                              onClick={() => setShowAllCoupons((v) => !v)}
                              className="mt-0.5 flex items-center gap-0.5 text-xs font-medium text-secondary hover:underline"
                            >
                              View all coupons <ChevronRight className="h-3 w-3" />
                            </button>
                          ) : (
                            <p className="mt-0.5 truncate text-xs text-muted-foreground">
                              {availableCoupons[0].min_order_value > 0
                                ? `On orders above ${formatINR(availableCoupons[0].min_order_value)}`
                                : 'No minimum order value'}
                            </p>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleApplyFromList(availableCoupons[0])}
                        disabled={applyingFromList === availableCoupons[0].code}
                        className="shrink-0 rounded-md border border-secondary px-3.5 py-1.5 text-xs font-semibold text-secondary transition-colors hover:bg-secondary hover:text-secondary-foreground disabled:opacity-60"
                      >
                        {applyingFromList === availableCoupons[0].code ? 'Applying…' : 'Apply'}
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-2 bg-card px-3 py-3">
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
                  )}
                </div>
              )}
              {couponError && <p className="mt-1.5 text-xs text-destructive">{couponError}</p>}
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
                        placeholder="Apply gift card code"
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

            {/* Expanded view: full coupon list + a manual-code fallback for
                private/referral codes that aren't in the "Show on Product
                Page" list. Only reachable via "View all coupons" above, and
                only while nothing is applied yet. */}
            {!appliedCoupon && couponPanelOpen && showAllCoupons && availableCoupons.length > 0 && (
              <div className="mt-3 flex flex-col gap-2 rounded-lg border border-border/60 bg-muted/30 p-3">
                <div className="flex items-center gap-1.5 text-sm font-semibold">
                  <Tag className="h-3.5 w-3.5 text-secondary" />
                  Available Coupons
                </div>
                {availableCoupons.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-dashed border-secondary/60 bg-secondary/10 px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm font-bold tracking-wide text-primary">{c.code}</span>
                        <span className="text-xs font-semibold text-secondary-foreground">
                          {c.discount_type === 'percentage' ? `${c.discount_value}% OFF` : `${formatINR(c.discount_value)} OFF`}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {c.min_order_value > 0 ? `On orders above ${formatINR(c.min_order_value)}` : 'No minimum order value'}
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
                <div className="mt-1 flex gap-2 border-t border-border/60 pt-2.5">
                  <Input
                    placeholder="Have a different code?"
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
              </div>
            )}

            {/* Loyalty points redeem */}
            {loyaltySettings.enabled && pointsBalance > 0 && (
              <>
                <Separator className="my-4" />
                <div className="rounded-md bg-muted/40 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-1.5 text-sm font-medium">
                      <Sparkles className="h-3.5 w-3.5 text-secondary" />
                      Use reward points
                    </span>
                    <Switch
                      checked={redeemPoints}
                      disabled={!canRedeemPoints}
                      onCheckedChange={handleToggleRedeemPoints}
                    />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {canRedeemPoints
                      ? `You have ${pointsBalance} points (worth ${formatINR(
                          Math.round(pointsBalance * loyaltySettings.redeem_value_per_point)
                        )}).`
                      : `You have ${pointsBalance} points — minimum ${loyaltySettings.min_redeem_points} needed to redeem.`}
                  </p>
                  {redeemPoints && canRedeemPoints && (
                    <div className="mt-2 flex items-center gap-2">
                      <Input
                        type="number"
                        min={0}
                        max={maxRedeemablePoints}
                        value={pointsToRedeem}
                        onChange={(e) =>
                          setPointsToRedeem(
                            Math.max(0, Math.min(maxRedeemablePoints, Number(e.target.value) || 0))
                          )
                        }
                        className="h-9"
                      />
                      <span className="shrink-0 text-xs text-muted-foreground">
                        = -{formatINR(loyaltyDiscount)}
                      </span>
                    </div>
                  )}
                </div>
              </>
            )}

            <Separator className="my-4" />
            <div className="flex flex-col gap-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span>{formatINR(subtotal)}</span>
              </div>
              {couponDiscount - recoveryDiscount > 0 && (
                <div className="flex justify-between text-secondary-foreground">
                  <span>Coupon discount{appliedCoupon ? ` (${appliedCoupon.code})` : ''}</span>
                  <span>-{formatINR(couponDiscount - recoveryDiscount)}</span>
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
                  <span>BOGO offer applied</span>
                  <span>-{formatINR(bogoDiscount)}</span>
                </div>
              )}
              {clampedGiftCardDiscount > 0 && (
                <div className="flex justify-between text-secondary-foreground">
                  <span>Gift card ({appliedGiftCard?.code})</span>
                  <span>-{formatINR(clampedGiftCardDiscount)}</span>
                </div>
              )}
              {loyaltyDiscount > 0 && (
                <div className="flex justify-between text-secondary-foreground">
                  <span>Points redeemed ({pointsToRedeem})</span>
                  <span>-{formatINR(loyaltyDiscount)}</span>
                </div>
              )}
              {onlinePaymentDiscount > 0 && (
                <div className="flex justify-between text-green-700">
                  <span>Online payment discount</span>
                  <span>-{formatINR(onlinePaymentDiscount)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Shipping</span>
                <span>{shipping === 0 ? 'FREE' : formatINR(shipping)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  GST (included in price)
                </span>
                <span>{formatINR(tax)}</span>
              </div>
            </div>

            {bumpSettings.enabled && bumpProduct && !bumpInCart && (
              <div className="mt-4 rounded-lg border border-dashed border-primary/40 bg-primary/5 p-3">
                <p className="text-sm font-semibold text-primary">{bumpSettings.headline}</p>
                <label className="mt-2 flex cursor-pointer items-start gap-3">
                  <Checkbox
                    className="mt-1"
                    checked={bumpInCart}
                    onCheckedChange={(v) => toggleBump(v === true)}
                  />
                  <div className="relative h-14 w-12 shrink-0 overflow-hidden rounded-md bg-muted">
                    <Image
                      src={toPublicMediaUrl(bumpProduct.images[0]) || 'https://placehold.co/48x56?text=No+Image'}
                      alt={bumpProduct.name}
                      fill
                      sizes="48px"
                      className="object-cover"
                    />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium leading-tight">{bumpProduct.name}</p>
                    <p className="mt-0.5 text-sm">
                      <span className="font-semibold text-primary">{formatINR(bumpPrice)}</span>
                      {bumpSettings.discount_percent > 0 && (
                        <span className="ml-1.5 text-xs text-muted-foreground line-through">
                          {formatINR(bumpProduct.price)}
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {bumpSettings.subtext}
                    </p>
                  </div>
                </label>
              </div>
            )}

            <div className="mt-4 rounded-lg border border-dashed border-primary/40 bg-primary/5 p-3">
              <label className="flex cursor-pointer items-start gap-3">
                <Checkbox
                  className="mt-1"
                  checked={isResale}
                  onCheckedChange={(v) => handleResaleCheckboxChange(v === true)}
                />
                <div>
                  <p className="flex items-center gap-1.5 text-sm font-semibold text-primary">
                    <Store className="h-4 w-4" /> Resell this product
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Placing this order for your own customer? Set your selling price and
                    we&apos;ll ship directly to them.
                  </p>
                </div>
              </label>

              {isResale && (
                <div className="mt-3 space-y-3 border-t border-dashed border-primary/30 pt-3">
                  <div className="flex items-center justify-between rounded-md bg-white/60 px-3 py-2 text-xs">
                    <span className="text-muted-foreground">Your cost price</span>
                    <span className="font-semibold">{formatINR(total)}</span>
                  </div>
                  <div>
                    <Label htmlFor="resale-price" className="text-xs">
                      Selling price for your customer (₹)
                    </Label>
                    <Input
                      id="resale-price"
                      type="number"
                      min={total}
                      value={resaleSellingPrice}
                      onChange={(e) => setResaleSellingPrice(e.target.value)}
                      className="mt-1 h-9 max-w-[140px]"
                    />
                    {resalePriceTooLow && (
                      <p className="mt-1 text-[11px] text-destructive">
                        Must be at least {formatINR(total)} (your cost).
                      </p>
                    )}
                  </div>
                  <div>
                    <Label htmlFor="resale-brand" className="text-xs">
                      Brand name (optional)
                    </Label>
                    <Input
                      id="resale-brand"
                      value={resaleBrandName}
                      onChange={(e) => setResaleBrandName(e.target.value)}
                      placeholder="Shown on your invoice, if you have one"
                      className="mt-1 h-9"
                    />
                  </div>
                  <div className="flex items-center justify-between rounded-md bg-white/60 px-3 py-2">
                    <span className="text-xs text-muted-foreground">Your profit</span>
                    <span className="font-serif text-lg font-bold text-green-600">
                      +{formatINR(Math.max(0, resaleProfit))}
                    </span>
                  </div>
                </div>
              )}
            </div>

            <AlertDialog open={showResaleLoginPrompt} onOpenChange={setShowResaleLoginPrompt}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Log in to resell this product</AlertDialogTitle>
                  <AlertDialogDescription>
                    Reselling needs an account so we can track your orders and profit for you.
                    Log in, or create a free account if you don&apos;t have one yet — your cart
                    will still be here.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel type="button" onClick={() => setShowResaleLoginPrompt(false)}>
                    Cancel
                  </AlertDialogCancel>
                  <AlertDialogAction
                    type="button"
                    onClick={goToResaleSignup}
                    className="bg-secondary text-secondary-foreground hover:bg-secondary/90"
                  >
                    Create Account
                  </AlertDialogAction>
                  <AlertDialogAction type="button" onClick={goToResaleLogin}>
                    Log In
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <AlertDialog open={showResaleConfirm} onOpenChange={setShowResaleConfirm}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Mark this as a resale order?</AlertDialogTitle>
                  <AlertDialogDescription>
                    We&apos;ll ship directly to the customer you enter below. You&apos;ll set the
                    price your customer pays and we&apos;ll show your profit.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel type="button" onClick={confirmResaleNo}>
                    No
                  </AlertDialogCancel>
                  <AlertDialogAction type="button" onClick={confirmResaleYes}>
                    Yes
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            {deliveryEstimate?.serviceable && (
              <p className="mt-3 text-xs text-muted-foreground">
                📦 Estimated delivery in {deliveryEstimate.etaDays}-{deliveryEstimate.etaDays + 2} business days
                {deliveryEstimate.city ? ` to ${deliveryEstimate.city}, ${deliveryEstimate.state}` : ''}, dispatched from our Naihati, West Bengal facility.
              </p>
            )}
            <Separator className="my-4" />
            {paymentMethod === 'partial' && partialOption && (
              <div className="mb-3 space-y-1 rounded-lg border border-border/60 bg-muted/30 p-3 text-sm">
                <div className="flex items-center justify-between font-semibold text-primary">
                  <span>Pay now (advance {partialOption.percent}%)</span>
                  <span>{formatINR(partialOption.advance)}</span>
                </div>
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>Pay on delivery</span>
                  <span>{formatINR(partialOption.balance)}</span>
                </div>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="font-serif text-base font-semibold">Total</span>
              <span
                className={`font-serif text-xl font-bold ${isResale ? 'text-green-600' : 'text-primary'}`}
              >
                {formatINR(payableTotal)}
              </span>
            </div>
            <Button
              type="submit"
              size="lg"
              disabled={placing || resalePriceTooLow || (isResale && resaleSellingPriceNum <= 0)}
              className="mt-5 w-full bg-primary"
            >
              {placing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : paymentMethod === 'cod' ? (
                <>
                  <Wallet className="mr-2 h-4 w-4" />
                  Place Order (COD) — {formatINR(payableTotal)}
                </>
              ) : paymentMethod === 'partial' && partialOption ? (
                <>
                  <Lock className="mr-2 h-4 w-4" />
                  Pay advance — {formatINR(partialOption.advance)}
                </>
              ) : (
                <>
                  <Lock className="mr-2 h-4 w-4" />
                  Pay securely — {formatINR(payableTotal)}
                </>
              )}
            </Button>
            <p className="mt-3 text-center text-[11px] text-muted-foreground">
              By placing your order, you agree to our Terms & Privacy Policy.
            </p>
            <TrustBadges />
          </div>
        </aside>
      </form>
    </div>
  );
}
