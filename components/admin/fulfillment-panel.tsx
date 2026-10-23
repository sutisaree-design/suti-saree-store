'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  Loader2,
  PackageSearch,
  Barcode as BarcodeIcon,
  Camera,
  Check,
  X,
  ScanLine,
  Truck,
  ShieldAlert,
  ShieldCheck,
  Box,
  Ship as ShipIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { formatINR } from '@/lib/format';
import {
  fetchAdminFulfillmentQueue,
  uploadAdminFulfillmentPhoto,
  receiveOrderItem,
  submitQualityCheck,
  releaseQualityHold,
  packOrderItem,
  shipOrderItem,
  type AdminFulfillmentItem,
  type FabricCheck,
} from '@/lib/admin-fulfillment-api';

type TabKey = 'receiving' | 'qc' | 'hold' | 'pack' | 'ship' | 'shipped';

const TABS: { value: TabKey; label: string }[] = [
  { value: 'receiving', label: 'Receiving' },
  { value: 'qc', label: 'Quality Check' },
  { value: 'hold', label: 'Quality Hold' },
  { value: 'pack', label: 'Pack' },
  { value: 'ship', label: 'Ship' },
  { value: 'shipped', label: 'Shipped' },
];

function ItemHeader({ item }: { item: AdminFulfillmentItem }) {
  return (
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
      <Badge variant="outline" className="bg-muted/50">
        Vendor: {item.vendor_name}
      </Badge>
    </div>
  );
}

function PhotoUploadButton({
  label,
  busy,
  onFile,
}: {
  label: string;
  busy: boolean;
  onFile: (file: File) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-border bg-muted/40 px-3 py-1.5 text-xs hover:border-primary/50">
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
      <span>{busy ? 'Uploading…' : label}</span>
      <input
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        disabled={busy}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = '';
        }}
      />
    </label>
  );
}

