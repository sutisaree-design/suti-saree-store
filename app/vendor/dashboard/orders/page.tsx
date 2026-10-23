'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Loader2,
  PackageSearch,
  Barcode as BarcodeIcon,
  Warehouse,
  Check,
  X,
  Truck,
  Camera,
  Clock,
  Download,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatINR } from '@/lib/format';
import { fetchDelhiverySettings } from '@/lib/delhivery-api';
import {
  fetchMyVendorOrders,
  acceptVendorOrderItem,
  rejectVendorOrderItem,
  requestVendorPickup,
  markVendorPickedUp,
  uploadPickupProofPhoto,
  type VendorOrderItemRow,
  type VendorOrderItemStage,
} from '@/lib/vendor-api';
import ReturnRtoStats from '@/components/vendor/return-rto-stats';
import StockHoldTimers from '@/components/vendor/stock-hold-timers';

const STAGE_META: Record<VendorOrderItemStage, { label: string; className: string }> = {
  placed: { label: 'New — Awaiting Your Response', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  vendor_accepted: { label: 'Accepted — Arrange Pickup', className: 'bg-blue-50 text-blue-700 border-blue-200' },
  picked_from_vendor: { label: 'Picked Up by Courier', className: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  received_at_warehouse: { label: 'Received at Warehouse', className: 'bg-teal-50 text-teal-700 border-teal-200' },
  packed: { label: 'Packed', className: 'bg-teal-50 text-teal-700 border-teal-200' },
  shipped_to_customer: { label: 'Shipped', className: 'bg-teal-50 text-teal-700 border-teal-200' },
  delivered: { label: 'Delivered', className: 'bg-green-50 text-green-700 border-green-200' },
  cancelled: { label: 'Cancelled', className: 'bg-red-50 text-red-700 border-red-200' },
  returned: { label: 'Returned', className: 'bg-red-50 text-red-700 border-red-200' },
  quality_hold: { label: 'On Quality Hold', className: 'bg-orange-50 text-orange-700 border-orange-200' },
};

const DELIVERY_STATUS_META: Record<string, { label: string; className: string }> = {
  in_transit: { label: 'Live: On the way to customer', className: 'text-blue-700 font-medium' },
  delivered: { label: 'Live: Delivered to customer', className: 'text-green-700 font-medium' },
  rto_initiated: { label: 'Live: RTO — courier bringing it back', className: 'text-red-700 font-medium' },
  rto_delivered: { label: 'Live: RTO — back at warehouse', className: 'text-red-700 font-medium' },
};

function AcceptDeadline({ deadline }: { deadline: string | null }) {
  if (!deadline) return null;
  const ms = new Date(deadline).getTime() - Date.now();
  if (ms <= 0) {
    return (
      <p className="mt-1 flex items-center gap-1 text-xs font-medium text-red-600">
        <Clock className="h-3 w-3" /> Accept window has passed — this may auto-cancel soon
      </p>
    );
  }
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const mins = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  return (
    <p className="mt-1 flex items-center gap-1 text-xs text-amber-700">
      <Clock className="h-3 w-3" /> Respond within {hours}h {mins}m
    </p>
  );
}

function OrderCard({
  item,
  warehouseAddress,
  onChange,
}: {
  item: VendorOrderItemRow;
  warehouseAddress: string;
  onChange: (updated: VendorOrderItemRow) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [uploadingProof, setUploadingProof] = useState(false);
  const meta = STAGE_META[item.stage];

  const handleAccept = async () => {
    setBusy(true);
    try {
      const updated = await acceptVendorOrderItem(item.id);
      onChange(updated);
      toast.success('Order accepted');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to accept order');
    } finally {
      setBusy(false);
    }
  };

  const handleReject = async () => {
    if (!confirm(`Reject this order for "${item.product_name}"? Stock will be restocked and the customer notified.`)) {
      return;
    }
    setBusy(true);
    try {
      const updated = await rejectVendorOrderItem(item.id);
      onChange(updated);
      toast.success('Order rejected — stock restocked and customer notified');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to reject order');
    } finally {
      setBusy(false);
    }
  };

  const handleRequestPickup = async () => {
    setBusy(true);
    try {
      const updated = await requestVendorPickup(item.id);
      onChange(updated);
      toast.success("Pickup requested — we'll book the courier and confirm with you shortly.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to request pickup');
    } finally {
      setBusy(false);
    }
  };

  const handleProofUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingProof(true);
    try {
      const url = await uploadPickupProofPhoto(file);
      const updated = await markVendorPickedUp(item.id, url);
      onChange(updated);
      toast.success('Marked as picked up by courier');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save handoff photo');
    } finally {
      setUploadingProof(false);
      e.target.value = '';
    }
  };

  return (
    <div className="rounded-lg border border-border/60 bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          {item.product_image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.product_image} alt="" className="h-14 w-14 rounded-md border border-border/60 object-cover" />
          )}
          <div>
            <p className="text-sm font-medium">{item.product_name}</p>
            <p className="text-xs text-muted-foreground">
              Qty {item.quantity} · {formatINR(item.price)}
            </p>
            {item.barcode && (
              <p className="mt-0.5 flex items-center gap-1 font-mono text-xs text-muted-foreground">
                <BarcodeIcon className="h-3 w-3" /> {item.barcode}
              </p>
            )}
          </div>
        </div>
        <Badge variant="outline" className={meta.className}>
          {meta.label}
        </Badge>
      </div>

      {item.stage === 'placed' && <AcceptDeadline deadline={item.vendor_accept_deadline} />}

      {item.delivery_status && (
        <p className="mt-2 flex items-center gap-1.5 text-xs">
          <Truck className="h-3.5 w-3.5 text-muted-foreground" />
          <span className={DELIVERY_STATUS_META[item.delivery_status]?.className || 'text-muted-foreground'}>
            {DELIVERY_STATUS_META[item.delivery_status]?.label || item.delivery_status}
          </span>
          {item.delivery_status_updated_at && (
            <span className="text-muted-foreground">
              · updated {new Date(item.delivery_status_updated_at).toLocaleDateString('en-IN')}
            </span>
          )}
        </p>
      )}

      {/* "Ship to" — warehouse address only, never the customer's. */}
      <div className="mt-3 flex items-start gap-1.5 rounded-md border border-border/60 bg-muted/30 p-2.5 text-xs text-muted-foreground">
        <Warehouse className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>Ship to: {warehouseAddress || 'Warehouse address not configured yet'}</span>
      </div>

      <div className="mt-2">
        <Button size="sm" variant="outline" className="gap-1.5 text-xs" asChild>
          <a href={`/api/vendor/orders/${item.id}/pickup-slip`} download>
            <Download className="h-3.5 w-3.5" /> Download Pickup Slip
          </a>
        </Button>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {item.stage === 'placed' && (
          <>
            <Button size="sm" className="bg-primary" onClick={handleAccept} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="mr-1 h-4 w-4" />}
              Accept
            </Button>
            <Button size="sm" variant="outline" onClick={handleReject} disabled={busy}>
              <X className="mr-1 h-4 w-4" /> Reject
            </Button>
          </>
        )}

        {item.stage === 'vendor_accepted' && !item.pickup_requested_at && (
          <Button size="sm" variant="outline" onClick={handleRequestPickup} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Truck className="mr-1 h-4 w-4" />}
            Request Pickup
          </Button>
        )}

        {item.stage === 'vendor_accepted' && item.pickup_requested_at && (
          <>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Truck className="h-3.5 w-3.5" /> Pickup requested — we'll book the courier soon.
            </p>
            <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-border bg-muted/40 px-3 py-1.5 text-xs hover:border-primary/50">
              {uploadingProof ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
              <span>{uploadingProof ? 'Uploading…' : 'Upload Handoff Photo & Mark Picked Up'}</span>
              <input type="file" accept="image/*" className="hidden" onChange={handleProofUpload} disabled={uploadingProof} />
            </label>
          </>
        )}

        {(item.stage === 'picked_from_vendor' || item.pickup_photo_url) &&
          item.stage !== 'placed' &&
          item.stage !== 'vendor_accepted' && (
            <p className="text-xs text-muted-foreground">Handed off to courier — now with our warehouse team.</p>
          )}
      </div>
    </div>
  );
}

