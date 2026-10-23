import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAdminToken, ADMIN_SESSION_COOKIE } from '@/lib/admin-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { generateVendorMonthlyReportPdf, type VendorMonthlyReportRow } from '@/lib/vendor-report-pdf';

// ---------------------------------------------------------------------
// Phase 5B — Admin Monthly Reporting
//
// Vendor-wise total sales, handling fee collected, and payable/paid for
// a given calendar month. Built entirely from data that already exists
// (order_items + vendor_settlements from Phase 4A) — no new tables or
// migration needed.
//
// "Sale" for this report = a delivered, vendor-sourced order_item whose
// delivered_at falls inside the requested month (same definition Phase
// 4A's settlement cron uses for eligibility, just filtered by month
// instead of "return window has passed"). fee_amount / vendor_payable_
// amount are the values locked in at delivery time (see Phase 4A
// migration comment on order_items.vendor_payable_amount) — this report
// does not recompute them.
//
// payable_total = sum(vendor_payable_amount) for the month.
// paid_amount   = the portion of that whose order_item.settlement_id
//                 points to a vendor_settlements row with status='paid'.
// pending_amount = payable_total - paid_amount (either not yet batched
//                 into a settlement at all, or batched but not yet paid).
// A vendor can show paid_amount > 0 and pending_amount > 0 in the same
// month if some of their delivered items from that month settled in an
// earlier/later paid batch while others are still pending.
// ---------------------------------------------------------------------

async function requireAdmin() {
  const cookie = cookies().get(ADMIN_SESSION_COOKIE)?.value ?? null;
  const verified = await verifyAdminToken(cookie);
  return verified.valid;
}

/** Parses "YYYY-MM" into [start, end) as ISO date strings. Defaults to
 *  the current calendar month if missing/malformed. */
function monthRange(monthParam: string | null): { start: string; end: string; label: string } {
  const now = new Date();
  let year = now.getUTCFullYear();
  let month = now.getUTCMonth(); // 0-indexed

  if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
    const [y, m] = monthParam.split('-').map(Number);
    year = y;
    month = m - 1;
  }

  const start = new Date(Date.UTC(year, month, 1));
  const end = new Date(Date.UTC(year, month + 1, 1));
  const label = start.toLocaleDateString('en-IN', { year: 'numeric', month: 'long', timeZone: 'UTC' });

  return { start: start.toISOString(), end: end.toISOString(), label };
}

async function buildReportRows(start: string, end: string): Promise<VendorMonthlyReportRow[]> {
  const admin = getSupabaseAdmin();

  const { data: items, error } = await admin
    .from('order_items')
    .select('vendor_id, price, quantity, fee_amount, vendor_payable_amount, settlement_id, vendors(business_name)')
    .eq('stage', 'delivered')
    .not('vendor_id', 'is', null)
    .gte('delivered_at', start)
    .lt('delivered_at', end);
  if (error) throw error;

  const rows = items ?? [];

  const settlementIds = Array.from(
    new Set(rows.map((r: any) => r.settlement_id).filter((id: string | null): id is string => !!id))
  );

  let paidSettlementIds = new Set<string>();
  if (settlementIds.length > 0) {
    const { data: settlements, error: settlementsError } = await admin
      .from('vendor_settlements')
      .select('id, status')
      .in('id', settlementIds);
    if (settlementsError) throw settlementsError;
    paidSettlementIds = new Set((settlements ?? []).filter((s) => s.status === 'paid').map((s) => s.id));
  }

  const byVendor = new Map<string, VendorMonthlyReportRow>();

  for (const item of rows as any[]) {
    const vendorId = item.vendor_id as string;
    const vendorName = item.vendors?.business_name ?? 'Unknown vendor';
    const sale = Number(item.price ?? 0) * Number(item.quantity ?? 0);
    const fee = Number(item.fee_amount ?? 0);
    const payable = Number(item.vendor_payable_amount ?? 0);
    const isPaid = item.settlement_id && paidSettlementIds.has(item.settlement_id);

    const existing = byVendor.get(vendorId) ?? {
      vendor_id: vendorId,
      vendor_name: vendorName,
      total_sales: 0,
      fee_collected: 0,
      payable_total: 0,
      paid_amount: 0,
      pending_amount: 0,
    };

    existing.total_sales += sale;
    existing.fee_collected += fee;
    existing.payable_total += payable;
    if (isPaid) {
      existing.paid_amount += payable;
    } else {
      existing.pending_amount += payable;
    }

    byVendor.set(vendorId, existing);
  }

  return Array.from(byVendor.values()).sort((a, b) => b.total_sales - a.total_sales);
}

function toCsv(rows: VendorMonthlyReportRow[]): string {
  const header = ['Vendor', 'Total Sales', 'Handling Fee Collected', 'Payable', 'Paid', 'Pending'];
  const body = rows.map((r) => [
    r.vendor_name,
    r.total_sales.toFixed(2),
    r.fee_collected.toFixed(2),
    r.payable_total.toFixed(2),
    r.paid_amount.toFixed(2),
    r.pending_amount.toFixed(2),
  ]);
  return [header, ...body].map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
}

export async function GET(req: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const format = searchParams.get('format') || 'json';
  const { start, end, label } = monthRange(searchParams.get('month'));

  try {
    const rows = await buildReportRows(start, end);

    if (format === 'csv') {
      const csv = toCsv(rows);
      return new NextResponse(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv;charset=utf-8;',
          'Content-Disposition': `attachment; filename="vendor-monthly-report-${searchParams.get('month') || 'current'}.csv"`,
          'Cache-Control': 'no-store',
        },
      });
    }

    if (format === 'pdf') {
      const admin = getSupabaseAdmin();
      const { data: storeSetting } = await admin.from('settings').select('value').eq('key', 'store_info').maybeSingle();
      const store = (storeSetting?.value as Record<string, string>) || {};
      const pdfBytes = await generateVendorMonthlyReportPdf(label, rows, store);
      return new NextResponse(Buffer.from(pdfBytes), {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="vendor-monthly-report-${searchParams.get('month') || 'current'}.pdf"`,
          'Cache-Control': 'no-store',
        },
      });
    }

    return NextResponse.json({ month_label: label, rows });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to generate report';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
