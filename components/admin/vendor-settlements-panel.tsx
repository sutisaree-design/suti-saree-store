'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Download, Landmark } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { formatINR } from '@/lib/format';
import {
  fetchAdminSettlements,
  markSettlementPaid,
  type VendorSettlementRow,
} from '@/lib/vendor-api';

const STATUS_META: Record<VendorSettlementRow['status'], { label: string; className: string }> = {
  pending: { label: 'Pending', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  paid: { label: 'Paid', className: 'bg-green-50 text-green-700 border-green-200' },
};

const TABS: { value: 'pending' | 'paid' | 'all'; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'paid', label: 'Paid' },
  { value: 'all', label: 'All' },
];

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function VendorSettlementsPanel() {
  const [settlements, setSettlements] = useState<VendorSettlementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<(typeof TABS)[number]['value']>('pending');

  const [payTarget, setPayTarget] = useState<VendorSettlementRow | null>(null);
  const [paymentReference, setPaymentReference] = useState('');
  const [paidDate, setPaidDate] = useState(todayISO());
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const rows = await fetchAdminSettlements();
      setSettlements(rows);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load settlements');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(
    () => (tab === 'all' ? settlements : settlements.filter((s) => s.status === tab)),
    [settlements, tab]
  );

  const counts = useMemo(
    () => ({
      pending: settlements.filter((s) => s.status === 'pending').length,
      paid: settlements.filter((s) => s.status === 'paid').length,
      all: settlements.length,
    }),
    [settlements]
  );

  const openPayDialog = (row: VendorSettlementRow) => {
    setPayTarget(row);
    setPaymentReference('');
    setPaidDate(todayISO());
  };

  const confirmPay = async () => {
    if (!payTarget) return;
    if (!paymentReference.trim()) {
      toast.error('Payment reference is required');
      return;
    }
    setSaving(true);
    try {
      const updated = await markSettlementPaid(payTarget.id, paymentReference.trim(), paidDate);
      setSettlements((prev) => prev.map((s) => (s.id === updated.id ? { ...s, ...updated } : s)));
      toast.success('Settlement marked as paid');
      setPayTarget(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to mark as paid');
    } finally {
      setSaving(false);
    }
  };

  const exportCsv = () => {
    const header = [
      'Vendor',
      'Week Start',
      'Week End',
      'Total Amount',
      'Clawback Deducted',
      'Status',
      'Payment Reference',
      'Paid Date',
    ];
    const rows = filtered.map((s) => [
      s.vendor_name || '',
      s.week_start,
      s.week_end,
      s.total_amount,
      s.clawback_deducted,
      s.status,
      s.payment_reference || '',
      s.paid_date || '',
    ]);
    const csv = [header, ...rows]
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vendor-settlements-${tab}-${todayISO()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          {TABS.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setTab(t.value)}
              className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                tab === t.value
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border text-muted-foreground hover:bg-accent'
              }`}
            >
              {t.label} ({counts[t.value]})
            </button>
          ))}
        </div>
        <Button variant="outline" size="sm" className="gap-2" onClick={exportCsv} disabled={!filtered.length}>
          <Download className="h-4 w-4" />
          Export CSV
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No {tab === 'all' ? '' : tab} settlements right now.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Vendor</th>
                <th className="px-3 py-2">Week</th>
                <th className="px-3 py-2">Amount</th>
                <th className="px-3 py-2">Clawback</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Payment Ref.</th>
                <th className="px-3 py-2">Paid On</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((s) => {
                const meta = STATUS_META[s.status];
                return (
                  <tr key={s.id}>
                    <td className="whitespace-nowrap px-3 py-2 font-medium">{s.vendor_name}</td>
                    <td className="whitespace-nowrap px-3 py-2">
                      {new Date(s.week_start).toLocaleDateString('en-IN')} –{' '}
                      {new Date(s.week_end).toLocaleDateString('en-IN')}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 font-medium">{formatINR(s.total_amount)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                      {s.clawback_deducted > 0 ? `− ${formatINR(s.clawback_deducted)}` : '—'}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      <Badge variant="outline" className={meta.className}>
                        {meta.label}
                      </Badge>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                      {s.payment_reference || '—'}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                      {s.paid_date ? new Date(s.paid_date).toLocaleDateString('en-IN') : '—'}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right">
                      {s.status === 'pending' && (
                        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => openPayDialog(s)}>
                          <Landmark className="h-3.5 w-3.5" />
                          Mark as Paid
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={!!payTarget} onOpenChange={(open) => !open && setPayTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark Settlement as Paid</DialogTitle>
          </DialogHeader>
          {payTarget && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {payTarget.vendor_name} — {formatINR(payTarget.total_amount)} for the week of{' '}
                {new Date(payTarget.week_start).toLocaleDateString('en-IN')}
              </p>
              <div>
                <Label htmlFor="payment-reference">Payment Reference *</Label>
                <Input
                  id="payment-reference"
                  value={paymentReference}
                  onChange={(e) => setPaymentReference(e.target.value)}
                  placeholder="UTR / transaction ID"
                />
              </div>
              <div>
                <Label htmlFor="paid-date">Paid Date</Label>
                <Input
                  id="paid-date"
                  type="date"
                  value={paidDate}
                  onChange={(e) => setPaidDate(e.target.value)}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayTarget(null)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={confirmPay} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirm Paid'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
