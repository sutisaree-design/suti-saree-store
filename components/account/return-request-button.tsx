'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';

const RETURN_REASONS: { key: string; label: string }[] = [
  { key: 'size_fit',       label: 'Size fit nahi hui (saree length / blouse piece)' },
  { key: 'colour_diff',    label: 'Colour alag aaya — photo se match nahi kiya' },
  { key: 'quality_low',    label: 'Quality expected se kam lagi' },
  { key: 'fabric_diff',    label: 'Fabric expected se alag laga' },
  { key: 'damaged',        label: 'Damaged / defective item aaya' },
  { key: 'wrong_item',     label: 'Wrong item bheja gaya' },
  { key: 'disliked',       label: 'Mujhe pasand nahi aayi' },
  { key: 'duplicate',      label: 'Duplicate order place ho gaya' },
];

const EXCHANGE_REASONS: { key: string; label: string }[] = [
  { key: 'size_change',    label: 'Size change chahiye (blouse piece)' },
  { key: 'colour_change',  label: 'Alag colour chahiye' },
  { key: 'gift_option',    label: 'Gift ke liye alag option chahiye' },
  { key: 'changed_mind',   label: 'Soch badal gaya' },
];

export default function ReturnRequestButton({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<'return' | 'exchange'>('return');
  const [reasonKey, setReasonKey] = useState('');
  const [additionalNote, setAdditionalNote] = useState('');
  const [desiredSize, setDesiredSize] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const reasons = type === 'return' ? RETURN_REASONS : EXCHANGE_REASONS;

  const selectedReason = reasons.find((r) => r.key === reasonKey);

  const onTypeChange = (v: 'return' | 'exchange') => {
    setType(v);
    setReasonKey('');
    setAdditionalNote('');
    setDesiredSize('');
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!reasonKey) {
      toast.error('Please select a reason');
      return;
    }

    // Build the human-readable reason string for the DB / emails
    const reasonLabel = selectedReason?.label ?? reasonKey;
    const reason = additionalNote.trim()
      ? `${reasonLabel} — ${additionalNote.trim()}`
      : reasonLabel;

    setSubmitting(true);
    try {
      const res = await fetch('/api/returns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_id: orderId,
          type,
          reason,
          reason_key: reasonKey,
          desired_size: type === 'exchange' ? desiredSize.trim() : undefined,
        }),
      });
      const resBody = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(resBody.error || 'Failed to submit request');
        return;
      }
      toast.success('Request submitted — check your email for confirmation.');
      setOpen(false);
      router.refresh();
    } catch {
      toast.error('Failed to submit request');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="mt-2">
          Request Return / Exchange
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Request Return or Exchange</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          {/* Type */}
          <div className="space-y-1.5">
            <Label>Request type</Label>
            <Select value={type} onValueChange={(v) => onTypeChange(v as 'return' | 'exchange')}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="return">Return for refund</SelectItem>
                <SelectItem value="exchange">Exchange for different size / colour</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Reason dropdown */}
          <div className="space-y-1.5">
            <Label>Reason</Label>
            <Select value={reasonKey} onValueChange={setReasonKey}>
              <SelectTrigger>
                <SelectValue placeholder="Select a reason…" />
              </SelectTrigger>
              <SelectContent>
                {reasons.map((r) => (
                  <SelectItem key={r.key} value={r.key}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Optional extra detail */}
          {reasonKey && (
            <div className="space-y-1.5">
              <Label htmlFor="additional-note">
                Additional detail <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Textarea
                id="additional-note"
                value={additionalNote}
                onChange={(e) => setAdditionalNote(e.target.value)}
                placeholder={
                  reasonKey === 'wrong_item'
                    ? 'E.g. Expected tha Red Kanjivaram, mila Green Banarasi'
                    : reasonKey === 'colour_diff'
                    ? 'E.g. Photo me dark maroon tha, item light pink aaya'
                    : 'Kuch aur detail likhna chahein toh…'
                }
                rows={2}
              />
            </div>
          )}

          {/* Desired size — exchange only */}
          {type === 'exchange' && (
            <div className="space-y-1.5">
              <Label htmlFor="desired-size">
                Desired size / colour / variant{' '}
                <span className="text-muted-foreground">(required for exchange)</span>
              </Label>
              <Input
                id="desired-size"
                value={desiredSize}
                onChange={(e) => setDesiredSize(e.target.value)}
                placeholder="E.g. Blouse size 38, ya Dark Green colour"
                required={type === 'exchange'}
              />
            </div>
          )}

          <DialogFooter>
            <Button type="submit" className="w-full bg-primary" disabled={submitting || !reasonKey}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Submit Request
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
