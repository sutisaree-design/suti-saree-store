import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAdminToken, ADMIN_SESSION_COOKIE } from '@/lib/admin-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import {
  buildReport, monthRangeIst, sellerStateCodeFromGstin, csvB2cs, csvHsn, csv3b, csvOrders,
  estimateItc, summariseItc, DEFAULT_ITC_DEFAULTS,
  type GstOrder, type GstProduct, type GstReturn, type GstConfig, type ItcDefaults, type ItcEntry,
} from '@/lib/gst-report';

export const dynamic = 'force-dynamic';

async function requireAdmin() {
  const cookie = cookies().get(ADMIN_SESSION_COOKIE)?.value ?? null;
  const verified = await verifyAdminToken(cookie);
  return verified.valid;
}

const ORDER_COLS =
  'id, created_at, status, payment_method, total_amount, gift_card_discount, shipping_charge, gst_amount, items, shipping_address, is_reseller_order, delivery_status, customer_name, razorpay_payment_id, advance_amount, tracking_number';

async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from, from + 999);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

async function loadSettings(supabase: ReturnType<typeof getSupabaseAdmin>) {
  const { data } = await supabase.from('settings').select('key, value').in('key', ['store_info', 'shipping', 'gst_settings', 'gst_itc_defaults']);
  const map = new Map((data ?? []).map((r: any) => [r.key, r.value as any]));
  const store = map.get('store_info') ?? {};
  const shipping = map.get('shipping') ?? {};
  const gst = map.get('gst_settings') ?? {};
  const itcDefaults: ItcDefaults = { ...DEFAULT_ITC_DEFAULTS, ...(map.get('gst_itc_defaults') ?? {}) };
  const logistics = { cod: Number(shipping.cod_logistics_cost ?? 0), prepaid: Number(shipping.prepaid_logistics_cost ?? 0) };
  const gstin = String(store.gstin ?? '').trim().toUpperCase();
  const cfg: GstConfig = {
    sellerStateCode: sellerStateCodeFromGstin(gstin),
    defaultRate: Number(shipping.gst_rate_percent ?? 5),
    defaultHsn: String(gst.default_hsn ?? '').trim(),
    defaultDescription: String(gst.default_description ?? 'Sarees and ethnic wear'),
  };
  return { cfg, gstin, store, gst, itcDefaults, logistics };
}

