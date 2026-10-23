'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAdminFocus } from './use-admin-focus';
import { toast } from 'sonner';
import {
  Truck,
  CheckCircle2,
  XCircle,
  Ban,
  Clock,
  Landmark,
  Loader2,
  UserX,
  FileText,
  ChevronDown,
  ChevronUp,
  Eye,
  Store,
  ExternalLink,
  TimerReset,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  fetchAdminVendors,
  updateAdminVendorStatus,
  updateAdminVendorShowRating,
  reviewAdminVendorBankUpdate,
  closeVendorAccount,
  fetchAdminVendorKyc,
  reviewAdminVendorKyc,
  type AdminVendorRow,
  type VendorKycDocument,
} from '@/lib/vendor-api';

const KYC_DOC_LABELS: Record<VendorKycDocument['doc_type'], string> = {
  pan_card: 'PAN Card',
  gst_certificate: 'GST Certificate',
  bank_proof: 'Bank Proof',
};

const KYC_STATUS_META: Record<VendorKycDocument['status'], { label: string; className: string }> = {
  pending: { label: 'Pending', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  verified: { label: 'Verified', className: 'bg-green-50 text-green-700 border-green-200' },
  rejected: { label: 'Rejected', className: 'bg-red-50 text-red-700 border-red-200' },
};

// Phase 5A — inline "View KYC Documents" toggle on each vendor card.
// Docs are fetched on demand (not preloaded for every vendor) since
// each one requires minting fresh signed URLs server-side.
function VendorKycSection({ vendorId }: { vendorId: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [docs, setDocs] = useState<VendorKycDocument[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      setDocs(await fetchAdminVendorKyc(vendorId));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load KYC documents');
    } finally {
      setLoading(false);
    }
  };

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && docs.length === 0) load();
  };

  const handleReview = async (doc: VendorKycDocument, action: 'verify' | 'reject') => {
    setBusyId(doc.id);
    try {
      const updated = await reviewAdminVendorKyc(doc.id, action);
      setDocs((prev) => prev.map((d) => (d.id === doc.id ? { ...d, ...updated } : d)));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to review document');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mt-3">
      <button
        onClick={toggle}
        className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
      >
        <FileText className="h-3.5 w-3.5" />
        KYC Documents
        {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>

      {open && (
        <div className="mt-2 space-y-2">
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : docs.length === 0 ? (
            <p className="text-xs text-muted-foreground">No documents uploaded yet.</p>
          ) : (
            docs.map((doc) => {
              const meta = KYC_STATUS_META[doc.status];
              return (
                <div
                  key={doc.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/60 bg-muted/20 p-2"
                >
                  <div className="text-xs">
                    <span className="font-medium text-primary">{KYC_DOC_LABELS[doc.doc_type]}</span>{' '}
                    <Badge variant="outline" className={meta.className}>
                      {meta.label}
                    </Badge>
                    <p className="mt-0.5 text-muted-foreground">
                      {doc.original_filename} · {new Date(doc.uploaded_at).toLocaleDateString('en-IN')}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {doc.url && (
                      <a
                        href={doc.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                      >
                        <Eye className="h-3.5 w-3.5" /> View
                      </a>
                    )}
                    {doc.status !== 'verified' && (
                      <Button
                        size="sm"
                        className="h-7 bg-primary px-2 text-xs"
                        disabled={busyId === doc.id}
                        onClick={() => handleReview(doc, 'verify')}
                      >
                        Verify
                      </Button>
                    )}
                    {doc.status !== 'rejected' && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-xs"
                        disabled={busyId === doc.id}
                        onClick={() => handleReview(doc, 'reject')}
                      >
                        Reject
                      </Button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

const STATUS_META: Record<
  AdminVendorRow['status'],
  { label: string; icon: typeof Clock; className: string }
> = {
  pending: { label: 'Pending', icon: Clock, className: 'bg-amber-100 text-amber-700' },
  approved: { label: 'Approved', icon: CheckCircle2, className: 'bg-green-100 text-green-700' },
  rejected: { label: 'Rejected', icon: XCircle, className: 'bg-red-100 text-red-700' },
  suspended: { label: 'Suspended', icon: Ban, className: 'bg-red-100 text-red-700' },
};

const TABS: { value: AdminVendorRow['status'] | 'bank_requests'; label: string }[] = [
  { value: 'pending', label: 'Pending Applications' },
  { value: 'approved', label: 'Approved' },
  { value: 'bank_requests', label: 'Bank Update Requests' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'suspended', label: 'Suspended' },
];

export default function VendorsPanel() {
  const [vendors, setVendors] = useState<AdminVendorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<(typeof TABS)[number]['value']>('pending');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState<Record<string, string>>({});
  const [closeAccountTarget, setCloseAccountTarget] = useState<AdminVendorRow | null>(null);
  const [closing, setClosing] = useState(false);

  // Bell deep link: jump to the tab the vendor currently sits in
  // (Pending Applications / Approved / ...) and highlight their card.
  const focusId = useAdminFocus(!loading && vendors.length > 0);
  useEffect(() => {
    if (!focusId) return;
    const target = vendors.find((x) => x.id === focusId);
    if (target) setActiveTab(target.status);
  }, [focusId, vendors]);

  const load = async () => {
    setLoading(true);
    try {
      const rows = await fetchAdminVendors();
      setVendors(rows);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load vendors');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const bankRequestVendors = useMemo(() => vendors.filter((v) => v.pending_bank_update), [vendors]);
  const listForTab = activeTab === 'bank_requests' ? bankRequestVendors : vendors.filter((v) => v.status === activeTab);

  const handleStatusChange = async (
    v: AdminVendorRow,
    status: 'approved' | 'rejected' | 'suspended' | 'pending'
  ) => {
    setBusyId(v.id);
    try {
      const note = noteDraft[v.id];
      await updateAdminVendorStatus(v.id, status, note);
      toast.success(`Vendor ${status}`);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update vendor');
    } finally {
      setBusyId(null);
    }
  };

  const handleBankReview = async (v: AdminVendorRow, action: 'approve' | 'reject') => {
    setBusyId(v.id);
    try {
      await reviewAdminVendorBankUpdate(v.id, action);
      toast.success(action === 'approve' ? 'Bank details updated' : 'Request rejected');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to review request');
    } finally {
      setBusyId(null);
    }
  };

  // Public collection page (/collection/[slug]) rating/review summary toggle.
  // Optimistic update — the switch flips immediately, then reverts with
  // a toast if the request fails.
  const handleToggleShowRating = async (v: AdminVendorRow, next: boolean) => {
    setVendors((prev) => prev.map((x) => (x.id === v.id ? { ...x, show_public_rating: next } : x)));
    try {
      await updateAdminVendorShowRating(v.id, next);
    } catch (err) {
      setVendors((prev) => prev.map((x) => (x.id === v.id ? { ...x, show_public_rating: !next } : x)));
      toast.error(err instanceof Error ? err.message : 'Failed to update vendor');
    }
  };

  // Phase 4C, point 5 — full off-boarding: return stock immediately
  // (skips the 90/60-day timers), finalize any pending settlement, then
  // suspend. Distinct from the plain "Suspend" button below, which only
  // flips status and leaves stock/settlement untouched.
  const handleCloseAccount = async () => {
    if (!closeAccountTarget) return;
    setClosing(true);
    try {
      const result = await closeVendorAccount(closeAccountTarget.id);
      toast.success(
        `Vendor account closed. ${result.products_flagged} product(s) sent to Return to Vendor` +
          (result.final_settlement_amount != null
            ? `, final settlement ₹${result.final_settlement_amount} created.`
            : '.')
      );
      setCloseAccountTarget(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to close vendor account');
    } finally {
      setClosing(false);
    }
  };

  const counts = useMemo(
    () => ({
      pending: vendors.filter((v) => v.status === 'pending').length,
      approved: vendors.filter((v) => v.status === 'approved').length,
      rejected: vendors.filter((v) => v.status === 'rejected').length,
      suspended: vendors.filter((v) => v.status === 'suspended').length,
      bank_requests: bankRequestVendors.length,
    }),
    [vendors, bankRequestVendors]
  );

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-secondary">Admin</p>
          <h1 className="mt-1 font-serif text-3xl font-bold text-primary sm:text-4xl">Vendors</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Approved vendors get a public collection page at /collection/[slug], linked from their
            products as "&lt;Vendor&gt;'s Collection". Toggle the rating summary per vendor below.
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
          <Truck className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
          Nothing here.
        </div>
      ) : (
        <div className="space-y-3">
          {listForTab.map((v) => {
            const meta = STATUS_META[v.status];
            const StatusIcon = meta.icon;
            return (
              <div key={v.id} data-focus-id={v.id} className="rounded-lg border border-border/60 bg-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-serif text-lg font-semibold text-primary">{v.business_name}</p>
                      <Badge className={`flex w-fit items-center gap-1 ${meta.className}`}>
                        <StatusIcon className="h-3 w-3" /> {meta.label}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {v.owner_name} · {v.phone} {v.whatsapp ? `· WA: ${v.whatsapp}` : ''}
                    </p>
                    <p className="text-sm text-muted-foreground">{v.email}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      PAN: {v.pan_number} {v.gst_number ? `· GST: ${v.gst_number}` : ''}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">Pickup: {v.pickup_address}</p>
                    {(v.city || v.state || v.pincode) && (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {[v.city, v.state, v.pincode].filter(Boolean).join(' · ')}
                      </p>
                    )}
                    {v.expected_category && (
                      <p className="mt-1 text-xs text-muted-foreground">Category: {v.expected_category}</p>
                    )}
                    {v.status === 'approved' && (
                      <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                        <TimerReset className="h-3 w-3" />
                        Stock hold window: <span className="font-medium text-foreground">{v.stock_hold_days ?? 15} din</span>{' '}
                        (vendor-set, 15–30 range)
                      </p>
                    )}
                    <VendorKycSection vendorId={v.id} />

                    {v.status === 'approved' && v.storefront_slug && (
                      <div className="mt-3 flex flex-wrap items-center gap-3 rounded-md border border-border/60 bg-muted/20 p-2.5">
                        <a
                          href={`/collection/${v.storefront_slug}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                        >
                          <Store className="h-3.5 w-3.5" />
                          View public collection
                          <ExternalLink className="h-3 w-3" />
                        </a>
                        <div className="flex items-center gap-2">
                          <Switch
                            id={`show-rating-${v.id}`}
                            checked={v.show_public_rating}
                            onCheckedChange={(checked) => handleToggleShowRating(v, checked)}
                          />
                          <Label htmlFor={`show-rating-${v.id}`} className="text-xs text-muted-foreground">
                            Show rating/reviews on storefront
                          </Label>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {activeTab === 'bank_requests' && v.pending_bank_update ? (
                  <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm">
                    <p className="flex items-center gap-1.5 font-medium text-amber-800">
                      <Landmark className="h-4 w-4" /> Requested bank details
                    </p>
                    <p className="mt-1 font-mono text-amber-900">
                      A/C: {v.pending_bank_update.bank_account_number} · IFSC: {v.pending_bank_update.bank_ifsc}
                      {v.pending_bank_update.upi_id ? ` · UPI: ${v.pending_bank_update.upi_id}` : ''}
                    </p>
                    <p className="mt-1 text-xs text-amber-700">
                      Requested {new Date(v.pending_bank_update.requested_at).toLocaleString('en-IN')}
                    </p>
                    <div className="mt-3 flex gap-2">
                      <Button
                        size="sm"
                        className="bg-primary"
                        disabled={busyId === v.id}
                        onClick={() => handleBankReview(v, 'approve')}
                      >
                        Verify &amp; Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busyId === v.id}
                        onClick={() => handleBankReview(v, 'reject')}
                      >
                        Reject
                      </Button>
                    </div>
                  </div>
                ) : null}

                {activeTab === 'pending' && (
                  <div className="mt-3 space-y-2">
                    <textarea
                      placeholder="Optional note (shown to vendor, e.g. rejection reason)"
                      className="w-full rounded-md border border-border/60 p-2 text-sm"
                      rows={2}
                      value={noteDraft[v.id] || ''}
                      onChange={(e) => setNoteDraft((d) => ({ ...d, [v.id]: e.target.value }))}
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="bg-primary"
                        disabled={busyId === v.id}
                        onClick={() => handleStatusChange(v, 'approved')}
                      >
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={busyId === v.id}
                        onClick={() => handleStatusChange(v, 'rejected')}
                      >
                        Reject
                      </Button>
                    </div>
                  </div>
                )}

                {activeTab === 'approved' && (
                  <div className="mt-3 flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busyId === v.id}
                      onClick={() => handleStatusChange(v, 'suspended')}
                    >
                      Suspend
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={busyId === v.id}
                      onClick={() => setCloseAccountTarget(v)}
                    >
                      <UserX className="mr-1 h-4 w-4" /> Close Vendor Account
                    </Button>
                  </div>
                )}

                {activeTab === 'suspended' && (
                  <div className="mt-3">
                    <Button
                      size="sm"
                      className="bg-primary"
                      disabled={busyId === v.id}
                      onClick={() => handleStatusChange(v, 'approved')}
                    >
                      Reinstate
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <AlertDialog open={!!closeAccountTarget} onOpenChange={(open) => !open && setCloseAccountTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Close {closeAccountTarget?.business_name}'s vendor account?</AlertDialogTitle>
            <AlertDialogDescription>
              This is irreversible from here. It will immediately: send every awaiting-stock/live
              product to the Return to Vendor list (skipping the 90/60-day timers), finalize any
              pending settlement as a Final Settlement, and suspend the vendor's dashboard access.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={closing}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={closing} onClick={handleCloseAccount}>
              {closing ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
              Yes, close account
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
