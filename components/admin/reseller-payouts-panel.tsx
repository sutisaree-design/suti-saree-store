'use client';

import { useEffect, useState } from 'react';
import { IndianRupee, Clock, CheckCircle2, Wallet, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatINR } from '@/lib/format';
import {
  fetchAdminResellerPayouts,
  markResellerPayoutPaid,
  type AdminResellerPayoutRow,
  type AdminPayoutHistoryRow,
} from '@/lib/reseller-api';

export default function ResellerPayoutsPanel() {
  const [resellers, setResellers] = useState<AdminResellerPayoutRow[]>([]);
  const [history, setHistory] = useState<AdminPayoutHistoryRow[]>([]);
  const [totals, setTotals] = useState({ pendingDelivery: 0, inReturnWindow: 0, eligible: 0, paid: 0 });
  const [loading, setLoading] = useState(true);
  const [payoutTarget, setPayoutTarget] = useState<AdminResellerPayoutRow | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const overview = await fetchAdminResellerPayouts();
      setResellers(overview.resellers);
      setHistory(overview.payoutHistory);
      setTotals(overview.totals);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load payouts');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div>
      <p className="mb-4 max-w-2xl text-sm text-muted-foreground">
        A reseller's margin only becomes payable once their order is{' '}
        <strong>delivered</strong> and the store's <strong>return window has passed</strong> —
        it moves here automatically. If an order comes back RTO, gets cancelled, refunded, or
        the customer files a return during that window, it's voided instead of paid.
      </p>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-border/60 bg-card p-4">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <p className="mt-2 text-xl font-bold text-primary">{formatINR(totals.pendingDelivery)}</p>
          <p className="text-xs text-muted-foreground">Awaiting delivery (not owed yet)</p>
        </div>
        <div className="rounded-lg border border-orange-300 bg-orange-50 p-4">
          <Clock className="h-4 w-4 text-orange-700" />
          <p className="mt-2 text-xl font-bold text-orange-700">{formatINR(totals.inReturnWindow)}</p>
          <p className="text-xs text-orange-700">Delivered — in return window</p>
        </div>
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4">
          <IndianRupee className="h-4 w-4 text-amber-700" />
          <p className="mt-2 text-xl font-bold text-amber-700">{formatINR(totals.eligible)}</p>
          <p className="text-xs text-amber-700">Return window passed — ready to pay</p>
        </div>
        <div className="rounded-lg border border-green-300 bg-green-50 p-4">
          <CheckCircle2 className="h-4 w-4 text-green-700" />
          <p className="mt-2 text-xl font-bold text-green-700">{formatINR(totals.paid)}</p>
          <p className="text-xs text-green-700">Already paid out</p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border/60 bg-card">
        <table className="w-full table-auto">
          <thead className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Reseller</th>
              <th className="px-4 py-3">Payout details</th>
              <th className="px-4 py-3">Awaiting delivery</th>
              <th className="px-4 py-3">In return window</th>
              <th className="px-4 py-3">Ready to pay</th>
              <th className="px-4 py-3">Paid so far</th>
              <th className="px-4 py-3">Action</th>
            </tr>
          </thead>
          <tbody>
            {resellers.map((r) => (
              <tr key={r.id} className="border-t align-top">
                <td className="px-4 py-3 text-sm">
                  <p className="font-medium">{r.name}</p>
                  <p className="text-xs text-muted-foreground">{r.phone || '—'}</p>
                </td>
                <td className="px-4 py-3 text-sm">
                  {r.payoutUpiId ? (
                    <>
                      <p className="font-mono text-xs">{r.payoutUpiId}</p>
                      <p className="text-xs text-muted-foreground">{r.payoutAccountHolder || '—'}</p>
                    </>
                  ) : (
                    <span className="text-xs text-muted-foreground">Not set by reseller yet</span>
                  )}
                </td>
                <td className="px-4 py-3 text-sm">
                  {formatINR(r.pendingDeliveryAmount)}
                  {r.pendingDeliveryCount > 0 && (
                    <span className="ml-1 text-xs text-muted-foreground">({r.pendingDeliveryCount} order{r.pendingDeliveryCount === 1 ? '' : 's'})</span>
                  )}
                </td>
                <td className="px-4 py-3 text-sm">
                  <span className="font-semibold text-orange-700">{formatINR(r.inReturnWindowAmount)}</span>
                  {r.inReturnWindowCount > 0 && (
                    <span className="ml-1 text-xs text-muted-foreground">({r.inReturnWindowCount} order{r.inReturnWindowCount === 1 ? '' : 's'})</span>
                  )}
                </td>
                <td className="px-4 py-3 text-sm">
                  <span className="font-semibold text-amber-700">{formatINR(r.eligibleAmount)}</span>
                  {r.eligibleOrders.length > 0 && (
                    <span className="ml-1 text-xs text-muted-foreground">({r.eligibleOrders.length} order{r.eligibleOrders.length === 1 ? '' : 's'})</span>
                  )}
                </td>
                <td className="px-4 py-3 text-sm text-green-700">{formatINR(r.paidAmount)}</td>
                <td className="px-4 py-3 text-sm">
                  <Button
                    size="sm"
                    className="gap-1 bg-primary"
                    disabled={r.eligibleOrders.length === 0}
                    onClick={() => setPayoutTarget(r)}
                  >
                    <Wallet className="h-3.5 w-3.5" /> Pay Now
                  </Button>
                </td>
              </tr>
            ))}
            {!loading && resellers.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm text-muted-foreground">
                  No resellers yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <h2 className="mb-3 mt-8 font-serif text-lg font-semibold text-primary">Payout History</h2>
      <div className="overflow-x-auto rounded-lg border border-border/60 bg-card">
        <table className="w-full table-auto">
          <thead className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Reseller</th>
              <th className="px-4 py-3">Orders</th>
              <th className="px-4 py-3">Amount</th>
              <th className="px-4 py-3">Reference</th>
            </tr>
          </thead>
          <tbody>
            {history.map((h) => (
              <tr key={h.id} className="border-t">
                <td className="px-4 py-3 text-sm">{new Date(h.paidAt).toLocaleDateString('en-IN')}</td>
                <td className="px-4 py-3 text-sm">{h.resellerName}</td>
                <td className="px-4 py-3 text-sm">{h.orderCount}</td>
                <td className="px-4 py-3 text-sm font-semibold text-green-700">{formatINR(h.totalAmount)}</td>
                <td className="px-4 py-3 text-sm text-muted-foreground">{h.paymentReference || '—'}</td>
              </tr>
            ))}
            {!loading && history.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">
                  No payouts recorded yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {payoutTarget && (
        <PayoutModal
          reseller={payoutTarget}
          onClose={() => setPayoutTarget(null)}
          onPaid={() => {
            setPayoutTarget(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function PayoutModal({
  reseller,
  onClose,
  onPaid,
}: {
  reseller: AdminResellerPayoutRow;
  onClose: () => void;
  onPaid: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set(reseller.eligibleOrders.map((o) => o.id)));
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const selectedTotal = reseller.eligibleOrders
    .filter((o) => selected.has(o.id))
    .reduce((s, o) => s + o.resellerProfit, 0);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const submit = async () => {
    if (selected.size === 0) {
      toast.error('Select at least one order');
      return;
    }
    if (!reference.trim()) {
      toast.error('Enter a payment reference (UTR / transaction ID)');
      return;
    }
    setSaving(true);
    try {
      await markResellerPayoutPaid(reseller.id, Array.from(selected), reference.trim(), notes.trim() || undefined);
      toast.success('Payout recorded');
      onPaid();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to record payout');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-lg bg-background p-6 shadow-xl">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h3 className="font-serif text-lg font-semibold text-primary">Pay {reseller.name}</h3>
            {reseller.payoutUpiId ? (
              <p className="text-xs text-muted-foreground">
                Send to UPI <span className="font-mono">{reseller.payoutUpiId}</span>
                {reseller.payoutAccountHolder ? ` (${reseller.payoutAccountHolder})` : ''}
              </p>
            ) : (
              <p className="text-xs text-amber-600">This reseller hasn't set a UPI ID yet — confirm with them directly.</p>
            )}
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-56 space-y-2 overflow-y-auto rounded-md border border-border/50 p-2">
          {reseller.eligibleOrders.map((o) => (
            <label key={o.id} className="flex cursor-pointer items-center justify-between gap-2 rounded p-2 text-sm hover:bg-muted/40">
              <span className="flex items-center gap-2">
                <input type="checkbox" checked={selected.has(o.id)} onChange={() => toggle(o.id)} />
                <span>
                  {o.customerName || 'Order'}
                  <span className="ml-1 text-xs text-muted-foreground">
                    · delivered {o.deliveredAt ? new Date(o.deliveredAt).toLocaleDateString('en-IN') : '—'}
                  </span>
                </span>
              </span>
              <span className="font-medium text-amber-700">+{formatINR(o.resellerProfit)}</span>
            </label>
          ))}
        </div>

        <p className="mt-3 text-right text-sm">
          Total: <span className="text-lg font-bold text-primary">{formatINR(selectedTotal)}</span>
        </p>

        <div className="mt-4 space-y-3">
          <div>
            <Label className="text-sm">Payment reference (UTR / transaction ID)</Label>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. UTR1234567890" />
          </div>
          <div>
            <Label className="text-sm">Notes (optional)</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any note for your records" />
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button className="bg-primary" onClick={submit} disabled={saving || selected.size === 0}>
            {saving ? 'Recording…' : `Mark ${formatINR(selectedTotal)} as Paid`}
          </Button>
        </div>
      </div>
    </div>
  );
}
