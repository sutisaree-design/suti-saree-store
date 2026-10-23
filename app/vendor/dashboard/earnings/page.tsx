'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, IndianRupee, PiggyBank, Wallet, Clock3, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { formatINR } from '@/lib/format';
import {
  fetchMyVendorEarnings,
  type VendorEarningsSummary,
  type VendorSettlementRow,
} from '@/lib/vendor-api';

function SummaryCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof IndianRupee;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-2 flex items-center gap-2 text-muted-foreground">
        <Icon className="h-4 w-4" />
        <p className="text-xs font-medium uppercase tracking-wide">{label}</p>
      </div>
      <p className="font-serif text-2xl font-bold text-primary">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

const STATUS_META: Record<VendorSettlementRow['status'], { label: string; className: string }> = {
  pending: { label: 'Pending', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  paid: { label: 'Paid', className: 'bg-green-50 text-green-700 border-green-200' },
};

export default function VendorEarningsPage() {
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<VendorEarningsSummary | null>(null);
  const [settlements, setSettlements] = useState<VendorSettlementRow[]>([]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { summary, settlements } = await fetchMyVendorEarnings();
        setSummary(summary);
        setSettlements(settlements);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to load earnings');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (!summary) {
    return <p className="text-sm text-muted-foreground">Could not load your earnings right now.</p>;
  }

  return (
    <div>
      <h2 className="mb-1 font-serif text-xl font-bold text-primary">Earnings</h2>
      <p className="mb-6 text-sm text-muted-foreground">
        Based on your delivered orders. Handling fee is deducted per the current fee formula; amounts
        become payable to you once each week's settlement is processed (after the return window).
      </p>

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard icon={IndianRupee} label="Total Sales" value={formatINR(summary.total_sales)} />
        <SummaryCard icon={PiggyBank} label="Handling Fee Deducted" value={formatINR(summary.total_fee)} />
        <SummaryCard icon={Wallet} label="Total Payable" value={formatINR(summary.total_payable)} />
        <SummaryCard
          icon={Clock3}
          label="Awaiting Settlement"
          value={formatINR(summary.total_unsettled)}
          hint="Delivered, still inside return window or awaiting COD remittance"
        />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <SummaryCard icon={Wallet} label="Paid Out So Far" value={formatINR(summary.total_paid)} />
        <SummaryCard
          icon={Clock3}
          label="Settled, Payment Pending"
          value={formatINR(summary.total_pending_settlement)}
        />
        {summary.clawback_pending > 0 && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4">
            <div className="mb-2 flex items-center gap-2 text-red-700">
              <AlertTriangle className="h-4 w-4" />
              <p className="text-xs font-medium uppercase tracking-wide">Clawback Pending</p>
            </div>
            <p className="font-serif text-2xl font-bold text-red-700">
              {formatINR(summary.clawback_pending)}
            </p>
            <p className="mt-1 text-xs text-red-700/80">
              A returned/refunded item from an already-paid settlement — this will be deducted from
              your next settlement cycle.
            </p>
          </div>
        )}
      </div>

      <h3 className="mb-2 font-serif text-lg font-bold text-primary">Weekly Settlement History</h3>
      {settlements.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No settlements yet — items become eligible once delivered and past the return window.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Week</th>
                <th className="px-3 py-2">Amount</th>
                <th className="px-3 py-2">Clawback Deducted</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Payment Ref.</th>
                <th className="px-3 py-2">Paid On</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {settlements.map((s) => {
                const meta = STATUS_META[s.status];
                return (
                  <tr key={s.id}>
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
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
