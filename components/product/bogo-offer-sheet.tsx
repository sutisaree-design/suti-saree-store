'use client';

import { Tag, ShoppingBag, Sparkles } from 'lucide-react';
import { ActivePromotion } from '@/lib/promotions-api';
import { formatBogoLabel } from '@/lib/cart-context';
import { Badge } from '@/components/ui/badge';
import {
  Drawer,
  DrawerTrigger,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
  DrawerClose,
} from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';

/**
 * Tappable "Buy X Get Y" badge that opens a bottom sheet explaining exactly
 * how the offer applies -- which items qualify, how many to add, and which
 * one(s) become free/discounted. Shares the same buy_qty/get_qty/scope data
 * (and label) the product card, PDP price block, and the cart's own
 * computeBogoDiscount() use, so this explanation can never drift out of
 * sync with what actually happens at checkout.
 */
export default function BogoOfferSheet({
  promotion,
  collectionName,
}: {
  promotion: ActivePromotion;
  /** The collection this offer is scoped to, if any -- used to name the
   *  qualifying items in the sheet ("... from the Buy 1 Get 1 collection")
   *  instead of a vague "eligible items". Omit when scope='all'. */
  collectionName?: string | null;
}) {
  const buyQty = Math.max(1, promotion.buy_qty || 1);
  const getQty = Math.max(1, promotion.get_qty || 1);
  const groupSize = buyQty + getQty;
  const isFullyFree = promotion.free_item_discount_percent === 100;
  const eligibleLabel =
    promotion.scope === 'collection' && collectionName ? `from “${collectionName}”` : 'anywhere in the store';

  return (
    <Drawer>
      <DrawerTrigger asChild>
        <button type="button" className="w-fit">
          <Badge className="cursor-pointer border-transparent bg-secondary text-secondary-foreground shadow-sm transition-transform hover:bg-secondary active:scale-95">
            <Tag className="mr-1 h-3 w-3" />
            {formatBogoLabel(promotion)}
          </Badge>
        </button>
      </DrawerTrigger>
      <DrawerContent className="mx-auto max-w-lg">
        <DrawerHeader>
          <DrawerTitle className="flex items-center gap-2 font-serif text-xl text-primary">
            <Sparkles className="h-5 w-5 text-secondary" />
            {formatBogoLabel(promotion)}
          </DrawerTitle>
          <DrawerDescription>Here&rsquo;s exactly how this offer applies to your order.</DrawerDescription>
        </DrawerHeader>

        <div className="grid gap-3 px-4 pb-2">
          <div className="flex gap-3 rounded-lg bg-muted/50 p-3">
            <ShoppingBag className="mt-0.5 h-5 w-5 shrink-0 text-secondary" />
            <p className="text-sm text-foreground">
              Add any <span className="font-semibold">{groupSize} qualifying items</span> {eligibleLabel} to
              your bag — mix and match, they don&rsquo;t need to be the same product.
            </p>
          </div>
          <div className="flex gap-3 rounded-lg bg-muted/50 p-3">
            <Tag className="mt-0.5 h-5 w-5 shrink-0 text-secondary" />
            <p className="text-sm text-foreground">
              The <span className="font-semibold">cheapest {getQty}</span> item{getQty > 1 ? 's' : ''} out of
              every {groupSize} become{getQty > 1 ? '' : 's'}{' '}
              <span className="font-semibold">{isFullyFree ? 'free' : `${promotion.free_item_discount_percent}% off`}</span>{' '}
              automatically — no coupon code needed.
            </p>
          </div>
          <p className="px-1 text-xs text-muted-foreground">
            The discount shows up in your cart and at checkout the moment you have a full set of{' '}
            {groupSize}. Adding more items keeps repeating the offer in the same batches of {groupSize}.
          </p>
        </div>

        <DrawerFooter>
          <DrawerClose asChild>
            <Button className="bg-primary">Got it</Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
