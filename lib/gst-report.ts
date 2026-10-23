// GST report engine. Pure functions only (no DB, no React) so the maths can be
// unit-tested and reused by the API route and the admin panel.
//
// Store rules this relies on (see app/checkout/page.tsx + place_order_with_items):
//  * every price is GST-INCLUSIVE; total_amount is what the customer pays
//    (net of coupon / BOGO / loyalty / online discount / gift card, plus shipping)
//  * gift card is a payment method, not a discount -> added back for tax value
//  * shipping is taxed pro-rata with the goods in the same order (composite supply)

export const STATE_CODES: Record<string, string> = {
  'jammu and kashmir': '01', 'himachal pradesh': '02', punjab: '03', chandigarh: '04',
  uttarakhand: '05', haryana: '06', delhi: '07', rajasthan: '08', 'uttar pradesh': '09',
  bihar: '10', sikkim: '11', 'arunachal pradesh': '12', nagaland: '13', manipur: '14',
  mizoram: '15', tripura: '16', meghalaya: '17', assam: '18', 'west bengal': '19',
  jharkhand: '20', odisha: '21', chhattisgarh: '22', 'madhya pradesh': '23', gujarat: '24',
  'dadra and nagar haveli and daman and diu': '26', maharashtra: '27', karnataka: '29',
  goa: '30', lakshadweep: '31', kerala: '32', 'tamil nadu': '33', puducherry: '34',
  'andaman and nicobar islands': '35', telangana: '36', 'andhra pradesh': '37', ladakh: '38',
};

const STATE_ALIASES: Record<string, string> = {
  orissa: 'odisha', 'nct of delhi': 'delhi', 'new delhi': 'delhi', 'jammu & kashmir': 'jammu and kashmir',
  'j&k': 'jammu and kashmir', pondicherry: 'puducherry', 'andaman & nicobar islands': 'andaman and nicobar islands',
  'andaman and nicobar': 'andaman and nicobar islands', 'dadra and nagar haveli': 'dadra and nagar haveli and daman and diu',
  'daman and diu': 'dadra and nagar haveli and daman and diu', 'dadra & nagar haveli and daman & diu': 'dadra and nagar haveli and daman and diu',
  uttaranchal: 'uttarakhand', telengana: 'telangana', bengal: 'west bengal', 'tamilnadu': 'tamil nadu',
};

const CODE_TO_NAME: Record<string, string> = Object.fromEntries(
  Object.entries(STATE_CODES).map(([name, code]) => [
    code,
    name.replace(/\b\w/g, (c) => c.toUpperCase()).replace(/ And /g, ' and '),
  ])
);

export function stateCodeFromName(name: unknown): string | null {
  if (typeof name !== 'string') return null;
  const k = name.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!k) return null;
  return STATE_CODES[STATE_ALIASES[k] ?? k] ?? null;
}

export const stateLabel = (code: string | null) => (code ? `${code}-${CODE_TO_NAME[code] ?? code}` : 'Unknown');

export const sellerStateCodeFromGstin = (gstin: string | null | undefined): string | null => {
  const m = (gstin ?? '').trim().match(/^(\d{2})/);
  return m && CODE_TO_NAME[m[1]] ? m[1] : null;
};

// GSTIN: 2 digit state + 10 char PAN + entity digit + 'Z' + checksum char.
export const isValidGstinFormat = (g: string) => /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test((g ?? '').trim().toUpperCase());

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export interface GstOrderItem { product_id?: string; quantity?: number; price?: number; product_name?: string; gst_rate?: number | null; hsn_code?: string | null }
export interface GstOrder {
  id: string; created_at: string; status: string; payment_method: string | null;
  total_amount: number | null; gift_card_discount: number | null; shipping_charge: number | null;
  gst_amount: number | null; items: GstOrderItem[] | null; shipping_address: { state?: string } | null;
  is_reseller_order?: boolean | null; delivery_status?: string | null; customer_name?: string | null;
  razorpay_payment_id?: string | null; advance_amount?: number | null; tracking_number?: string | null;
}
export interface GstProduct { id: string; name?: string; gst_rate: number | null; hsn_code: string | null }
export interface GstReturn { id: string; order_id: string; type: string; status: string; refund_amount: number | null; resolved_at: string | null; created_at: string }
export interface GstConfig { sellerStateCode: string | null; defaultRate: number; defaultHsn: string; defaultDescription: string }

