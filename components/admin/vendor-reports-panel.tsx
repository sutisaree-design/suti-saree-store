'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Download, FileDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatINR } from '@/lib/format';
import {
  fetchAdminVendorMonthlyReport,
  downloadAdminVendorMonthlyReport,
  type VendorMonthlyReportRow,
} from '@/lib/vendor-api';

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export default function VendorReportsPanel() {
  const [month, setMonth] = useState(currentMonth());
  const [monthLabel, setMonthLabel] = useState('');
  const [rows, setRows] = useState<VendorMonthlyReportRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async (m: string) => {
    setLoading(true);
    try {
      const { month_label, rows } = await fetchAdminVendorMonthlyReport(m);
      setMonthLabel(month_label);
      setRows(rows);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load the monthly report');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(month);
  }, [month]);

  const totals = useMemo(
    () =>
      rows.reduce(
        (acc, r) => ({
          total_sales: acc.total_sales + r.total_sales,
          fee_collected: acc.fee_collected + r.fee_collected,
          payable_total: acc.payable_total + r.payable_total,
          paid_amount: acc.paid_amount + r.paid_amount,
          pending_amount: acc.pending_amount + r.pending_amount,
        }),
        { total_sales: 0, fee_collected: 0, payable_total: 0, paid_amount: 0, pending_amount: 0 }
      ),
    [rows]
  );

  const isCurrentMonth = month === currentMonth();

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setMonth((m) => shiftMonth(m, -1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <input
            type="month"
            value={month}
            max={currentMonth()}
            onChange={(e) => e.target.value && setMonth(e.target.value)}
            className="h-9 rounded-md border border-border bg-background px-3 text-sm"
          />
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            disabled={isCurrentMonth}
            onClick={() => setMonth((m) => shiftMonth(m, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          {monthLabel && <span className="ml-1 text-sm text-muted-foreground">{monthLabel}</span>}
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            disabled={!rows.length}
            onClick={() => downloadAdminVendorMonthlyReport(month, 'csv')}
          >
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            disabled={!rows.length}
            onClick={() => downloadAdminVendorMonthlyReport(month, 'pdf')}
          >
            <FileDown className="h-4 w-4" />
            Export PDF
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No delivered vendor orders for {monthLabel || 'this month'}.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Vendor</th>
                <th className="px-3 py-2">Total Sales</th>
                <th className="px-3 py-2">Handling Fee</th>
                <th className="px-3 py-2">Payable</th>
                <th className="px-3 py-2">Paid</th>
                <th className="px-3 py-2">Pending</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.vendor_id}>
                  <td className="whitespace-nowrap px-3 py-2 font-medium">{r.vendor_name}</td>
                  <td className="whitespace-nowrap px-3 py-2">{formatINR(r.total_sales)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{formatINR(r.fee_collected)}</td>
                  <td className="whitespace-nowrap px-3 py-2 font-medium">{formatINR(r.payable_total)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-green-700">{formatINR(r.paid_amount)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-amber-700">{formatINR(r.pending_amount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t border-border bg-muted/30 font-semibold">
              <tr>
                <td className="whitespace-nowrap px-3 py-2">Total</td>
                <td className="whitespace-nowrap px-3 py-2">{formatINR(totals.total_sales)}</td>
                <td className="whitespace-nowrap px-3 py-2">{formatINR(totals.fee_collected)}</td>
                <td className="whitespace-nowrap px-3 py-2">{formatINR(totals.payable_total)}</td>
                <td className="whitespace-nowrap px-3 py-2 text-green-700">{formatINR(totals.paid_amount)}</td>
                <td className="whitespace-nowrap px-3 py-2 text-amber-700">{formatINR(totals.pending_amount)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