// ---------------------------------------------------------------------
// Barcode scan input — uses the browser's native BarcodeDetector API
// (Chrome/Edge/Android) when available. No hardware scanner and no
// extra npm dependency assumed: if BarcodeDetector isn't supported
// (e.g. Safari, Firefox as of this writing), the manual text field
// below is always available as a fallback either way.
// ---------------------------------------------------------------------
function BarcodeScanInput({ onSubmit, busy }: { onSubmit: (code: string) => void; busy: boolean }) {
  const [manualCode, setManualCode] = useState('');
  const [scanning, setScanning] = useState(false);
  const [scanSupported, setScanSupported] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>();

  useEffect(() => {
    setScanSupported(typeof window !== 'undefined' && 'BarcodeDetector' in window);
    return () => stopScan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopScan = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setScanning(false);
  };

  const startScan = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream;
      setScanning(true);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      // @ts-expect-error — BarcodeDetector isn't in TS's lib.dom yet
      const detector = new window.BarcodeDetector({ formats: ['code_128', 'ean_13', 'ean_8', 'code_39', 'upc_a'] });
      const tick = async () => {
        if (!videoRef.current || !streamRef.current) return;
        try {
          const codes = await detector.detect(videoRef.current);
          if (codes?.[0]?.rawValue) {
            const value = codes[0].rawValue as string;
            stopScan();
            onSubmit(value);
            return;
          }
        } catch {
          // keep trying — a missed frame isn't fatal
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch (err) {
      toast.error('Could not access the camera — enter the barcode manually below instead.');
      setScanning(false);
    }
  };

  return (
    <div className="rounded-md border border-border/60 bg-muted/20 p-3">
      {scanSupported && (
        <div className="mb-2">
          {scanning ? (
            <div className="space-y-2">
              <video ref={videoRef} className="aspect-video w-full rounded-md bg-black object-cover" muted playsInline />
              <Button size="sm" variant="outline" onClick={stopScan}>
                <X className="mr-1 h-3.5 w-3.5" /> Cancel scan
              </Button>
            </div>
          ) : (
            <Button size="sm" variant="outline" onClick={startScan} disabled={busy}>
              <ScanLine className="mr-1 h-4 w-4" /> Scan with camera
            </Button>
          )}
        </div>
      )}
      <div className="flex gap-2">
        <Input
          placeholder="Or type/paste the barcode"
          value={manualCode}
          onChange={(e) => setManualCode(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && manualCode.trim()) onSubmit(manualCode.trim());
          }}
          disabled={busy}
          className="h-9 text-sm"
        />
        <Button
          size="sm"
          disabled={busy || !manualCode.trim()}
          onClick={() => onSubmit(manualCode.trim())}
        >
          Find
        </Button>
      </div>
    </div>
  );
}

function ReceivingCard({
  item,
  onChange,
}: {
  item: AdminFulfillmentItem;
  onChange: (updated: AdminFulfillmentItem) => void;
}) {
  const [busy, setBusy] = useState(false);

  const handlePhoto = async (file: File) => {
    setBusy(true);
    try {
      const url = await uploadAdminFulfillmentPhoto(file);
      const updated = await receiveOrderItem(item.id, url);
      onChange(updated);
      toast.success('Marked received at warehouse — proceed to Quality Check');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to receive item');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border border-border/60 bg-card p-4">
      <ItemHeader item={item} />
      <div className="mt-3">
        <PhotoUploadButton label="Upload Warehouse-Receiving Photo & Mark Received" busy={busy} onFile={handlePhoto} />
      </div>
    </div>
  );
}

function QcCard({
  item,
  onChange,
}: {
  item: AdminFulfillmentItem;
  onChange: (updated: AdminFulfillmentItem) => void;
}) {
  const [defectFound, setDefectFound] = useState(false);
  const [colorMatch, setColorMatch] = useState(true);
  const [fabricCheck, setFabricCheck] = useState<FabricCheck>('not_checked');
  const [tagRemoved, setTagRemoved] = useState(false);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  const canSubmit = tagRemoved || defectFound || !colorMatch; // always submittable — mandatory-ness is enforced server-side + surfaced below
  const willHold = defectFound || !colorMatch || !tagRemoved;

  const submit = async () => {
    setBusy(true);
    try {
      const updated = await submitQualityCheck(item.id, {
        defect_found: defectFound,
        color_match: colorMatch,
        fabric_check: fabricCheck,
        tag_removed: tagRemoved,
        condition_notes: notes,
      });
      onChange(updated);
      toast[willHold ? 'error' : 'success'](
        willHold ? 'Item moved to Quality Hold' : 'QC passed — ready to pack'
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to submit QC');
    } finally {
      setBusy(false);
    }
  };

  const YesNo = ({
    value,
    onValue,
  }: {
    value: boolean;
    onValue: (v: boolean) => void;
  }) => (
    <div className="flex gap-1.5">
      <button
        type="button"
        onClick={() => onValue(true)}
        className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
          value ? 'bg-primary text-primary-foreground' : 'bg-muted/50 text-muted-foreground hover:bg-muted'
        }`}
      >
        Yes
      </button>
      <button
        type="button"
        onClick={() => onValue(false)}
        className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
          !value ? 'bg-primary text-primary-foreground' : 'bg-muted/50 text-muted-foreground hover:bg-muted'
        }`}
      >
        No
      </button>
    </div>
  );

  return (
    <div className="rounded-lg border border-border/60 bg-card p-4">
      <ItemHeader item={item} />
      <div className="mt-4 space-y-3 text-sm">
        <div className="flex items-center justify-between gap-3">
          <span>Defect found?</span>
          <YesNo value={defectFound} onValue={setDefectFound} />
        </div>
        <div className="flex items-center justify-between gap-3">
          <span>Color matches listing photo?</span>
          <YesNo value={colorMatch} onValue={setColorMatch} />
        </div>
        <div className="flex items-center justify-between gap-3">
          <span>Fabric authenticity spot-check</span>
          <div className="flex gap-1.5">
            {(['yes', 'no', 'not_checked'] as FabricCheck[]).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setFabricCheck(v)}
                className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
                  fabricCheck === v ? 'bg-primary text-primary-foreground' : 'bg-muted/50 text-muted-foreground hover:bg-muted'
                }`}
              >
                {v === 'not_checked' ? 'Not checked' : v === 'yes' ? 'Pass' : 'Fail'}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
          <span className="font-medium text-amber-900">Vendor tag removed &amp; Aruhi tag attached?</span>
          <YesNo value={tagRemoved} onValue={setTagRemoved} />
        </div>
        <Textarea
          placeholder="Condition notes (optional)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="text-sm"
        />
        {willHold && (
          <p className="flex items-center gap-1.5 text-xs text-red-600">
            <ShieldAlert className="h-3.5 w-3.5" /> This will move the item to Quality Hold.
            {defectFound && ' A defect marks pickup-leg damage as the vendor\u2019s liability.'}
          </p>
        )}
        <Button size="sm" className="w-full" onClick={submit} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-1 h-4 w-4" />}
          Submit Quality Check
        </Button>
      </div>
    </div>
  );
}

function HoldCard({
  item,
  onChange,
}: {
  item: AdminFulfillmentItem;
  onChange: (updated: AdminFulfillmentItem) => void;
}) {
  const [busy, setBusy] = useState(false);

  const release = async () => {
    setBusy(true);
    try {
      const updated = await releaseQualityHold(item.id);
      onChange(updated);
      toast.success('Sent back for a re-check');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to release hold');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border border-red-200 bg-red-50/40 p-4">
      <ItemHeader item={item} />
      <div className="mt-3 space-y-1 text-xs text-red-800">
        {item.qc_defect_found && <p>• Defect found (liability: vendor)</p>}
        {item.qc_color_match === false && <p>• Color does not match listing photo</p>}
        {item.qc_tag_removed === false && <p>• Vendor tag not removed</p>}
        {item.qc_condition_notes && <p>Notes: {item.qc_condition_notes}</p>}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        No automated return-to-vendor flow yet — resolve this manually (e.g. contact the vendor), then send it back
        for a re-check.
      </p>
      <Button size="sm" variant="outline" className="mt-3" onClick={release} disabled={busy}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Release Hold — Re-check
      </Button>
    </div>
  );
}

function PackCard({
  item,
  onChange,
}: {
  item: AdminFulfillmentItem;
  onChange: (updated: AdminFulfillmentItem) => void;
}) {
  const [busy, setBusy] = useState(false);

  const handlePhoto = async (file: File) => {
    setBusy(true);
    try {
      const url = await uploadAdminFulfillmentPhoto(file);
      const updated = await packOrderItem(item.id, url);
      onChange(updated);
      toast.success('Marked packed — ready to ship');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to pack item');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border border-border/60 bg-card p-4">
      <ItemHeader item={item} />
      <div className="mt-3 flex items-center gap-1.5 text-xs text-green-700">
        <Check className="h-3.5 w-3.5" /> QC passed, tag removed
      </div>
      <div className="mt-3">
        <PhotoUploadButton label="Upload Final Packed Photo & Mark Packed" busy={busy} onFile={handlePhoto} />
      </div>
    </div>
  );
}

function ShipCard({
  item,
  onChange,
}: {
  item: AdminFulfillmentItem;
  onChange: (updated: AdminFulfillmentItem) => void;
}) {
  const [courier, setCourier] = useState('');
  const [tracking, setTracking] = useState('');
  const [busy, setBusy] = useState(false);

  const addr = item.shipping_address;
  const addrLine = [addr?.address, addr?.address2, addr?.city, addr?.state, addr?.pincode]
    .filter(Boolean)
    .join(', ');

  const submit = async () => {
    setBusy(true);
    try {
      const updated = await shipOrderItem(item.id, { courier_name: courier.trim(), tracking_number: tracking.trim() });
      onChange(updated);
      toast.success('Marked shipped to customer');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to mark shipped');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border border-border/60 bg-card p-4">
      <ItemHeader item={item} />
      <div className="mt-3 rounded-md border border-border/60 bg-muted/30 p-2.5 text-xs">
        <p className="font-medium text-foreground">{item.customer_name || 'Customer'}</p>
        <p className="text-muted-foreground">{item.customer_phone}</p>
        <p className="text-muted-foreground">{addrLine || 'Address on file with the order'}</p>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Book the second leg (warehouse → customer) manually via the courier&apos;s own site/app, then record it here.
      </p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <Input placeholder="Courier name" value={courier} onChange={(e) => setCourier(e.target.value)} className="h-9 text-sm" />
        <Input placeholder="Tracking / AWB number" value={tracking} onChange={(e) => setTracking(e.target.value)} className="h-9 text-sm" />
      </div>
      <Button size="sm" className="mt-3 w-full" onClick={submit} disabled={busy || !courier.trim() || !tracking.trim()}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShipIcon className="mr-1 h-4 w-4" />}
        Mark Shipped to Customer
      </Button>
    </div>
  );
}

function ShippedCard({ item }: { item: AdminFulfillmentItem }) {
  return (
    <div className="rounded-lg border border-border/60 bg-card p-4">
      <ItemHeader item={item} />
      <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Truck className="h-3.5 w-3.5" />
        {item.shipped_courier_name} · {item.shipped_tracking_number}
      </div>
      {item.liability && (
        <p className="mt-1 text-xs text-muted-foreground">
          Liability from here: <span className="font-medium">{item.liability}</span>
        </p>
      )}
    </div>
  );
}

export default function FulfillmentPanel() {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<AdminFulfillmentItem[]>([]);
  const [activeTab, setActiveTab] = useState<TabKey>('receiving');
  const [pendingBarcode, setPendingBarcode] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const rows = await fetchAdminFulfillmentQueue();
      setItems(rows);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load the fulfillment queue');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const updateItem = (updated: AdminFulfillmentItem) => {
    setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
  };

  const receiving = useMemo(() => items.filter((i) => i.stage === 'picked_from_vendor'), [items]);
  const qcPending = useMemo(
    () => items.filter((i) => i.stage === 'received_at_warehouse' && !i.qc_checked_at),
    [items]
  );
  const readyToPack = useMemo(
    () => items.filter((i) => i.stage === 'received_at_warehouse' && !!i.qc_checked_at),
    [items]
  );
  const onHold = useMemo(() => items.filter((i) => i.stage === 'quality_hold'), [items]);
  const readyToShip = useMemo(() => items.filter((i) => i.stage === 'packed'), [items]);
  const shipped = useMemo(
    () => items.filter((i) => i.stage === 'shipped_to_customer' || i.stage === 'delivered'),
    [items]
  );

  const counts: Record<TabKey, number> = {
    receiving: receiving.length,
    qc: qcPending.length,
    hold: onHold.length,
    pack: readyToPack.length,
    ship: readyToShip.length,
    shipped: shipped.length,
  };

  const handleBarcodeSubmit = (code: string) => {
    const match = receiving.find((i) => i.barcode === code);
    if (!match) {
      toast.error(`No item awaiting receipt with barcode "${code}"`);
      return;
    }
    toast.success(`Found "${match.product_name}" — upload the receiving photo below to confirm`);
    // Scroll the matching card into view for convenience.
    document.getElementById(`receiving-${match.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  return (
    <div>
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-secondary">Admin</p>
        <h1 className="mt-1 font-serif text-3xl font-bold text-primary sm:text-4xl">Stock Receiving &amp; Fulfillment</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Receive vendor-sourced stock, run quality checks, remove vendor tags, then pack and ship to the customer.
        </p>
      </div>

      <div className="mb-5 flex flex-wrap gap-2 border-b border-border/60 pb-3">
        {TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setActiveTab(tab.value)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
              activeTab === tab.value
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted/50 text-muted-foreground hover:bg-muted'
            }`}
          >
            {tab.label} ({counts[tab.value]})
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-10 text-center">
          <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" />
        </div>
      ) : (
        <div className="space-y-3">
          {activeTab === 'receiving' && (
            <>
              <BarcodeScanInput onSubmit={handleBarcodeSubmit} busy={pendingBarcode} />
              {receiving.length === 0 ? (
                <EmptyState icon={PackageSearch} text="Nothing awaiting receipt right now." />
              ) : (
                receiving.map((item) => (
                  <div id={`receiving-${item.id}`} key={item.id}>
                    <ReceivingCard item={item} onChange={updateItem} />
                  </div>
                ))
              )}
            </>
          )}

          {activeTab === 'qc' &&
            (qcPending.length === 0 ? (
              <EmptyState icon={ShieldCheck} text="No items waiting on a quality check." />
            ) : (
              qcPending.map((item) => <QcCard key={item.id} item={item} onChange={updateItem} />)
            ))}

          {activeTab === 'hold' &&
            (onHold.length === 0 ? (
              <EmptyState icon={ShieldAlert} text="Nothing on quality hold." />
            ) : (
              onHold.map((item) => <HoldCard key={item.id} item={item} onChange={updateItem} />)
            ))}

          {activeTab === 'pack' &&
            (readyToPack.length === 0 ? (
              <EmptyState icon={Box} text="Nothing ready to pack yet." />
            ) : (
              readyToPack.map((item) => <PackCard key={item.id} item={item} onChange={updateItem} />)
            ))}

          {activeTab === 'ship' &&
            (readyToShip.length === 0 ? (
              <EmptyState icon={ShipIcon} text="Nothing ready to ship yet." />
            ) : (
              readyToShip.map((item) => <ShipCard key={item.id} item={item} onChange={updateItem} />)
            ))}

          {activeTab === 'shipped' &&
            (shipped.length === 0 ? (
              <EmptyState icon={Truck} text="Nothing shipped yet." />
            ) : (
              shipped.map((item) => <ShippedCard key={item.id} item={item} />)
            ))}
        </div>
      )}
    </div>
  );
}

function EmptyState({ icon: Icon, text }: { icon: typeof PackageSearch; text: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-card py-10 text-center text-sm text-muted-foreground">
      <Icon className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
      {text}
    </div>
  );
}