export interface Row { taxable: number; igst: number; cgst: number; sgst: number }
const zero = (): Row => ({ taxable: 0, igst: 0, cgst: 0, sgst: 0 });
const add = (a: Row, b: Row) => { a.taxable = r2(a.taxable + b.taxable); a.igst = r2(a.igst + b.igst); a.cgst = r2(a.cgst + b.cgst); a.sgst = r2(a.sgst + b.sgst); };

export const SUPPLY_STATUSES = ['paid', 'shipped', 'delivered'];
const isRto = (o: GstOrder) => /rto|return|undeliver/i.test(o.delivery_status ?? '') && o.status !== 'delivered';

export interface LineResult { orderId: string; hsn: string; rate: number; qty: number; gross: number; pos: string | null; intra: boolean } 
export interface LineTax extends LineResult, Row { productName: string }

export interface OrderTax {
  orderId: string; date: string; customer: string; pos: string; intra: boolean; invoiceValue: number;
  taxable: number; igst: number; cgst: number; sgst: number; storedGst: number; diff: number; flags: string[];
}

export interface ExcludedOrder { orderId: string; status: string; reason: string; amount: number }

export interface GstReport {
  period: { from: string; to: string };
  summary: Row & { orders: number; invoiceValue: number; totalTax: number };
  creditNotes: Row & { count: number; totalTax: number; refundValue: number };
  net: Row & { totalTax: number };
  byRate: { rate: number; taxable: number; igst: number; cgst: number; sgst: number }[];
  b2cs: { pos: string; rate: number; taxable: number; igst: number; cgst: number; sgst: number }[];
  hsn: { hsn: string; description: string; uqc: string; qty: number; value: number; rate: number; taxable: number; igst: number; cgst: number; sgst: number }[];
  orders: OrderTax[];
  excluded: ExcludedOrder[];
  warnings: string[];
}

/** Split a GST-inclusive amount into taxable value + tax at `rate`%. */
export function splitInclusive(gross: number, rate: number) {
  const taxable = r2((gross * 100) / (100 + rate));
  return { taxable, tax: r2(gross - taxable) };
}

export function computeOrderLines(o: GstOrder, products: Map<string, GstProduct>, cfg: GstConfig): { lines: LineTax[]; order: OrderTax } {
  const items = Array.isArray(o.items) ? o.items : [];
  const posCode = stateCodeFromName(o.shipping_address?.state);
  const intra = !!posCode && !!cfg.sellerStateCode && posCode === cfg.sellerStateCode;
  const shipping = Number(o.shipping_charge) || 0;
  const invoiceValue = r2((Number(o.total_amount) || 0) + (Number(o.gift_card_discount) || 0));
  const merchNet = Math.max(0, invoiceValue - shipping);
  const gross = items.map((i) => (Number(i.price) || 0) * (Number(i.quantity) || 0));
  const merchGross = gross.reduce((a, b) => a + b, 0);
  const flags: string[] = [];
  if (!posCode) flags.push('State missing/unknown - treated as inter-state (IGST)');
  const lines: LineTax[] = items.map((it, idx) => {
    const p = it.product_id ? products.get(it.product_id) : undefined;
    // Prefer the rate snapshotted on the order line at sale time (orders_set_gst trigger).
    const rate = it.gst_rate != null ? Number(it.gst_rate) : p?.gst_rate != null ? Number(p.gst_rate) : cfg.defaultRate;
    if (!p && it.gst_rate == null) flags.push(`Product ${it.product_name ?? it.product_id ?? '?'} not found - default rate used`);
    const share = merchGross > 0 ? gross[idx] / merchGross : 1 / Math.max(items.length, 1);
    // discounted line value + pro-rata shipping, both GST-inclusive
    const lineGross = r2(merchNet * share + shipping * share);
    const { taxable, tax } = splitInclusive(lineGross, rate);
    const unitNet = (Number(it.quantity) || 0) > 0 ? (Number(it.price) || 0) * 100 / (100 + rate) : 0;
    if (unitNet > 2500 && rate === 5) flags.push(`${it.product_name ?? 'Item'} unit value > Rs 2,500 at 5% - garments (HSN 61/62) above Rs 2,500 are 18%`);
    return {
      orderId: o.id, hsn: (it.hsn_code || p?.hsn_code || cfg.defaultHsn || '').trim(), rate, qty: Number(it.quantity) || 0, gross: lineGross,
      pos: posCode, intra, productName: it.product_name ?? p?.name ?? '',
      taxable, igst: intra ? 0 : tax, cgst: intra ? r2(tax / 2) : 0, sgst: intra ? r2(tax - r2(tax / 2)) : 0,
    };
  });
  const t = zero(); lines.forEach((l) => add(t, l));
  const storedGst = Number(o.gst_amount) || 0;
  const tax = r2(t.igst + t.cgst + t.sgst);
  return {
    lines,
    order: {
      orderId: o.id, date: o.created_at, customer: o.customer_name ?? '', pos: stateLabel(posCode), intra, invoiceValue,
      taxable: t.taxable, igst: t.igst, cgst: t.cgst, sgst: t.sgst, storedGst, diff: r2(tax - storedGst), flags,
    },
  };
}

