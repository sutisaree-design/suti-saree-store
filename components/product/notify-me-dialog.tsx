'use client';

import { BellRing } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import NotifyMeForm from '@/components/product/notify-me-form';

// "Notify me" popup used on shop / catalogue cards, so a shopper can ask for a
// back-in-stock alert without opening the product page.
export default function NotifyMeDialog({
  open,
  onOpenChange,
  productId,
  name,
  image,
  color,
  slug,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: string;
  name: string;
  image?: string | null;
  color?: string | null;
  slug?: string | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        onClick={(e) => e.stopPropagation()}
        className="w-[calc(100%-2rem)] max-w-md gap-0 overflow-hidden rounded-2xl border-secondary/30 p-0"
      >
        <div className="bg-gradient-to-br from-primary to-primary/85 px-5 pb-5 pt-6 text-primary-foreground">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider">
            <BellRing className="h-3.5 w-3.5" /> Back-in-stock alert
          </span>
          <DialogTitle className="mt-3 font-serif text-xl font-bold leading-snug text-primary-foreground">
            Sold out — but not forever
          </DialogTitle>
          <DialogDescription className="mt-1 text-sm text-primary-foreground/80">
            We&apos;ll message you the moment it&apos;s available again.
          </DialogDescription>
        </div>

        <div className="flex items-center gap-3 border-b border-border/60 bg-muted/30 px-5 py-3">
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image} alt={name} className="h-16 w-12 shrink-0 rounded-md object-cover shadow-sm" />
          ) : null}
          <div className="min-w-0">
            <p className="line-clamp-2 text-sm font-semibold leading-snug">{name}</p>
            {color && <p className="mt-0.5 text-xs text-muted-foreground">Colour: {color}</p>}
          </div>
        </div>

        <div className="px-5 pb-5 pt-4">
          <NotifyMeForm productId={productId} variant={{ color, slug, image }} embedded />
        </div>
      </DialogContent>
    </Dialog>
  );
}
