import Link from 'next/link';
import { AlertTriangle, CreditCard, ShieldCheck, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatINR } from '@/lib/format';

interface PaymentPendingBannerProps {
  orderId: string;
  totalAmount: number;
  originalPaymentMethod?: string | null;
  onlinePaymentDiscount?: number | null;
  /** Where this banner appears — affects the resume link source param */
  source?: 'track' | 'confirmation' | 'account';
}

/**
 * Eye-catching "payment pending" banner shown on the Track Order page,
 * Order Confirmation page, and My Orders list whenever the order status
 * is 'pending' and payment_method is not COD.
 *
 * Design goal: customer sees this banner and immediately understands
 * (a) there is something urgent to do, (b) what exactly to do, and
 * (c) their money is safe.
 */
export default function PaymentPendingBanner({
  orderId,
  totalAmount,
  originalPaymentMethod,
  onlinePaymentDiscount,
  source = 'track',
}: PaymentPendingBannerProps) {
  const wasConvertedFromCod = originalPaymentMethod === 'cod';
  const resumeHref = `/checkout/resume/${orderId}?src=${source}`;

  // Supabase returns integers — ensure numeric type before comparing.
  // Default 0 (column has NOT NULL DEFAULT 0) means no discount was set.
  const discountAmt = Number(onlinePaymentDiscount ?? 0);
  const hasDiscount = discountAmt > 0;

  return (
    <div className="relative overflow-hidden rounded-xl border-2 border-amber-400 bg-gradient-to-br from-amber-50 via-orange-50 to-amber-50 shadow-sm">
      {/* Accent top bar */}
      <div className="h-1 w-full bg-gradient-to-r from-amber-400 via-orange-400 to-amber-500" />

      <div className="p-4 sm:p-5">
        {/* Header */}
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-amber-900">
              {wasConvertedFromCod
                ? '⚠️ Action required — Online payment needed'
                : '⏳ Payment pending — Order not confirmed yet'}
            </p>

            {wasConvertedFromCod ? (
              <div className="mt-2 space-y-2 text-sm text-amber-800">
                <p>
                  Due to high demand on this order, we&apos;re currently shipping it on a prepaid
                  basis only — we&apos;ll begin preparing and shipping it as soon as payment is
                  received. Thank you so much for your patience and understanding.
                </p>
                <p>
                  Your payment is fully protected — if anything about this order doesn&apos;t work
                  out, you&apos;ll receive a full refund of{' '}
                  <span className="font-semibold">{formatINR(totalAmount)}</span>, covered under
                  our{' '}
                  <Link
                    href="/legal/refund-policy"
                    className="font-semibold text-amber-900 underline underline-offset-2 hover:text-amber-700"
                  >
                    Refund &amp; Cancellation Policy
                  </Link>
                  .
                </p>
              </div>
            ) : (
              <p className="mt-1 text-sm text-amber-800">
                Nothing has been charged yet. Complete the payment to confirm your order and get
                your handwoven saree on its way.
              </p>
            )}
          </div>
        </div>

        {/* Price breakdown — makes it unmistakable that the order was placed
            at the original COD price, and this discounted total is only
            for the online payment (not a price change on the order itself). */}
        {hasDiscount && (
          <div className="mt-3 rounded-lg border border-green-200 bg-green-50/70 px-3 py-2.5 text-sm">
            <div className="flex items-center justify-between text-amber-900/70">
              <span>Order placed at (COD price)</span>
              <span className="line-through">{formatINR(totalAmount + discountAmt)}</span>
            </div>
            <div className="mt-1 flex items-center justify-between font-medium text-green-700">
              <span className="flex items-center gap-1">
                <span className="text-base leading-none">🎁</span> Online payment discount
              </span>
              <span>-{formatINR(discountAmt)}</span>
            </div>
            <div className="mt-1.5 flex items-center justify-between border-t border-green-200 pt-1.5 font-bold text-amber-900">
              <span>Amount to pay now</span>
              <span>{formatINR(totalAmount)}</span>
            </div>
          </div>
        )}

        {/* Trust pills + CTA */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3 text-xs text-amber-700">
            <span className="flex items-center gap-1">
              <ShieldCheck className="h-3.5 w-3.5" /> 100% secure payment
            </span>
            <span className="flex items-center gap-1">
              <CreditCard className="h-3.5 w-3.5" /> UPI · Cards · Net Banking
            </span>
          </div>
          <Button
            asChild
            className="shrink-0 bg-amber-600 text-white hover:bg-amber-700 gap-1.5 shadow-sm"
            size="sm"
          >
            <Link href={resumeHref}>
              Complete Payment — {formatINR(totalAmount)}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
