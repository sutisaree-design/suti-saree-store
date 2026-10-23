'use client';

import { useEffect, useState } from 'react';
import { Copy, Check, Tag, Clock } from 'lucide-react';
import { fetchAllActiveCoupons, Coupon } from '@/lib/coupons-api';
import { formatINR } from '@/lib/format';
import { toast } from 'sonner';

function describeDiscount(c: Coupon) {
  return c.discount_type === 'percentage'
    ? `${c.discount_value}% OFF`
    : `${formatINR(c.discount_value)} OFF`;
}

// Cycled per card so a row of several coupons reads as a set of distinct
// offers instead of the same tile repeated — built from the site's own
// primary/secondary theme, no new colours introduced.
const THEMES = [
  'from-secondary via-secondary/90 to-primary',
  'from-primary via-primary to-[#5b1a2e]',
  'from-[#5b1a2e] via-primary to-secondary/80',
];

function daysLeft(expiresAt: string | null): number | null {
  if (!expiresAt) return null;
  const ms = new Date(expiresAt).getTime() - Date.now();
  return ms > 0 ? Math.ceil(ms / (1000 * 60 * 60 * 24)) : null;
}

function CouponCard({ coupon, theme }: { coupon: Coupon; theme: string }) {
  const [copied, setCopied] = useState(false);
  const left = daysLeft(coupon.expires_at);

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(coupon.code);
      setCopied(true);
      toast.success(`Code "${coupon.code}" copied`);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Could not copy code');
    }
  };

  return (
    <div
      className={`relative flex w-[280px] shrink-0 flex-col gap-3 overflow-hidden rounded-2xl bg-gradient-to-r px-5 py-4 text-primary-foreground shadow-md sm:w-auto sm:flex-1 ${theme}`}
    >
      <div className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-white/10 blur-2xl" />
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-background/25">
          <Tag className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="font-serif text-base font-bold leading-tight">
            {describeDiscount(coupon)}
          </p>
          <p className="truncate text-[11px] text-primary-foreground/85">
            {coupon.min_order_value > 0
              ? `On orders above ${formatINR(coupon.min_order_value)}`
              : 'On your order'}
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={copyCode}
        className="flex items-center justify-between gap-2 rounded-full border border-dashed border-primary-foreground/60 bg-background/15 px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-background/25"
      >
        <span className="font-mono tracking-wide">{coupon.code}</span>
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      </button>

      {left !== null && (
        <span className="flex items-center gap-1 text-[10px] text-primary-foreground/75">
          <Clock className="h-3 w-3" /> Ends in {left} {left === 1 ? 'day' : 'days'}
        </span>
      )}
    </div>
  );
}

export default function CouponStrip() {
  const [coupons, setCoupons] = useState<Coupon[] | null>(null);

  useEffect(() => {
    fetchAllActiveCoupons()
      .then(setCoupons)
      .catch(() => setCoupons([]));
  }, []);

  // null = still loading (render nothing to avoid a layout flash),
  // [] = no active coupons right now (also render nothing).
  if (!coupons || coupons.length === 0) return null;

  return (
    <section className="container-boutique py-6">
      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-secondary">
        Live Offers
      </p>
      <div className="flex gap-3 overflow-x-auto pb-1 no-scrollbar sm:overflow-visible">
        {coupons.map((c, i) => (
          <CouponCard key={c.id} coupon={c} theme={THEMES[i % THEMES.length]} />
        ))}
      </div>
    </section>
  );
}