/** IST month boundaries as ISO instants. month = 'YYYY-MM'. */
export function monthRangeIst(month: string): { fromIso: string; toIso: string } {
  const [y, m] = month.split('-').map(Number);
  const start = Date.UTC(y, m - 1, 1) - 5.5 * 3600_000;
  const end = Date.UTC(y, m, 1) - 5.5 * 3600_000;
  return { fromIso: new Date(start).toISOString(), toIso: new Date(end).toISOString() };
}

export function buildReport(opts: {
  orders: GstOrder[]; products: Map<string, GstProduct>; returns: GstReturn[]; returnOrders: Map<string, GstOrder>;
  cfg: GstConfig; gstin: string; from: string; to: string;
}): GstReport {
  const { orders, products, returns, returnOrders, cfg } = opts;
  const warnings: string[] = [];
  if (!opts.gstin) warnings.push('Store GSTIN is empty. Add it in Admin > Settings > Store info.');
  else if (!isValidGstinFormat(opts.gstin)) warnings.push('Store GSTIN format looks invalid. Please re-check it.');
  if (!cfg.sellerStateCode) warnings.push('Seller state could not be read from GSTIN, so all supplies are treated as inter-state (IGST).');

  const summary = { ...zero(), orders: 0, invoiceValue: 0, totalTax: 0 };
  const byRate = new Map<number, Row>(); const b2cs = new Map<string, Row>(); const hsn = new Map<string, { qty: number; value: number; rate: number; row: Row; desc: string }>();
  const orderRows: OrderTax[] = []; const excluded: ExcludedOrder[] = [];

  for (const o of orders) {
    const amount = Number(o.total_amount) || 0;
    if (o.is_reseller_order) { excluded.push({ orderId: o.id, status: o.status, reason: 'Reseller order - reseller issues own invoice (check with CA)', amount }); continue; }
    if (!SUPPLY_STATUSES.includes(o.status)) { excluded.push({ orderId: o.id, status: o.status, reason: o.status === 'pending' ? 'Not yet paid/dispatched' : `Status ${o.status}`, amount }); continue; }
    if (isRto(o)) { excluded.push({ orderId: o.id, status: o.status, reason: 'Returned to origin / undelivered', amount }); continue; }
    const { lines, order } = computeOrderLines(o, products, cfg);
    orderRows.push(order); summary.orders += 1; summary.invoiceValue = r2(summary.invoiceValue + order.invoiceValue);
    for (const l of lines) {
      add(summary, l);
      const rr = byRate.get(l.rate) ?? zero(); add(rr, l); byRate.set(l.rate, rr);
      const bk = `${l.pos ?? 'NA'}|${l.rate}`; const br = b2cs.get(bk) ?? zero(); add(br, l); b2cs.set(bk, br);
      const hk = `${l.hsn}|${l.rate}`; const h = hsn.get(hk) ?? { qty: 0, value: 0, rate: l.rate, row: zero(), desc: cfg.defaultDescription };
      h.qty += l.qty; h.value = r2(h.value + l.gross); add(h.row, l); hsn.set(hk, h);
    }
  }
  summary.totalTax = r2(summary.igst + summary.cgst + summary.sgst);

  // Credit notes: refunded/completed returns, resolved inside the period, reduce liability.
  const cn = { ...zero(), count: 0, totalTax: 0, refundValue: 0 };
  for (const r of returns) {
    if (r.type !== 'return' || !['refunded', 'completed'].includes(r.status)) continue;
    const o = returnOrders.get(r.order_id); const refund = Number(r.refund_amount) || 0;
    if (!o || refund <= 0) { if (refund > 0) warnings.push(`Return ${r.id.slice(0, 8)}: order not found, skipped.`); continue; }
    const { order } = computeOrderLines(o, products, cfg);
    if (order.invoiceValue <= 0) continue;
    const f = Math.min(1, refund / order.invoiceValue);
    add(cn, { taxable: r2(order.taxable * f), igst: r2(order.igst * f), cgst: r2(order.cgst * f), sgst: r2(order.sgst * f) });
    cn.count += 1; cn.refundValue = r2(cn.refundValue + refund);
  }
  cn.totalTax = r2(cn.igst + cn.cgst + cn.sgst);
  const net = { taxable: r2(summary.taxable - cn.taxable), igst: r2(summary.igst - cn.igst), cgst: r2(summary.cgst - cn.cgst), sgst: r2(summary.sgst - cn.sgst), totalTax: 0 };
  net.totalTax = r2(net.igst + net.cgst + net.sgst);

  const unknown = orderRows.filter((o) => o.pos === 'Unknown').length;
  if (unknown) warnings.push(`${unknown} order(s) have no valid shipping state - treated as IGST.`);
  const flagged = orderRows.filter((o) => o.flags.some((f) => f.includes('Rs 2,500'))).length;
  if (flagged) warnings.push(`${flagged} order(s) contain items above Rs 2,500 charged at 5%. Garments (not sarees/fabric) above Rs 2,500 per piece attract 18% - verify the product GST rate.`);
  const noHsn = Array.from(hsn.keys()).filter((k) => k.startsWith('|')).length;
  if (noHsn) warnings.push('Some products have no HSN code and no default HSN is set.');
  const big = orderRows.filter((o) => Math.abs(o.diff) > 1).length;
  if (big) warnings.push(`${big} order(s) differ by more than Rs 1 from the GST stored at checkout (flat rate). The report uses each product's own rate.`);

  const sortRate = (a: number, b: number) => a - b;
  return {
    period: { from: opts.from, to: opts.to }, summary, creditNotes: cn, net,
    byRate: Array.from(byRate.entries()).sort((a, b) => sortRate(a[0], b[0])).map(([rate, r]) => ({ rate, ...r })),
    b2cs: Array.from(b2cs.entries()).map(([k, r]) => { const [pos, rate] = k.split('|'); return { pos: pos === 'NA' ? 'Unknown' : stateLabel(pos), rate: Number(rate), ...r }; })
      .sort((a, b) => a.pos.localeCompare(b.pos) || a.rate - b.rate),
    hsn: Array.from(hsn.entries()).map(([k, h]) => ({ hsn: k.split('|')[0], description: h.desc, uqc: 'NOS', qty: h.qty, value: h.value, rate: h.rate, ...h.row })).sort((a, b) => a.hsn.localeCompare(b.hsn)),
    orders: orderRows.sort((a, b) => a.date.localeCompare(b.date)), excluded, warnings,
  };
}

