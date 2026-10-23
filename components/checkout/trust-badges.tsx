'use client';

import { useEffect, useState } from 'react';
import { ShieldCheck, Lock, RotateCcw, Headset } from 'lucide-react';
import {
  FulfillmentSettings,
  DEFAULT_FULFILLMENT_SETTINGS,
  fetchFulfillmentSettings,
  returnWindowBadgeText,
} from '@/lib/marketing-api';

/**
 * Checkout trust signals — sits right below the "Place Order" button.
 * Pulls the returns window from Admin > Marketing > Shipping & Returns
 * Timing so it never drifts out of sync with the rest of the site.
 */
export default function TrustBadges() {
  const [fulfillment, setFulfillment] = useState<FulfillmentSettings>(DEFAULT_FULFILLMENT_SETTINGS);

  useEffect(() => {
    let cancelled = false;
    fetchFulfillmentSettings()
      .then((f) => {
        if (!cancelled) setFulfillment(f);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="mt-5 flex flex-col gap-4">
      {/* Reassurance strip: SSL / secure payment / easy returns / support */}
      <div className="grid grid-cols-2 gap-2.5 rounded-md border border-border/60 bg-muted/30 p-3 sm:grid-cols-4">
        <div className="flex flex-col items-center gap-1 text-center">
          <ShieldCheck className="h-5 w-5 text-secondary" />
          <span className="text-[10px] font-medium leading-tight text-muted-foreground">
            100% Secure
            <br />
            Payment
          </span>
        </div>
        <div className="flex flex-col items-center gap-1 text-center">
          <Lock className="h-5 w-5 text-secondary" />
          <span className="text-[10px] font-medium leading-tight text-muted-foreground">
            SSL Encrypted
            <br />
            Checkout
          </span>
        </div>
        <div className="flex flex-col items-center gap-1 text-center">
          <RotateCcw className="h-5 w-5 text-secondary" />
          <span className="text-[10px] font-medium leading-tight text-muted-foreground">
            Easy {returnWindowBadgeText(fulfillment)}
            <br />
            Returns
          </span>
        </div>
        <div className="flex flex-col items-center gap-1 text-center">
          <Headset className="h-5 w-5 text-secondary" />
          <span className="text-[10px] font-medium leading-tight text-muted-foreground">
            Dedicated
            <br />
            Support
          </span>
        </div>
      </div>

      {/* Payment method row */}
      <div className="flex flex-col items-center gap-2">
        <p className="text-[11px] text-muted-foreground">Safe & secure payments powered by</p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          {['Razorpay', 'UPI', 'Visa', 'Mastercard', 'RuPay', 'Net Banking'].map((method) => (
            <span
              key={method}
              className="rounded border border-border/60 bg-background px-2 py-1 text-[10px] font-semibold tracking-wide text-foreground/70"
            >
              {method}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
