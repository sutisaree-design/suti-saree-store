'use client';

import { useEffect, useState } from 'react';
import { Tag, Gift, X, ChevronRight, ChevronDown, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { formatINR } from '@/lib/format';
import { fetchProductPageCoupons, Coupon } from '@/lib/coupons-api';

// Same "apply a coupon / gift card" experience as /checkout, but for an
// order that's ALREADY placed and waiting to be paid online (COD orders
// converted via Admin > Request Online Payment, or an abandoned online
// checkout). Every number shown here comes back from
// /api/orders/[id]/apply-discount, which recomputes and saves the order's
// totals server-side -- nothing here is trusted client math, it's just
// reflecting what the server just confirmed.
export default function ResumeDiscountSection({
  orderId,
  subtotal,
  shippingCharge,
  loyaltyDiscount,
  initial,
}: {
  orderId: string;
  subtotal: number;
  shippingCharge: number;
  loyaltyDiscount?: number;
  initial: {
    couponCode: string | null;
    couponDiscount: number;
    giftCardCode: string | null;
    giftCardDiscount: number;
    onlinePaymentDiscount: number;
    gstAmount: number;
    totalAmount: number;
  };
}) {
  const [couponCode, setCouponCode] = useState(initial.couponCode);
  const [couponDiscount, setCouponDiscount] = useState(initial.couponDiscount);
  const [giftCardCode, setGiftCardCode] = useState(initial.giftCardCode);
  const [giftCardDiscount, setGiftCardDiscount] = useState(initial.giftCardDiscount);
  const [onlinePaymentDiscount, setOnlinePaymentDiscount] = useState(initial.onlinePaymentDiscount);
  const [gstAmount, setGstAmount] = useState(initial.gstAmount);
  const [totalAmount, setTotalAmount] = useState(initial.totalAmount);

  const [couponPanelOpen, setCouponPanelOpen] = useState(false);
  const [couponInput, setCouponInput] = useState('');
  const [couponError, setCouponError] = useState<string | null>(null);
  const [applyingCoupon, setApplyingCoupon] = useState(false);
  const [removingCoupon, setRemovingCoupon] = useState(false);
  const [availableCoupons, setAvailableCoupons] = useState<Coupon[]>([]);

  const [giftCardPanelOpen, setGiftCardPanelOpen] = useState(false);
  const [giftCardInput, setGiftCardInput] = useState('');
  const [giftCardError, setGiftCardError] = useState<string | null>(null);
  const [applyingGiftCard, setApplyingGiftCard] = useState(false);
  const [removingGiftCard, setRemovingGiftCard] = useState(false);

  useEffect(() => {
    if (couponCode) return; // nothing to suggest once one is already applied
    let cancelled = false;
    fetchProductPageCoupons()
      .then((c) => {
        if (!cancelled) setAvailableCoupons(c);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [couponCode]);

  async function callApi(body: Record<string, unknown>) {
    const res = await fetch(`/api/orders/${orderId}/apply-discount`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Something went wrong');
    }
    return data;
  }

  const applyCoupon = async (code: string) => {
    setCouponError(null);
    setApplyingCoupon(true);
    try {
      const data = await callApi({ action: 'apply_coupon', code });
      setCouponCode(data.coupon_code);
      setCouponDiscount(data.coupon_discount);
      setOnlinePaymentDiscount(data.online_payment_discount);
      setGstAmount(data.gst_amount);
      setTotalAmount(data.total_amount);
      setCouponInput('');
      toast.success(`Coupon "${data.coupon_code}" applied`);
    } catch (err) {
      setCouponError(err instanceof Error ? err.message : 'Could not apply this coupon');
    } finally {
      setApplyingCoupon(false);
    }
  };

  const removeCoupon = async () => {
    setRemovingCoupon(true);
    try {
      const data = await callApi({ action: 'remove_coupon' });
      setCouponCode(null);
      setCouponDiscount(0);
      setOnlinePaymentDiscount(data.online_payment_discount);
      setGstAmount(data.gst_amount);
      setTotalAmount(data.total_amount);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not remove this coupon');
    } finally {
      setRemovingCoupon(false);
    }
  };

  const applyGiftCard = async () => {
    setGiftCardError(null);
    setApplyingGiftCard(true);
    try {
      const data = await callApi({ action: 'apply_giftcard', code: giftCardInput });
      setGiftCardCode(data.gift_card_code);
      setGiftCardDiscount(data.gift_card_discount);
      setOnlinePaymentDiscount(data.online_payment_discount);
      setGstAmount(data.gst_amount);
      setTotalAmount(data.total_amount);
      setGiftCardInput('');
      toast.success(`Gift card "${data.gift_card_code}" applied`);
    } catch (err) {
      setGiftCardError(err instanceof Error ? err.message : 'Could not apply this gift card');
    } finally {
      setApplyingGiftCard(false);
    }
  };

  const removeGiftCard = async () => {
    setRemovingGiftCard(true);
    try {
      const data = await callApi({ action: 'remove_giftcard' });
      setGiftCardCode(null);
      setGiftCardDiscount(0);
      setOnlinePaymentDiscount(data.online_payment_discount);
      setGstAmount(data.gst_amount);
      setTotalAmount(data.total_amount);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not remove this gift card');
    } finally {
      setRemovingGiftCard(false);
    }
  };

  return (
    <div className="mt-6 space-y-4">
      {/* Coupon + gift card — same combined card as /checkout */}
      <div className="divide-y divide-border/60 rounded-lg border border-border/60">
        <div>
          {couponCode ? (
            <div className="flex items-center justify-between p-3 text-sm">
              <span className="flex items-center gap-1.5 font-medium text-secondary-foreground">
                <Tag className="h-3.5 w-3.5" /> {couponCode} applied
              </span>
              <button
                type="button"
                onClick={removeCoupon}
                disabled={removingCoupon}
                aria-label="Remove coupon"
                className="text-muted-foreground hover:text-destructive disabled:opacity-50"
              >
                {removingCoupon ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
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
              {availableCoupons.length > 0 && (
                <div className="flex items-center justify-between gap-3 bg-card px-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">
                      Save{' '}
                      {availableCoupons[0].discount_type === 'percentage'
                        ? `${availableCoupons[0].discount_value}%`
                        : formatINR(availableCoupons[0].discount_value)}{' '}
                      with &quot;{availableCoupons[0].code}&quot;
                    </p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {availableCoupons[0].min_order_value > 0
                        ? `On orders above ${formatINR(availableCoupons[0].min_order_value)}`
                        : 'No minimum order value'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => applyCoupon(availableCoupons[0].code)}
                    disabled={applyingCoupon}
                    className="shrink-0 rounded-md border border-secondary px-3.5 py-1.5 text-xs font-semibold text-secondary transition-colors hover:bg-secondary hover:text-secondary-foreground disabled:opacity-60"
                  >
                    {applyingCoupon ? 'Applying…' : 'Apply'}
                  </button>
                </div>
              )}
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
                  onClick={() => applyCoupon(couponInput)}
                >
                  {applyingCoupon ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Apply'}
                </Button>
              </div>
            </div>
          )}
          {couponError && <p className="px-3 pb-2 text-xs text-destructive">{couponError}</p>}
        </div>

        <div>
          {giftCardCode ? (
            <div className="flex items-center justify-between p-3 text-sm">
              <span className="flex items-center gap-1.5 font-medium text-secondary-foreground">
                <Gift className="h-3.5 w-3.5" /> {giftCardCode} applied (-{formatINR(giftCardDiscount)})
              </span>
              <button
                type="button"
                onClick={removeGiftCard}
                disabled={removingGiftCard}
                aria-label="Remove gift card"
                className="text-muted-foreground hover:text-destructive disabled:opacity-50"
              >
                {removingGiftCard ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
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
          {!giftCardCode && giftCardPanelOpen && (
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
                    onClick={applyGiftCard}
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

      {/* Live price breakdown — same shape as the admin's own "Price breakdown" */}
      <div className="rounded-lg border border-border/60 bg-card p-4 text-sm">
        <div className="flex items-center justify-between text-muted-foreground">
          <span>Subtotal</span>
          <span>{formatINR(subtotal)}</span>
        </div>
        {couponDiscount > 0 && (
          <div className="mt-1.5 flex items-center justify-between text-green-700">
            <span>Coupon discount{couponCode ? ` (${couponCode})` : ''}</span>
            <span>-{formatINR(couponDiscount)}</span>
          </div>
        )}
        {giftCardDiscount > 0 && (
          <div className="mt-1.5 flex items-center justify-between text-green-700">
            <span>Gift card{giftCardCode ? ` (${giftCardCode})` : ''}</span>
            <span>-{formatINR(giftCardDiscount)}</span>
          </div>
        )}
        {!!loyaltyDiscount && loyaltyDiscount > 0 && (
          <div className="mt-1.5 flex items-center justify-between text-green-700">
            <span>Loyalty points</span>
            <span>-{formatINR(loyaltyDiscount)}</span>
          </div>
        )}
        <div className="mt-1.5 flex items-center justify-between text-muted-foreground">
          <span>Shipping</span>
          <span>{shippingCharge > 0 ? formatINR(shippingCharge) : 'Free'}</span>
        </div>
        <div className="mt-1.5 flex items-center justify-between text-muted-foreground">
          <span>Tax (GST, included)</span>
          <span>{formatINR(gstAmount)}</span>
        </div>
        {onlinePaymentDiscount > 0 && (
          <div className="mt-1.5 flex items-center justify-between text-green-700">
            <span>Online payment discount</span>
            <span>-{formatINR(onlinePaymentDiscount)}</span>
          </div>
        )}
        <div className="mt-2 flex items-center justify-between border-t border-border/60 pt-2 text-base font-bold">
          <span>Total</span>
          <span>{formatINR(totalAmount)}</span>
        </div>
      </div>

      {onlinePaymentDiscount > 0 && (
        <p className="rounded-md bg-green-50 px-3 py-2 text-center text-xs text-green-800">
          You&apos;re saving {formatINR(onlinePaymentDiscount)} by paying online instead of Cash on Delivery.
        </p>
      )}
    </div>
  );
}