// ---------- CSV builders (formats follow the GST offline-tool templates) ----------
const q = (v: string | number) => { const s = String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const toCsv = (rows: (string | number)[][]) => rows.map((r) => r.map(q).join(',')).join('\r\n') + '\r\n';

export function csvB2cs(rep: GstReport) {
  // GSTR-1 Table 7 (B2CS): Type, Place Of Supply, Applicable % of Tax Rate, Rate, Taxable Value, Cess Amount, E-Commerce GSTIN
  return toCsv([['Type', 'Place Of Supply', 'Applicable % of Tax Rate', 'Rate', 'Taxable Value', 'Cess Amount', 'E-Commerce GSTIN'],
    ...rep.b2cs.map((r) => ['OE', r.pos, '', r.rate, r.taxable.toFixed(2), '0.00', ''])]);
}
export function csvHsn(rep: GstReport) {
  // GSTR-1 Table 12 (HSN summary)
  return toCsv([['HSN', 'Description', 'UQC', 'Total Quantity', 'Total Value', 'Taxable Value', 'Integrated Tax Amount', 'Central Tax Amount', 'State/UT Tax Amount', 'Cess Amount', 'Rate'],
    ...rep.hsn.map((h) => [h.hsn, h.description, h.uqc, h.qty, h.value.toFixed(2), h.taxable.toFixed(2), h.igst.toFixed(2), h.cgst.toFixed(2), h.sgst.toFixed(2), '0.00', h.rate])]);
}
export function csv3b(rep: GstReport) {
  // GSTR-3B Table 3.1(a) net of credit notes, and 3.2 inter-state to unregistered
  const inter = rep.b2cs.filter((r) => r.igst > 0);
  const byPos = new Map<string, { taxable: number; igst: number }>();
  inter.forEach((r) => { const c = byPos.get(r.pos) ?? { taxable: 0, igst: 0 }; c.taxable = r2(c.taxable + r.taxable); c.igst = r2(c.igst + r.igst); byPos.set(r.pos, c); });
  return toCsv([
    ['GSTR-3B 3.1(a) Outward taxable supplies', 'Taxable Value', 'Integrated Tax', 'Central Tax', 'State/UT Tax', 'Cess'],
    ['Gross (before credit notes)', rep.summary.taxable.toFixed(2), rep.summary.igst.toFixed(2), rep.summary.cgst.toFixed(2), rep.summary.sgst.toFixed(2), '0.00'],
    ['Less: credit notes (returns)', rep.creditNotes.taxable.toFixed(2), rep.creditNotes.igst.toFixed(2), rep.creditNotes.cgst.toFixed(2), rep.creditNotes.sgst.toFixed(2), '0.00'],
    ['Net to report', rep.net.taxable.toFixed(2), rep.net.igst.toFixed(2), rep.net.cgst.toFixed(2), rep.net.sgst.toFixed(2), '0.00'],
    [], ['GSTR-3B 3.2 Inter-state to unregistered persons (gross)', 'Place Of Supply', 'Taxable Value', 'Integrated Tax'],
    ...Array.from(byPos.entries()).map(([pos, v]) => ['', pos, v.taxable.toFixed(2), v.igst.toFixed(2)]),
  ]);
}
export function csvOrders(rep: GstReport) {
  return toCsv([['Order ID', 'Date (UTC)', 'Customer', 'Place Of Supply', 'Intra-state', 'Invoice Value', 'Taxable Value', 'IGST', 'CGST', 'SGST', 'GST stored at checkout', 'Difference', 'Notes'],
    ...rep.orders.map((o) => [o.orderId, o.date, o.customer, o.pos, o.intra ? 'Yes' : 'No', o.invoiceValue.toFixed(2), o.taxable.toFixed(2), o.igst.toFixed(2), o.cgst.toFixed(2), o.sgst.toFixed(2), o.storedGst.toFixed(2), o.diff.toFixed(2), Array.from(new Set(o.flags)).join(' | ')])]);
}

// ---------- Checkout preview (same maths as the orders_set_gst DB trigger) ----------
export function computeCheckoutGst(
  lines: { price: number; quantity: number; gstRate?: number }[],
  invoiceValue: number,
  defaultRate: number
): number {
  const gross = lines.map((l) => (Number(l.price) || 0) * (Number(l.quantity) || 0));
  const merch = gross.reduce((a, b) => a + b, 0);
  let tax = 0;
  lines.forEach((l, i) => {
    const share = merch > 0 ? gross[i] / merch : 1 / Math.max(lines.length, 1);
    const v = invoiceValue * share;
    const rate = l.gstRate != null ? l.gstRate : defaultRate;
    tax += v - (v * 100) / (100 + rate);
  });
  return Math.round(tax);
}

// ---------- Input tax credit (Delhivery / Razorpay) ----------
export type ItcVendor = 'delhivery' | 'razorpay' | 'other';
export interface ItcEntry {
  id: string; month: string; vendor: ItcVendor; invoice_no: string; invoice_date: string | null;
  taxable: number; igst: number; cgst: number; sgst: number; in_gstr2b: boolean; note: string | null;
}
export interface ItcDefaults {
  delhivery_gst_rate: number; razorpay_gst_rate: number; razorpay_fee_percent_ex_gst: number; logistics_cost_includes_gst: boolean;
}
/** Factory defaults: courier 18% (SAC 996812), Razorpay fee 2% + 18% GST (= 2.36% all-in). */
export const DEFAULT_ITC_DEFAULTS: ItcDefaults = {
  delhivery_gst_rate: 18, razorpay_gst_rate: 18, razorpay_fee_percent_ex_gst: 2, logistics_cost_includes_gst: true,
};

export interface ItcEstimate {
  razorpay: { orders: number; charged: number; fee: number; gst: number };
  delhivery: { shipments: number; cost: number; gst: number };
  totalGst: number;
}

export interface ItcOrderLite {
  status: string; payment_method: string | null; total_amount: number | null; advance_amount?: number | null;
  razorpay_payment_id?: string | null; tracking_number?: string | null;
}

/** Rough monthly estimate from orders. The real claim is ALWAYS the vendor invoice that shows in GSTR-2B. */
export function estimateItc(
  orders: ItcOrderLite[], d: ItcDefaults, logistics: { cod: number; prepaid: number }
): ItcEstimate {
  const rz = { orders: 0, charged: 0, fee: 0, gst: 0 };
  const dl = { shipments: 0, cost: 0, gst: 0 };
  for (const o of orders) {
    if (o.razorpay_payment_id && o.status !== 'failed') {
      const charged = o.payment_method === 'partial' ? Number(o.advance_amount) || 0 : Number(o.total_amount) || 0;
      if (charged > 0) {
        const fee = (charged * d.razorpay_fee_percent_ex_gst) / 100;
        rz.orders += 1; rz.charged += charged; rz.fee += fee; rz.gst += (fee * d.razorpay_gst_rate) / 100;
      }
    }
    if (o.tracking_number && o.status !== 'cancelled') {
      const cost = o.payment_method === 'cod' ? logistics.cod : logistics.prepaid;
      if (cost > 0) {
        dl.shipments += 1; dl.cost += cost;
        dl.gst += d.logistics_cost_includes_gst ? (cost * d.delhivery_gst_rate) / (100 + d.delhivery_gst_rate) : (cost * d.delhivery_gst_rate) / 100;
      }
    }
  }
  const out = {
    razorpay: { orders: rz.orders, charged: r2(rz.charged), fee: r2(rz.fee), gst: r2(rz.gst) },
    delhivery: { shipments: dl.shipments, cost: r2(dl.cost), gst: r2(dl.gst) },
    totalGst: 0,
  };
  out.totalGst = r2(out.razorpay.gst + out.delhivery.gst);
  return out;
}

export interface Head { igst: number; cgst: number; sgst: number }
export interface ItcSummary {
  eligible: Head; waiting: Head; eligibleTotal: number; waitingTotal: number;
  output: Head; cashToPay: Head; carryForward: Head; cashTotal: number;
}

/** GST utilisation order: IGST credit -> IGST, CGST, SGST; CGST credit -> CGST, IGST; SGST credit -> SGST, IGST. */
export function summariseItc(entries: ItcEntry[], output: Head): ItcSummary {
  const sum = (list: ItcEntry[]): Head => list.reduce((a, e) => ({ igst: r2(a.igst + e.igst), cgst: r2(a.cgst + e.cgst), sgst: r2(a.sgst + e.sgst) }), { igst: 0, cgst: 0, sgst: 0 });
  const eligible = sum(entries.filter((e) => e.in_gstr2b));
  const waiting = sum(entries.filter((e) => !e.in_gstr2b));
  const L = { ...output }; const C = { ...eligible };
  const use = (from: keyof Head, to: keyof Head) => { const u = Math.min(C[from], L[to]); L[to] = r2(L[to] - u); C[from] = r2(C[from] - u); };
  use('igst', 'igst'); use('igst', 'cgst'); use('igst', 'sgst');
  use('cgst', 'cgst'); use('cgst', 'igst');
  use('sgst', 'sgst'); use('sgst', 'igst');
  const tot = (h: Head) => r2(h.igst + h.cgst + h.sgst);
  return { eligible, waiting, eligibleTotal: tot(eligible), waitingTotal: tot(waiting), output, cashToPay: L, carryForward: C, cashTotal: tot(L) };
}
