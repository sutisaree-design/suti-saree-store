'use client';

import { useEffect, useState } from 'react';
import { Loader2, Package, Truck, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { formatINR } from '@/lib/format';
import {
  getUnshippedItemIndexes,
  suggestCodAmount,
  DEFAULT_NEXT_LOT_MIN_DAYS,
  DEFAULT_NEXT_LOT_MAX_DAYS,
  type OrderShipment,
} from '@/lib/shipments';

export interface CreateShipmentPayload {
  weight_grams: number;
  length_cm: number;
  width_cm: number;
  height_cm: number;
  shipping_mode: 'S' | 'E';
  /** Which order.items[] positions go in this parcel. */
  itemIndexes?: number[];
  /** Cash to collect for this parcel (COD orders only). */
  codAmount?: number;
  /** Promise shown to the customer for the items left behind. */
  nextMinDays?: number;
  nextMaxDays?: number;
}

interface RateEstimate {
  mode: 'S' | 'E';
  label: string;
  total_amount: number;
}

export default function CreateShipmentModal({
  open,
  onOpenChange,
  destinationPincode,
  paymentMethod,
  awaitingOnlinePayment,
  items = [],
  shipments = [],
  totalAmount = 0,
  onConfirm,
  confirming,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  destinationPincode?: string;
  paymentMethod?: string | null;
  awaitingOnlinePayment?: boolean;
  /** The order's items + parcels already created, so the admin can split the order. */
  items?: any[];
  shipments?: Pick<OrderShipment, 'shipment_no' | 'item_indexes' | 'cod_amount' | 'waybill'>[];
  totalAmount?: number;
  onConfirm: (payload: CreateShipmentPayload) => void;
  confirming: boolean;
}) {
  const [weight, setWeight] = useState('500');
  const [length, setLength] = useState('20');
  const [width, setWidth] = useState('15');
  const [height, setHeight] = useState('5');
  const [mode, setMode] = useState<'S' | 'E'>('S');
  const [estimates, setEstimates] = useState<RateEstimate[]>([]);
  const [loadingRates, setLoadingRates] = useState(false);

  // ---- Partial shipment state ----
  const unshipped = getUnshippedItemIndexes(items, shipments);
  const unshippedKey = unshipped.join(',');
  const [selected, setSelected] = useState<number[]>(unshipped);
  const [codOverride, setCodOverride] = useState<string>('');
  const [nextMin, setNextMin] = useState(String(DEFAULT_NEXT_LOT_MIN_DAYS));
  const [nextMax, setNextMax] = useState(String(DEFAULT_NEXT_LOT_MAX_DAYS));

  // Re-select everything that's still unshipped whenever the popup opens
  // (or a different order / a later parcel is being created).
  useEffect(() => {
    if (open) {
      setSelected(unshipped);
      setCodOverride('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, unshippedKey]);

  const isPartial = selected.length > 0 && selected.length < unshipped.length;
  const isCod = paymentMethod === 'cod';
  const suggestedCod = suggestCodAmount({
    paymentMethod,
    totalAmount,
    items,
    selectedIndexes: selected,
    existingShipments: shipments,
  });
  const toggleItem = (i: number) =>
    setSelected((cur) => (cur.includes(i) ? cur.filter((x) => x !== i) : [...cur, i].sort((a, b) => a - b)));

  // Refetch live rates whenever weight or the popup opens changes.
  useEffect(() => {
    if (!open || !destinationPincode) return;
    const weightNum = Number(weight);
    if (!weightNum || weightNum <= 0) return;

    const handle = setTimeout(async () => {
      setLoadingRates(true);
      try {
        const res = await fetch('/api/admin/delhivery/rate-estimate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            destination_pincode: destinationPincode,
            weight_grams: weightNum,
            payment_method: paymentMethod,
          }),
        });
        const body = await res.json().catch(() => ({}));
        if (res.ok) {
          setEstimates(body.estimates || []);
        } else {
          setEstimates([]);
        }
      } catch {
        setEstimates([]);
      } finally {
        setLoadingRates(false);
      }
    }, 400); // debounce while typing

    return () => clearTimeout(handle);
  }, [open, weight, destinationPincode, paymentMethod]);

  const surfaceRate = estimates.find((e) => e.mode === 'S');
  const expressRate = estimates.find((e) => e.mode === 'E');

  const handleConfirm = () => {
    const w = Number(weight);
    const l = Number(length);
    const wd = Number(width);
    const h = Number(height);
    if (!w || w < 50) {
      toast.error('Weight should be at least 50 grams');
      return;
    }
    if (!l || !wd || !h) {
      toast.error('Enter valid box dimensions');
      return;
    }
    if (items.length > 0 && selected.length === 0) {
      toast.error('Select at least one item for this parcel');
      return;
    }
    const lo = Math.max(1, Math.round(Number(nextMin) || DEFAULT_NEXT_LOT_MIN_DAYS));
    const hi = Math.max(lo, Math.round(Number(nextMax) || DEFAULT_NEXT_LOT_MAX_DAYS));
    onConfirm({
      weight_grams: w,
      length_cm: l,
      width_cm: wd,
      height_cm: h,
      shipping_mode: mode,
      ...(items.length > 0
        ? {
            itemIndexes: selected,
            ...(isCod ? { codAmount: codOverride !== '' ? Number(codOverride) || 0 : suggestedCod } : {}),
            ...(isPartial ? { nextMinDays: lo, nextMaxDays: hi } : {}),
          }
        : {}),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />{' '}
            {shipments.length > 0 ? `Parcel ${shipments.length + 1} — Box & Shipping` : 'Box & Shipping Details'}
          </DialogTitle>
        </DialogHeader>

        {awaitingOnlinePayment && (
          <div className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            This order is marked <b>online / unpaid</b>, so Delhivery would treat it as Prepaid
            (no cash collected). To ship it as COD, close this popup and click{' '}
            <b>Revert to COD</b> on the order first.
          </div>
        )}

        <div className="grid gap-4">
        {items.length > 1 || shipments.length > 0 ? (
          <div className="rounded-lg border p-3">
            <div className="mb-2 flex items-center justify-between">
              <label className="text-sm font-medium">Items in this parcel</label>
              {unshipped.length > 1 && (
                <button
                  type="button"
                  className="text-xs text-primary underline"
                  onClick={() => setSelected(selected.length === unshipped.length ? [] : unshipped)}
                >
                  {selected.length === unshipped.length ? 'Clear all' : 'Select all'}
                </button>
              )}
            </div>
            {shipments.length > 0 && (
              <p className="mb-2 text-xs text-muted-foreground">
                Already shipped: {shipments.map((sh) => `Parcel ${sh.shipment_no} (${sh.waybill})`).join(', ')}
              </p>
            )}
            <ul className="space-y-1.5">
              {unshipped.map((i) => {
                const it = items[i];
                return (
                  <li key={i}>
                    <label className="flex cursor-pointer items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={selected.includes(i)}
                        onChange={() => toggleItem(i)}
                        className="h-4 w-4"
                      />
                      <span className="min-w-0 flex-1 truncate">
                        {it?.product_name || 'Item'}
                        {it?.color ? ` · ${it.color}` : ''}
                        {it?.size ? ` · ${it.size}` : ''}
                        {Number(it?.quantity) > 1 ? ` · x${it.quantity}` : ''}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>

            {isPartial && (
              <div className="mt-3 rounded border border-blue-200 bg-blue-50 p-2.5 text-xs text-blue-900">
                <b>Partial shipment.</b> {unshipped.length - selected.length} item
                {unshipped.length - selected.length > 1 ? 's' : ''} will stay behind. The customer gets an email (and
                you get a WhatsApp message to send) saying the rest follows in the next lot.
                <div className="mt-2 flex items-center gap-1.5">
                  Next lot in
                  <input
                    type="number"
                    min={1}
                    value={nextMin}
                    onChange={(e) => setNextMin(e.target.value)}
                    className="w-14 rounded border bg-white px-2 py-1 text-xs"
                  />
                  to
                  <input
                    type="number"
                    min={1}
                    value={nextMax}
                    onChange={(e) => setNextMax(e.target.value)}
                    className="w-14 rounded border bg-white px-2 py-1 text-xs"
                  />
                  days
                </div>
              </div>
            )}

            {isCod && selected.length > 0 && (
              <div className="mt-3">
                <label className="mb-1 block text-xs font-medium">Cash to collect for this parcel (₹)</label>
                <input
                  type="number"
                  min={0}
                  value={codOverride}
                  placeholder={String(suggestedCod)}
                  onChange={(e) => setCodOverride(e.target.value)}
                  className="w-full rounded border px-3 py-2 text-sm"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Suggested {formatINR(suggestedCod)} (split by item value). The last parcel always takes whatever
                  balance is left, so the total matches the order.
                </p>
              </div>
            )}
          </div>
        ) : null}

          <div>
            <label className="mb-1 block text-sm font-medium">Package weight (grams)</label>
            <input
              type="number"
              min={50}
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              className="w-full rounded border px-3 py-2 text-sm"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Packaged weight should be at least 50 grams
            </p>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Size (cm)</label>
            <div className="grid grid-cols-3 gap-2">
              <input
                type="number"
                placeholder="Length"
                value={length}
                onChange={(e) => setLength(e.target.value)}
                className="rounded border px-3 py-2 text-sm"
              />
              <input
                type="number"
                placeholder="Breadth"
                value={width}
                onChange={(e) => setWidth(e.target.value)}
                className="rounded border px-3 py-2 text-sm"
              />
              <input
                type="number"
                placeholder="Height"
                value={height}
                onChange={(e) => setHeight(e.target.value)}
                className="rounded border px-3 py-2 text-sm"
              />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Length + Breadth + Height should be at least 15 cm
            </p>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">Choose shipping mode</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMode('S')}
                className={`rounded-lg border p-3 text-left transition ${
                  mode === 'S' ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border'
                }`}
              >
                <div className="flex items-center gap-1.5 text-xs font-medium">
                  <Truck className="h-3.5 w-3.5" /> SURFACE
                </div>
                <div className="mt-1 text-lg font-semibold">
                  {loadingRates ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : surfaceRate ? (
                    formatINR(surfaceRate.total_amount)
                  ) : (
                    '—'
                  )}
                </div>
                <div className="text-xs text-muted-foreground">Delivery in ~5 days</div>
              </button>
              <button
                type="button"
                onClick={() => setMode('E')}
                className={`rounded-lg border p-3 text-left transition ${
                  mode === 'E' ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border'
                }`}
              >
                <div className="flex items-center gap-1.5 text-xs font-medium">
                  <Zap className="h-3.5 w-3.5" /> EXPRESS
                </div>
                <div className="mt-1 text-lg font-semibold">
                  {loadingRates ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : expressRate ? (
                    formatINR(expressRate.total_amount)
                  ) : (
                    '—'
                  )}
                </div>
                <div className="text-xs text-muted-foreground">Delivery in ~3 days</div>
              </button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Estimated cost may vary from the final shipping cost based on packaged
              dimensions &amp; weight measured before delivery.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={confirming}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={confirming} className="gap-1.5">
            {confirming && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {isPartial ? 'Ship selected items' : 'Get AWB Number'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
