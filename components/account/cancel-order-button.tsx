'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
  DialogClose,
} from '@/components/ui/dialog';
import { toast } from 'sonner';

export default function CancelOrderButton({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const onConfirm = async () => {
    setCancelling(true);
    try {
      const res = await fetch(`/api/orders/${orderId}/cancel`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Failed to cancel order.');
        return;
      }
      if (data.refundError) {
        toast.error(data.refundError);
      } else if (data.refunded) {
        toast.success('Order cancelled. Your refund has been initiated and should reflect in 5-7 business days.');
      } else {
        toast.success('Order cancelled.');
      }
      setOpen(false);
      router.refresh();
    } catch {
      toast.error('Failed to cancel order. Please try again.');
    } finally {
      setCancelling(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="mt-2 text-red-600 hover:bg-red-50 hover:text-red-700">
          Cancel Order
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel this order?</DialogTitle>
          <DialogDescription>
            This cannot be undone. If you&apos;ve already paid online, your refund will be
            processed as per our Refund &amp; Cancellation Policy.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0">
          <DialogClose asChild>
            <Button variant="outline">Keep Order</Button>
          </DialogClose>
          <Button variant="destructive" onClick={onConfirm} disabled={cancelling}>
            {cancelling && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Yes, Cancel Order
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
