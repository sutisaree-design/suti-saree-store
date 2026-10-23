'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ChevronDown } from 'lucide-react';
import { toPublicMediaUrl } from '@/lib/media-url';
import { formatINR } from '@/lib/format';
import { useForceMobileRepaint } from '@/hooks/use-force-mobile-repaint';
import type { CartItem } from '@/lib/types';

interface StickyOrderBarProps {
  items: CartItem[];
  subtotal: number;
  /** Sum of each item's MRP (sticker price) — shown struck-through above
   *  Subtotal so the customer sees the markdown, not just the final total. */
  mrpTotal: number;
  shipping: number;
  payableTotal: number;
  totalSavings: number;
  paymentMethod: 'online' | 'cod' | 'partial';
  /** Rupee amount of the online-payment incentive (not the raw percent) —
   *  already computed against the current subtotal, so it's ready to show
   *  directly regardless of which payment method is currently selected. */
  onlineDiscountAmount: number;
  /** Every other active discount (coupon, BOGO, gift card, loyalty points),
   *  each with its rupee amount, so the whole breakdown lives inside this
   *  one collapsible tab instead of being scattered across the page. */
  discountBreakdown?: { label: string; amount: number }[];
}

// Collapsible sticky bar pinned just under the site header on the checkout
// page. Collapsed, it's just "N item(s) — ₹total" so it never gets in the
// way of the form below; tapping it drops down the full item-by-item
// summary (image, title, qty, price) plus the subtotal/shipping/total
// breakdown, so the customer can double-check what they're paying for
// without losing their place in the form.
export default function StickyOrderBar({
  items,
  subtotal,
  mrpTotal,
  shipping,
  payableTotal,
  totalSavings,
  paymentMethod,
  onlineDiscountAmount,
  discountBreakdown = [],
}: StickyOrderBarProps) {
  const [open, setOpen] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);

  // See hooks/use-force-mobile-repaint.ts — without this, switching
  // Pay Online <-> Cash on Delivery updates this bar's price instantly in
  // desktop DevTools' mobile emulation, but on a real phone the new price
  // only paints once the user taps or scrolls, because this bar is
  // `sticky` + blurred and mobile browsers cache that layer once it's
  // stuck to the top.
  useForceMobileRepaint(barRef, [payableTotal, mrpTotal, totalSavings, paymentMethod, onlineDiscountAmount]);

  if (items.length === 0) return null;

  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div
      ref={barRef}
      style={{ transform: 'translateZ(0)', WebkitBackfaceVisibility: 'hidden', backfaceVisibility: 'hidden' }}
      className="sticky top-12 z-30 -mx-4 mb-6 border-b border-border/60 bg-background/95 shadow-sm backdrop-blur-md sm:mx-0 sm:rounded-lg sm:border"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-4 py-2.5"
      >
        <span className="text-xs font-medium text-muted-foreground">
          {itemCount} item{itemCount > 1 ? 's' : ''}
          {totalSavings > 0 && (
            <span className="ml-2 rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-semibold text-green-700">
              You save {formatINR(totalSavings)}
            </span>
          )}
        </span>
        <span className="flex items-center gap-1.5">
          {mrpTotal > payableTotal && (
            <span className="font-serif text-xs text-muted-foreground line-through sm:text-sm">
              {formatINR(mrpTotal)}
            </span>
          )}
          <span className="font-serif text-base font-bold text-primary sm:text-lg">
            {formatINR(payableTotal)}
          </span>
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </span>
      </button>

      {open && (
        <div className="border-t border-border/60 px-4 pb-4 pt-3">
          <ul className="flex flex-col gap-3">
            {items.map((item) => {
              const thumbnail =
                toPublicMediaUrl(item.product.images?.[0]) || 'https://placehold.co/56x64?text=No+Image';
              return (
                <li key={`${item.product.id}-${item.size}`} className="flex items-center gap-3">
                  <Link
                    href={`/product/${item.product.slug}`}
                    className="relative h-12 w-11 shrink-0 overflow-hidden rounded-md bg-muted ring-1 ring-border/60 transition-opacity hover:opacity-80"
                    aria-label={`View ${item.product.name}`}
                  >
                    <Image src={thumbnail} alt={item.product.name} fill sizes="44px" className="object-cover" />
                  </Link>
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/product/${item.product.slug}`}
                      className="line-clamp-1 text-sm font-medium text-foreground hover:text-primary"
                    >
                      {item.product.name}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      Qty: {item.quantity}
                      {item.size ? ` · Size: ${item.size}` : ''}
                      {item.product.colors?.[0] ? ` · Color: ${item.product.colors[0]}` : ''}
                    </p>
                  </div>
                  <span className="flex shrink-0 items-baseline gap-1.5">
                    {item.product.mrp && item.product.mrp > item.product.price && (
                      <span className="text-xs text-muted-foreground line-through">
                        {formatINR(item.product.mrp * item.quantity)}
                      </span>
                    )}
                    <span className="text-sm font-semibold">
                      {formatINR(item.product.price * item.quantity)}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>

          {(discountBreakdown.length > 0 || onlineDiscountAmount > 0) && (
            <div className="mt-3 flex flex-col gap-1.5 rounded-md bg-secondary/10 px-3 py-2 text-xs">
              {discountBreakdown.map((d) => (
                <div key={d.label} className="flex justify-between font-medium text-secondary-foreground">
                  <span>{d.label}</span>
                  <span>-{formatINR(d.amount)}</span>
                </div>
              ))}
              {onlineDiscountAmount > 0 && (
                <div className="flex justify-between font-medium text-secondary-foreground">
                  <span>
                    {paymentMethod === 'online'
                      ? 'Online payment discount'
                      : `Pay online to save an extra`}
                  </span>
                  <span>{paymentMethod === 'online' ? '-' : ''}{formatINR(onlineDiscountAmount)}</span>
                </div>
              )}
            </div>
          )}

          <div className="mt-4 flex flex-col gap-1.5 border-t border-border/60 pt-3 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>Subtotal</span>
              <span>{formatINR(subtotal)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Shipping</span>
              <span>{shipping > 0 ? formatINR(shipping) : 'Free'}</span>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-3">
            <span className="text-sm font-bold">To Pay</span>
            <span className="font-serif text-base font-bold text-primary">
              {formatINR(payableTotal)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
