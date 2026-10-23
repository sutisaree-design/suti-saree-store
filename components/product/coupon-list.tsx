'use client';

import { useEffect, useState } from 'react';
import { Tag, Check } from 'lucide-react';
import { fetchProductPageCoupons, validateCoupon, Coupon } from '@/lib/coupons-api';
import { formatINR } from '@/lib/format';
import { toast } from 'sonner';

function describeDiscount(c: Coupon) {
  return c.discount_type === 'percentage' ? `${c.discount_value}% OFF` : `${formatINR(c.discount_value)} OFF`;
}

interface CouponListProps {
  productPrice: number;
  appliedCode: string | null;
  onApply: (coupon: Coupon, discount: number) => void;
  onRemove: () => void;
}

export default function CouponList({ productPrice, appliedCode, onApply, onRemove }: CouponListProps) {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState<string | null>(null);

  useEffect(() => {
    fetchProductPageCoupons()
      .then(setCoupons)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleClick = async (c: Coupon) => {
    if (appliedCode === c.code) {
      onRemove();
      return;
    }
    setApplying(c.code);
    try {
      const result = await validateCoupon(c.code, productPrice);
      if (!result.ok || !result.coupon) {
        toast.error(result.error || 'Could not apply this coupon');
        return;
      }
      onApply(result.coupon, result.discount || 0);
      toast.success(`Coupon "${c.code}" applied`);
    } finally {
      setApplying(null);
    }
  };

  if (loading || coupons.length === 0) return null;

  return (
    <div>
      <div className="mb-2.5 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-secondary/20 text-secondary-foreground">
            <Tag className="h-3 w-3" />
          </span>
          Available Coupons
        </div>
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {coupons.length} offer{coupons.length > 1 ? 's' : ''}
        </span>
      </div>
      <div className="flex flex-col gap-2">
        {coupons.map((c) => {
          const isApplied = appliedCode === c.code;
          return (
            <div
              key={c.id}
              className={`relative flex items-center gap-3 overflow-hidden rounded-xl border bg-gradient-to-br px-4 py-3 transition-colors ${
                isApplied
                  ? 'border-emerald-600/40 from-emerald-50 to-transparent dark:from-emerald-950/30'
                  : 'border-secondary/30 from-secondary/[0.07] to-transparent'
              }`}
            >
              {/* Ticket die-cut notches — reads as a real discount ticket, not a plain row */}
              <span className="absolute -left-2.5 top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-background" />
              <span className="absolute -right-2.5 top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-background" />

              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                  isApplied ? 'bg-emerald-600/15 text-emerald-700' : 'bg-primary/10 text-primary'
                }`}
              >
                <Tag className="h-4 w-4" />
              </span>

              <div className="min-w-0 flex-1 border-l border-dashed border-secondary/40 pl-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-md bg-primary/10 px-1.5 py-0.5 font-mono text-sm font-semibold tracking-wide text-primary">
                    {c.code}
                  </span>
                  <span className="rounded-full bg-emerald-600/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                    {describeDiscount(c)}
                  </span>
                </div>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  {c.min_order_value > 0
                    ? `On orders above ${formatINR(c.min_order_value)}`
                    : 'No minimum order value'}
                </p>
              </div>

              <button
                type="button"
                onClick={() => handleClick(c)}
                disabled={applying === c.code}
                className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold shadow-sm transition-colors disabled:opacity-60 ${
                  isApplied
                    ? 'bg-emerald-600 text-white'
                    : 'bg-primary text-primary-foreground hover:bg-primary/90'
                }`}
              >
                {isApplied ? (
                  <span className="flex items-center gap-1">
                    <Check className="h-3.5 w-3.5" /> Applied
                  </span>
                ) : applying === c.code ? (
                  'Applying…'
                ) : (
                  'Apply'
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
