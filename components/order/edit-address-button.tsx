'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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

type ShippingAddress = {
  address?: string;
  address2?: string;
  landmark?: string;
  city?: string;
  state?: string;
  pincode?: string;
  country?: string;
};

// Address-only self-service edit -- shown on both the guest order-confirmation
// page and the logged-in account order-detail page. Deliberately doesn't
// touch email/phone (see app/api/orders/[id]/address/route.ts for why).
// `canEdit` is passed in by the caller (server component), computed the
// same way as the server-side gate, so the button doesn't even render once
// an order has shipped -- the server route re-checks this anyway, this is
// just so the customer isn't shown an edit affordance that will fail.
export default function EditAddressButton({
  orderId,
  currentAddress,
  canEdit,
}: {
  orderId: string;
  currentAddress: ShippingAddress | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<ShippingAddress>({
    address: currentAddress?.address || '',
    address2: currentAddress?.address2 || '',
    landmark: currentAddress?.landmark || '',
    city: currentAddress?.city || '',
    state: currentAddress?.state || '',
    pincode: currentAddress?.pincode || '',
    country: currentAddress?.country || '',
  });

  if (!canEdit) return null;

  const onOpenChange = (next: boolean) => {
    if (next) {
      // Reset the draft to the latest known address each time the dialog
      // opens, in case it changed elsewhere since the page loaded.
      setDraft({
        address: currentAddress?.address || '',
        address2: currentAddress?.address2 || '',
        landmark: currentAddress?.landmark || '',
        city: currentAddress?.city || '',
        state: currentAddress?.state || '',
        pincode: currentAddress?.pincode || '',
        country: currentAddress?.country || '',
      });
    }
    setOpen(next);
  };

  const onSave = async () => {
    if (!draft.address?.trim() || !draft.city?.trim() || !draft.state?.trim() || !draft.pincode?.trim()) {
      toast.error('Address, city, state and pincode are required.');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/orders/${orderId}/address`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shipping_address: draft }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || 'Failed to update address.');
        return;
      }
      toast.success('Shipping address updated.');
      setOpen(false);
      router.refresh();
    } catch {
      toast.error('Failed to update address. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Pencil className="h-3.5 w-3.5" /> Edit Address
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit shipping address</DialogTitle>
          <DialogDescription>
            You can update this until your order ships. We&apos;ll deliver to whatever address is saved
            here at that point.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Address</label>
            <Input value={draft.address} onChange={(e) => setDraft((d) => ({ ...d, address: e.target.value }))} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Address line 2 (optional)</label>
            <Input value={draft.address2} onChange={(e) => setDraft((d) => ({ ...d, address2: e.target.value }))} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Landmark (optional)</label>
            <Input value={draft.landmark} onChange={(e) => setDraft((d) => ({ ...d, landmark: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">City</label>
              <Input value={draft.city} onChange={(e) => setDraft((d) => ({ ...d, city: e.target.value }))} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">State</label>
              <Input value={draft.state} onChange={(e) => setDraft((d) => ({ ...d, state: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Pincode</label>
              <Input value={draft.pincode} onChange={(e) => setDraft((d) => ({ ...d, pincode: e.target.value }))} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Country (optional)</label>
              <Input value={draft.country} onChange={(e) => setDraft((d) => ({ ...d, country: e.target.value }))} />
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Need to change your email or phone number on this order instead? Contact us — for your
            security those aren&apos;t editable here.
          </p>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <DialogClose asChild>
            <Button variant="outline" disabled={saving}>
              Cancel
            </Button>
          </DialogClose>
          <Button onClick={onSave} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Address
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
