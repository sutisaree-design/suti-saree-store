'use client';

import { useEffect, useState } from 'react';
import { Truck, PackageCheck, Loader2, RefreshCw, MapPin, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { nextLotPhrase } from '@/lib/shipments';

interface TrackingScan {
  status: string;
  location?: string;
  dateTime?: string;
  instructions?: string;
}

interface ParcelTracking {
  tracked: boolean;
  waybill?: string;
  courier?: string;
  currentStatus?: string;
  currentLocation?: string;
  expectedDeliveryDate?: string;
  scans?: TrackingScan[];
  error?: string;
}

interface ShipmentTracking extends ParcelTracking {
  id: string;
  shipment_no: number;
  waybill: string;
  courier_name?: string | null;
  items?: any[];
  is_partial?: boolean;
}

interface TrackingResponse extends ParcelTracking {
  orderStatus?: string;
  shipments?: ShipmentTracking[];
  remainingItems?: any[];
  nextLot?: { minDays: number; maxDays: number } | null;
}

function ItemChips({ items }: { items?: any[] }) {
  if (!items || items.length === 0) return null;
  return (
    <ul className="mt-2 flex flex-col gap-1.5">
      {items.map((it, i) => (
        <li key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
          {it.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={it.image_url} alt="" className="h-8 w-8 rounded border border-border/60 object-cover" />
          ) : (
            <span className="h-8 w-8 rounded border border-border/60 bg-muted" />
          )}
          <span className="min-w-0 flex-1 truncate">
            {it.product_name || it.name || 'Item'}
            {it.size ? ` · ${it.size}` : ''}
            {it.color ? ` · ${it.color}` : ''}
            {Number(it.quantity) > 1 ? ` · x${it.quantity}` : ''}
          </span>
        </li>
      ))}
    </ul>
  );
}

function LiveStatus({ data, loading, fetched }: { data: ParcelTracking | null; loading: boolean; fetched: boolean }) {
  return (
    <>
      {!fetched && loading && <p className="mt-3 text-sm text-muted-foreground">Fetching live status…</p>}

      {fetched && data && !data.tracked && (
        <p className="mt-3 text-sm text-muted-foreground">
          {data.error || 'Live tracking will appear here once the courier scans your package.'}
        </p>
      )}

      {fetched && data?.tracked && (
        <div className="mt-4">
          <div className="flex items-center gap-2 rounded-md bg-secondary/10 px-3 py-2 text-sm font-medium text-secondary-foreground">
            <PackageCheck className="h-4 w-4 shrink-0" />
            {data.currentStatus || 'In transit'}
            {data.currentLocation ? (
              <span className="flex items-center gap-1 text-xs font-normal text-muted-foreground">
                <MapPin className="h-3 w-3" /> {data.currentLocation}
              </span>
            ) : null}
          </div>
          {data.expectedDeliveryDate && (
            <p className="mt-2 text-xs text-muted-foreground">Expected delivery: {data.expectedDeliveryDate}</p>
          )}

          {data.scans && data.scans.length > 0 && (
            <ol className="mt-4 flex flex-col gap-3 border-l border-border/60 pl-4">
              {data.scans.map((scan, i) => (
                <li key={i} className="relative text-sm">
                  <span className="absolute -left-[21px] top-1 h-2 w-2 rounded-full bg-secondary" />
                  <p className="font-medium">{scan.status}</p>
                  <p className="text-xs text-muted-foreground">
                    {[scan.location, scan.dateTime].filter(Boolean).join(' · ')}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </>
  );
}

export default function OrderTracking({
  orderId,
  initialTrackingNumber,
  initialCourierName,
}: {
  orderId: string;
  initialTrackingNumber?: string | null;
  initialCourierName?: string | null;
}) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<TrackingResponse | null>(null);
  const [fetched, setFetched] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/orders/${orderId}/tracking`, { cache: 'no-store' });
      const body = await res.json();
      setData(body);
    } catch {
      setData({ tracked: false, error: 'Could not load tracking info' });
    } finally {
      setLoading(false);
      setFetched(true);
    }
  };

  useEffect(() => {
    if (initialTrackingNumber) {
      load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTrackingNumber]);

  if (!initialTrackingNumber) {
    return (
      <div className="rounded-lg border border-border/60 bg-muted/30 p-4 text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <Truck className="h-4 w-4" />
          Your order hasn't been dispatched yet. Tracking details will appear here once it ships.
        </div>
      </div>
    );
  }

  const shipments = data?.shipments ?? [];
  const remaining = data?.remainingItems ?? [];
  const isSplit = shipments.length > 1 || shipments.some((s) => s.is_partial) || remaining.length > 0;

  // ---- Single parcel: identical to the original look -------------------
  if (!isSplit) {
    const single = shipments[0] ?? null;
    const view: ParcelTracking | null = single ?? data;
    return (
      <div className="rounded-lg border border-border/60 bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="font-medium">Courier: {initialCourierName || 'Delhivery'}</p>
            <p className="text-xs text-muted-foreground">Tracking #: {initialTrackingNumber}</p>
          </div>
          <Button type="button" size="sm" variant="outline" onClick={load} disabled={loading} className="gap-1.5">
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Refresh
          </Button>
        </div>
        <LiveStatus data={view} loading={loading} fetched={fetched} />
      </div>
    );
  }

  // ---- Split order: one card per parcel + "rest coming" notice ---------
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">
          Your order is shipping in {shipments.length + (remaining.length > 0 ? 1 : 0)} parcels
        </p>
        <Button type="button" size="sm" variant="outline" onClick={load} disabled={loading} className="gap-1.5">
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Refresh
        </Button>
      </div>

      {shipments.map((s) => (
        <div key={s.id} className="rounded-lg border border-border/60 bg-card p-4">
          <div>
            <p className="font-medium">Parcel {s.shipment_no}</p>
            <p className="text-xs text-muted-foreground">
              {s.courier_name || 'Delhivery'} · Tracking #: {s.waybill}
            </p>
          </div>
          <ItemChips items={s.items} />
          <LiveStatus data={s} loading={loading} fetched={fetched} />
        </div>
      ))}

      {remaining.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-amber-900">
            <Clock className="h-4 w-4" />
            Next parcel: {remaining.length} item{remaining.length > 1 ? 's' : ''} still to ship
          </div>
          <p className="mt-1 text-xs text-amber-900/80">
            {remaining.length > 1 ? 'These items are' : 'This item is'} being prepared for our next lot and should ship{' '}
            <b>{nextLotPhrase(data?.nextLot?.minDays, data?.nextLot?.maxDays)}</b>. Its tracking number will appear
            here, and we will email you, as soon as it leaves us. No action needed.
          </p>
          <ItemChips items={remaining} />
        </div>
      )}
    </div>
  );
}
