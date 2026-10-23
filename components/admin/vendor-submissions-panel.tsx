'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { toast } from 'sonner';
import {
  PackageSearch,
  Clock,
  Warehouse,
  CheckCircle2,
  XCircle,
  Loader2,
  TrendingDown,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { formatINR } from '@/lib/format';
import {
  fetchAdminVendorProducts,
  rejectAdminVendorProduct,
  updateAdminVendorProductPrice,
  type AdminVendorProductRow,
  type VendorProductApprovalStatus,
} from '@/lib/vendor-api';

const STATUS_META: Record<
  VendorProductApprovalStatus,
  { label: string; icon: typeof Clock; className: string }
> = {
  draft: { label: 'Draft', icon: Clock, className: 'bg-muted text-muted-foreground' },
  pending_review: { label: 'Processing (AI)', icon: Clock, className: 'bg-amber-100 text-amber-700' },
  awaiting_stock: { label: 'Awaiting Stock (legacy)', icon: Warehouse, className: 'bg-blue-100 text-blue-700' },
  live: { label: 'Live', icon: CheckCircle2, className: 'bg-green-100 text-green-700' },
  rejected: { label: 'Rejected', icon: XCircle, className: 'bg-red-100 text-red-700' },
};

const TABS: { value: VendorProductApprovalStatus; label: string }[] = [
  { value: 'pending_review', label: 'Processing (AI)' },
  { value: 'awaiting_stock', label: 'Awaiting Stock (legacy)' },
  { value: 'live', label: 'Live' },
  { value: 'rejected', label: 'Rejected' },
];

export default function VendorSubmissionsPanel() {
  const [products, setProducts] = useState<AdminVendorProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<VendorProductApprovalStatus>('live');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [priceDraft, setPriceDraft] = useState<Record<string, string>>({});
  const [reasonDraft, setReasonDraft] = useState<Record<string, string>>({});

  const load = async () => {
    setLoading(true);
    try {
      const rows = await fetchAdminVendorProducts();
      setProducts(rows);
      setPriceDraft((prev) => {
        const next = { ...prev };
        for (const p of rows) {
          if (next[p.id] === undefined) {
            next[p.id] = p.final_price != null ? String(p.final_price) : '';
          }
        }
        return next;
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load vendor submissions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const listForTab = useMemo(
    () => products.filter((p) => p.approval_status === activeTab),
    [products, activeTab]
  );

  const counts = useMemo(() => {
    const c: Record<VendorProductApprovalStatus, number> = {
      draft: 0,
      pending_review: 0,
      awaiting_stock: 0,
      live: 0,
      rejected: 0,
    };
    for (const p of products) c[p.approval_status]++;
    return c;
  }, [products]);

  const handleReject = async (p: AdminVendorProductRow) => {
    const reason = (reasonDraft[p.id] || '').trim();
    if (!reason) {
      toast.error('A rejection reason is required');
      return;
    }
    setBusyId(p.id);
    try {
      await rejectAdminVendorProduct(p.id, reason);
      toast.success(`${p.name} rejected`);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to reject product');
    } finally {
      setBusyId(null);
    }
  };

  const handleSavePrice = async (p: AdminVendorProductRow) => {
    const raw = priceDraft[p.id];
    const final_price = Number(raw);
    if (!Number.isFinite(final_price) || final_price < 0) {
      toast.error('Enter a valid final price');
      return;
    }
    setBusyId(p.id);
    try {
      // Its own action (never bundled with approve/reject) so a price
      // tweak on an already-approved row never silently changes
      // approval_status.
      await updateAdminVendorProductPrice(p.id, final_price);
      toast.success('Price updated');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update price');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-secondary">Admin</p>
          <h1 className="mt-1 font-serif text-3xl font-bold text-primary sm:text-4xl">Vendor Submissions</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Products submitted by vendors — AI writes the full listing and publishes it live automatically, no manual approval needed. You can reject a submission any time if something's wrong.
          </p>
        </div>
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
      ) : listForTab.length === 0 ? (
        <div className="rounded-lg border border-border/60 bg-card py-10 text-center text-sm text-muted-foreground">
          <PackageSearch className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
          Nothing here.
        </div>
      ) : (
        <div className="space-y-3">
          {listForTab.map((p) => {
            const meta = STATUS_META[p.approval_status];
            const StatusIcon = meta.icon;
            const editable = p.approval_status === 'pending_review' || p.approval_status === 'awaiting_stock';
            return (
              <div key={p.id} className="rounded-lg border border-border/60 bg-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="relative h-16 w-14 shrink-0 overflow-hidden rounded-md bg-muted">
                      <Image
                        src={p.images[0] || 'https://placehold.co/56x64?text=No+Image'}
                        alt={p.name}
                        fill
                        sizes="56px"
                        className="object-cover"
                      />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-serif text-lg font-semibold text-primary">{p.name}</p>
                        <Badge className={`flex w-fit items-center gap-1 ${meta.className}`}>
                          <StatusIcon className="h-3 w-3" /> {meta.label}
                        </Badge>
                        {p.is_dead_stock && (
                          <Badge variant="outline" className="flex items-center gap-1 text-xs">
                            <TrendingDown className="h-3 w-3" /> Dead stock
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {p.category_name || '—'} · {p.fabric || '—'} · Qty {p.available_quantity}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        <span className="font-medium text-foreground">
                          {p.vendors?.business_name || '—'}
                        </span>
                        {p.vendors?.phone ? ` · ${p.vendors.phone}` : ''}
                        {p.vendor_edit_count != null && p.vendor_edit_count > 0 && (
                          <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                            Edited {p.vendor_edit_count}×
                          </span>
                        )}
                      </p>
                      {p.barcode && (
                        <p className="mt-1 font-mono text-xs text-muted-foreground">{p.barcode}</p>
                      )}
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-1 text-sm">
                    {p.vendor_expected_price != null && (
                      <p className="text-muted-foreground">
                        Vendor asked: <span className="font-medium text-foreground">{formatINR(p.vendor_expected_price)}</span>
                      </p>
                    )}
                    {p.ai_suggested_price != null && (
                      <p className="flex items-center gap-1 text-muted-foreground">
                        <Sparkles className="h-3.5 w-3.5" /> AI suggests:{' '}
                        <span className="font-medium text-foreground">{formatINR(p.ai_suggested_price)}</span>
                      </p>
                    )}
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-end gap-2">
                  <div className="grid gap-1">
                    <label htmlFor={`final-price-${p.id}`} className="text-xs font-medium text-muted-foreground">
                      Final price
                    </label>
                    <div className="flex items-center gap-2">
                      <Input
                        id={`final-price-${p.id}`}
                        type="number"
                        min={0}
                        step="0.01"
                        disabled={!editable}
                        value={priceDraft[p.id] ?? ''}
                        onChange={(e) => setPriceDraft((d) => ({ ...d, [p.id]: e.target.value }))}
                        className="w-32"
                      />
                      {editable && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busyId === p.id}
                          onClick={() => handleSavePrice(p)}
                        >
                          Save
                        </Button>
                      )}
                    </div>
                  </div>
                </div>

                {p.approval_status === 'pending_review' && (
                  <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                    AI is generating this listing now — it'll go live automatically within a minute or two, no action needed here. You can still reject it below if something's wrong.
                  </div>
                )}

                {p.approval_status !== 'rejected' && (
                  <div className="mt-3 space-y-2">
                    <textarea
                      placeholder="Rejection reason (required only if rejecting)"
                      className="w-full rounded-md border border-border/60 p-2 text-sm"
                      rows={2}
                      value={reasonDraft[p.id] || ''}
                      onChange={(e) => setReasonDraft((d) => ({ ...d, [p.id]: e.target.value }))}
                    />
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={busyId === p.id}
                      onClick={() => handleReject(p)}
                    >
                      {busyId === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Reject'}
                    </Button>
                  </div>
                )}

                {p.approval_status === 'rejected' && p.rejection_reason && (
                  <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                    <p className="font-medium">Rejection reason</p>
                    <p className="mt-0.5">{p.rejection_reason}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
