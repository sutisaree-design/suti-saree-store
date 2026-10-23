import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

export interface VendorMonthlyReportRow {
  vendor_id: string;
  vendor_name: string;
  total_sales: number;
  fee_collected: number;
  payable_total: number;
  paid_amount: number;
  pending_amount: number;
}

interface StoreInfo {
  name?: string;
}

const rupee = (n: number) => `Rs. ${Math.round(n).toLocaleString('en-IN')}`;

/**
 * Renders the vendor-wise monthly report (sales / fee / payable / paid /
 * pending, one row per vendor + a totals row) as a single-page-per-~28-rows
 * PDF. Mirrors invoice-pdf.ts's plain one-font table style so it stays
 * consistent with the other generated documents in this app.
 */
export async function generateVendorMonthlyReportPdf(
  monthLabel: string,
  rows: VendorMonthlyReportRow[],
  store: StoreInfo
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const margin = 40;
  const pageSize: [number, number] = [841.89, 595.28]; // A4 landscape — 6 amount columns need the width
  const primary = rgb(0.49, 0.23, 0.11);
  const muted = rgb(0.45, 0.45, 0.45);
  const black = rgb(0.1, 0.1, 0.1);

  const col = { vendor: margin, sales: 330, fee: 440, payable: 540, paid: 640, pending: 730 };

  let page = doc.addPage(pageSize);
  let y = page.getHeight() - margin;

  const draw = (
    text: string,
    x: number,
    yPos: number,
    opts: { size?: number; f?: typeof font; color?: ReturnType<typeof rgb> } = {}
  ) => {
    page.drawText(text, { x, y: yPos, size: opts.size ?? 9, font: opts.f ?? font, color: opts.color ?? black });
  };

  const drawHeader = () => {
    draw(store.name || 'AruhiHandlooms', margin, y, { size: 18, f: bold, color: primary });
    y -= 16;
    draw('Vendor Monthly Report', margin, y, { size: 11, color: muted });
    draw(monthLabel, page.getWidth() - margin - 100, page.getHeight() - margin, { size: 11, f: bold, color: primary });
    y -= 22;
    page.drawLine({ start: { x: margin, y }, end: { x: page.getWidth() - margin, y }, thickness: 0.5, color: muted });
    y -= 20;

    draw('Vendor', col.vendor, y, { size: 9, f: bold });
    draw('Total Sales', col.sales, y, { size: 9, f: bold });
    draw('Fee Collected', col.fee, y, { size: 9, f: bold });
    draw('Payable', col.payable, y, { size: 9, f: bold });
    draw('Paid', col.paid, y, { size: 9, f: bold });
    draw('Pending', col.pending, y, { size: 9, f: bold });
    y -= 8;
    page.drawLine({ start: { x: margin, y }, end: { x: page.getWidth() - margin, y }, thickness: 0.5, color: muted });
    y -= 16;
  };

  drawHeader();

  const totals = rows.reduce(
    (acc, r) => ({
      total_sales: acc.total_sales + r.total_sales,
      fee_collected: acc.fee_collected + r.fee_collected,
      payable_total: acc.payable_total + r.payable_total,
      paid_amount: acc.paid_amount + r.paid_amount,
      pending_amount: acc.pending_amount + r.pending_amount,
    }),
    { total_sales: 0, fee_collected: 0, payable_total: 0, paid_amount: 0, pending_amount: 0 }
  );

  if (rows.length === 0) {
    draw('No delivered vendor orders in this month.', margin, y, { size: 9, color: muted });
    y -= 18;
  }

  for (const row of rows) {
    if (y < 80) {
      page = doc.addPage(pageSize);
      y = page.getHeight() - margin;
      drawHeader();
    }
    const name = row.vendor_name.length > 38 ? `${row.vendor_name.slice(0, 35)}...` : row.vendor_name;
    draw(name, col.vendor, y, { size: 9 });
    draw(rupee(row.total_sales), col.sales, y, { size: 9 });
    draw(rupee(row.fee_collected), col.fee, y, { size: 9 });
    draw(rupee(row.payable_total), col.payable, y, { size: 9 });
    draw(rupee(row.paid_amount), col.paid, y, { size: 9, color: rgb(0.13, 0.5, 0.13) });
    draw(rupee(row.pending_amount), col.pending, y, { size: 9, color: rgb(0.7, 0.45, 0.05) });
    y -= 16;
  }

  y -= 6;
  page.drawLine({ start: { x: margin, y }, end: { x: page.getWidth() - margin, y }, thickness: 0.5, color: muted });
  y -= 18;

  draw('Total', col.vendor, y, { size: 10, f: bold, color: primary });
  draw(rupee(totals.total_sales), col.sales, y, { size: 10, f: bold, color: primary });
  draw(rupee(totals.fee_collected), col.fee, y, { size: 10, f: bold, color: primary });
  draw(rupee(totals.payable_total), col.payable, y, { size: 10, f: bold, color: primary });
  draw(rupee(totals.paid_amount), col.paid, y, { size: 10, f: bold, color: primary });
  draw(rupee(totals.pending_amount), col.pending, y, { size: 10, f: bold, color: primary });

  const footerY = 30;
  draw('This is a computer-generated report.', margin, footerY, { size: 8, color: muted });

  return doc.save();
}