export default function VendorOrdersPage() {
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<VendorOrderItemRow[]>([]);
  const [warehouseAddress, setWarehouseAddress] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [orderRows, delhivery] = await Promise.all([fetchMyVendorOrders(), fetchDelhiverySettings()]);
      setOrders(orderRows);
      const parts = [delhivery.pickup_address, delhivery.pickup_city, delhivery.pickup_state, delhivery.pickup_pincode].filter(
        Boolean
      );
      setWarehouseAddress(parts.join(', '));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load your orders');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const updateOrder = (updated: VendorOrderItemRow) => {
    setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
  };

  if (loading) {
    return (
      <div className="py-10 text-center">
        <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <PackageSearch className="h-5 w-5 text-primary" />
        <h1 className="font-serif text-2xl font-bold text-primary">My Orders</h1>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Only your own order items appear here — customer details are never shown to vendors.
      </p>

      <div className="mt-4 space-y-4">
        <ReturnRtoStats />
        <StockHoldTimers />
      </div>

      {orders.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">No orders yet.</p>
      ) : (
        <div className="mt-6 space-y-3">
          {orders.map((item) => (
            <OrderCard key={item.id} item={item} warehouseAddress={warehouseAddress} onChange={updateOrder} />
          ))}
        </div>
      )}
    </div>
  );
}
