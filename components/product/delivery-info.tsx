'use client';

import { useState } from 'react';
import { Truck, Clock, ChevronDown } from 'lucide-react';

// Static delivery info card — replaces the old pincode-checker widget.
// No pincode input, no serviceability lookup: just the same delivery
// promise already declared in Google Merchant Center > Shipping > Delivery
// times, shown as plain text for every visitor/every product.
//
// IMPORTANT: keep these four numbers in sync with Merchant Center
// (merchants.google.com > Shipping > Delivery times) whenever that's
// changed there, so the on-site promise never mismatches what's declared
// to Google (shipping/misrepresentation policy):
//   - Order cut off:      2:00 PM IST
//   - Handling time:      2–3 business days
//   - Transit time:       3–12 business days (all destinations)
//   - Total delivery:     5–15 business days (all destinations)
const ORDER_CUTOFF_LABEL = '2:00 PM';
const HANDLING_LABEL = '2–3 business days';
const TRANSIT_LABEL = '3–12 business days';

export default function DeliveryInfo() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="rounded-lg border border-border/60 bg-card p-4">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between gap-2 text-sm font-semibold"
      >
        <span className="flex items-center gap-2">
          <Truck className="h-4 w-4 text-secondary" />
          Delivery details
          <span className="font-normal text-muted-foreground">
            ({TRANSIT_LABEL})
          </span>
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {isOpen && (
        <div className="mt-2.5 flex flex-col gap-2 rounded-md bg-secondary/10 p-3">
          <div className="flex items-start gap-2 text-xs text-muted-foreground">
            <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <p>
              Dispatched in {HANDLING_LABEL} for orders placed before {ORDER_CUTOFF_LABEL}, then{' '}
              <span className="font-semibold text-foreground">{TRANSIT_LABEL}</span> in transit
              depending on your location.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