export async function GET(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const url = new URL(req.url);
  try {
    const supabase = getSupabaseAdmin();
    const { cfg, gstin, store, itcDefaults, logistics } = await loadSettings(supabase);

    if (url.searchParams.get('view') === 'products') {
      const products = await fetchAll<any>((f, t) => supabase.from('products').select('id, name, gst_rate, hsn_code').order('name').range(f, t));
      return NextResponse.json({ products, defaults: { default_hsn: cfg.defaultHsn, default_description: cfg.defaultDescription }, gstin, storeName: store.name ?? '' });
    }

    const month = url.searchParams.get('month') ?? '';
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return NextResponse.json({ error: 'month must be YYYY-MM' }, { status: 400 });
    const { fromIso, toIso } = monthRangeIst(month);

    const orders = await fetchAll<GstOrder>((f, t) =>
      supabase.from('orders').select(ORDER_COLS).gte('created_at', fromIso).lt('created_at', toIso).order('created_at').range(f, t)
    );
    const returns = await fetchAll<GstReturn>((f, t) =>
      supabase.from('returns').select('id, order_id, type, status, refund_amount, resolved_at, created_at')
        .in('status', ['refunded', 'completed']).gte('resolved_at', fromIso).lt('resolved_at', toIso).range(f, t)
    );
    const returnOrderIds = Array.from(new Set(returns.map((r) => r.order_id)));
    const returnOrders = new Map<string, GstOrder>();
    for (let i = 0; i < returnOrderIds.length; i += 200) {
      const { data } = await supabase.from('orders').select(ORDER_COLS).in('id', returnOrderIds.slice(i, i + 200));
      (data ?? []).forEach((o: any) => returnOrders.set(o.id, o));
    }
    const products = new Map<string, GstProduct>();
    (await fetchAll<GstProduct>((f, t) => supabase.from('products').select('id, name, gst_rate, hsn_code').range(f, t))).forEach((p) => products.set(p.id, p));

    const report = buildReport({ orders, products, returns, returnOrders, cfg, gstin, from: fromIso, to: toIso });

    const fmt = url.searchParams.get('format');
    if (fmt === 'csv') {
      const type = url.searchParams.get('type');
      const body = type === 'hsn' ? csvHsn(report) : type === '3b' ? csv3b(report) : type === 'orders' ? csvOrders(report) : csvB2cs(report);
      return new NextResponse('\uFEFF' + body, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="gst-${type ?? 'b2cs'}-${month}.csv"`,
          'Cache-Control': 'no-store',
        },
      });
    }
    // ---- Input tax credit (Delhivery / Razorpay) ----
    const { data: itcRows, error: itcErr } = await supabase.from('gst_itc_entries').select('*').eq('month', month).order('invoice_date', { ascending: true });
    const itcMissing = !!itcErr; // migration not run yet -> show a hint instead of failing the whole report
    const entries: ItcEntry[] = (itcRows ?? []).map((r: any) => ({
      id: r.id, month: r.month, vendor: r.vendor, invoice_no: r.invoice_no, invoice_date: r.invoice_date,
      taxable: Number(r.taxable), igst: Number(r.igst), cgst: Number(r.cgst), sgst: Number(r.sgst), in_gstr2b: !!r.in_gstr2b, note: r.note,
    }));
    const estimate = estimateItc(orders, itcDefaults, logistics);
    const summary = summariseItc(entries, { igst: report.net.igst, cgst: report.net.cgst, sgst: report.net.sgst });
    const itc = { entries, defaults: itcDefaults, factoryDefaults: DEFAULT_ITC_DEFAULTS, estimate, summary, tableMissing: itcMissing };

    return NextResponse.json({ month, gstin, storeName: store.name ?? '', sellerStateCode: cfg.sellerStateCode, report, itc }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('[gst-report] failed', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to build GST report' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await req.json();
    const supabase = getSupabaseAdmin();
    if (body.action === 'save_product') {
      const rate = Number(body.gst_rate);
      if (!body.id || !Number.isFinite(rate) || ![0, 0.25, 3, 5, 12, 18, 28].includes(rate)) {
        return NextResponse.json({ error: 'Invalid product or GST rate (use 0, 3, 5, 12, 18 or 28)' }, { status: 400 });
      }
      const hsn = String(body.hsn_code ?? '').trim();
      if (hsn && !/^\d{4,8}$/.test(hsn)) return NextResponse.json({ error: 'HSN must be 4 to 8 digits' }, { status: 400 });
      const { error } = await supabase.from('products').update({ gst_rate: rate, hsn_code: hsn || null }).eq('id', body.id);
      if (error) throw error;
      return NextResponse.json({ success: true });
    }
    if (body.action === 'save_defaults') {
      const hsn = String(body.default_hsn ?? '').trim();
      if (hsn && !/^\d{4,8}$/.test(hsn)) return NextResponse.json({ error: 'HSN must be 4 to 8 digits' }, { status: 400 });
      const { error } = await supabase.from('settings').upsert(
        { key: 'gst_settings', value: { default_hsn: hsn, default_description: String(body.default_description ?? '').trim() || 'Sarees and ethnic wear' } },
        { onConflict: 'key' }
      );
      if (error) throw error;
      return NextResponse.json({ success: true });
    }
    if (body.action === 'add_itc') {
      const n = (v: unknown) => Math.round((Number(v) || 0) * 100) / 100;
      const e = {
        month: String(body.month ?? ''), vendor: String(body.vendor ?? ''), invoice_no: String(body.invoice_no ?? '').trim(),
        invoice_date: body.invoice_date ? String(body.invoice_date) : null,
        taxable: n(body.taxable), igst: n(body.igst), cgst: n(body.cgst), sgst: n(body.sgst),
        in_gstr2b: !!body.in_gstr2b, note: body.note ? String(body.note).slice(0, 300) : null,
      };
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(e.month)) return NextResponse.json({ error: 'Invalid month' }, { status: 400 });
      if (!['delhivery', 'razorpay', 'other'].includes(e.vendor)) return NextResponse.json({ error: 'Invalid vendor' }, { status: 400 });
      if (!e.invoice_no) return NextResponse.json({ error: 'Invoice number is required' }, { status: 400 });
      if (e.taxable <= 0) return NextResponse.json({ error: 'Taxable value must be more than 0' }, { status: 400 });
      if (e.igst + e.cgst + e.sgst <= 0) return NextResponse.json({ error: 'Enter the GST amount (IGST, or CGST + SGST)' }, { status: 400 });
      if (e.igst > 0 && (e.cgst > 0 || e.sgst > 0)) return NextResponse.json({ error: 'An invoice has either IGST or CGST+SGST, not both' }, { status: 400 });
      if (Math.abs(e.cgst - e.sgst) > 0.011) return NextResponse.json({ error: 'CGST and SGST should be equal' }, { status: 400 });
      const { error } = await supabase.from('gst_itc_entries').insert(e);
      if (error) {
        const dup = (error as { code?: string }).code === '23505';
        return NextResponse.json({ error: dup ? 'This invoice number is already saved for this vendor' : error.message }, { status: dup ? 409 : 500 });
      }
      return NextResponse.json({ success: true });
    }
    if (body.action === 'update_itc_2b') {
      const { error } = await supabase.from('gst_itc_entries').update({ in_gstr2b: !!body.in_gstr2b }).eq('id', String(body.id ?? ''));
      if (error) throw error;
      return NextResponse.json({ success: true });
    }
    if (body.action === 'delete_itc') {
      const { error } = await supabase.from('gst_itc_entries').delete().eq('id', String(body.id ?? ''));
      if (error) throw error;
      return NextResponse.json({ success: true });
    }
    if (body.action === 'save_itc_defaults' || body.action === 'reset_itc_defaults') {
      const raw = body.action === 'reset_itc_defaults' ? DEFAULT_ITC_DEFAULTS : (body.defaults ?? {});
      const pct = (v: unknown, fallback: number) => { const x = Number(v); return Number.isFinite(x) && x >= 0 && x <= 100 ? x : fallback; };
      const value: ItcDefaults = {
        delhivery_gst_rate: pct(raw.delhivery_gst_rate, DEFAULT_ITC_DEFAULTS.delhivery_gst_rate),
        razorpay_gst_rate: pct(raw.razorpay_gst_rate, DEFAULT_ITC_DEFAULTS.razorpay_gst_rate),
        razorpay_fee_percent_ex_gst: pct(raw.razorpay_fee_percent_ex_gst, DEFAULT_ITC_DEFAULTS.razorpay_fee_percent_ex_gst),
        logistics_cost_includes_gst: raw.logistics_cost_includes_gst !== false,
      };
      const { error } = await supabase.from('settings').upsert({ key: 'gst_itc_defaults', value }, { onConflict: 'key' });
      if (error) throw error;
      return NextResponse.json({ success: true, defaults: value });
    }
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    console.error('[gst-report] save failed', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Save failed' }, { status: 500 });
  }
}
