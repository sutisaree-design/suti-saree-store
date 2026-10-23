'use client';

import { ShoppingBag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatINR } from '@/lib/format';

interface MobileStickyCartBarProps {
  name: string;
  price: number;
  mrp?: number | null;
  inStock: boolean;
  onAdd: () => void;
  onBuyNow: () => void;
  couponCode?: string | null;
  couponDiscount?: number;
}

// Fixed bottom bar shown only on small screens on the product detail page,
// so shoppers can add to cart without scrolling back up to the buy box.
export default function MobileStickyCartBar({
  name,
  price,
  mrp,
  inStock,
  onAdd,
  onBuyNow,
  couponCode,
  couponDiscount = 0,
}: MobileStickyCartBarProps) {
  const hasCoupon = !!couponCode && couponDiscount > 0;
  const finalPrice = hasCoupon ? Math.max(0, price - couponDiscount) : price;

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 shadow-[0_-4px_16px_rgba(0,0,0,0.08)] backdrop-blur-sm md:hidden"
      style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
    >
      {hasCoupon && (
        <p className="bg-green-50 px-4 py-1 text-center text-xs font-medium text-green-700">
          🎉 Congratulations! You saved {formatINR(couponDiscount)} with code &quot;{couponCode}&quot;
        </p>
      )}
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span
              className={`font-serif text-2xl font-bold ${hasCoupon ? 'text-green-600' : 'text-primary'}`}
            >
              {formatINR(finalPrice)}
            </span>
            {hasCoupon ? (
              <span className="text-sm text-muted-foreground line-through">{formatINR(price)}</span>
            ) : (
              mrp &&
              mrp > price && (
                <span className="text-sm text-muted-foreground line-through">{formatINR(mrp)}</span>
              )
            )}
          </div>
        </div>
        {inStock ? (
          <div className="flex shrink-0 items-center gap-2">
            <Button
              onClick={onAdd}
              variant="outline"
              size="lg"
              className="gap-1.5 border-primary px-4 text-primary"
            >
              <ShoppingBag className="h-4 w-4" />
              Add to Bag
            </Button>
            <Button
              onClick={onBuyNow}
              size="lg"
              className="btn-shine bg-primary px-5 text-primary-foreground"
            >
              Buy Now
            </Button>
          </div>
        ) : (
          <Button disabled className="shrink-0 opacity-50">
            Out of Stock
          </Button>
        )}
      </div>
    </div>
  );
}
