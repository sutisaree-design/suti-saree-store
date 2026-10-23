'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Download, Loader2, RefreshCw, Save } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { GstReport } from '@/lib/gst-report';
import GstItcSection, { type ItcPayload } from './gst-itc-section';

const inr = (n: number) => '₹' + (n ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const thisMonth = () => {
  // current month in IST
  const d = new Date(Date.now() + 5.5 * 3600_000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

interface ReportResponse { month: string; gstin: string; storeName: string; sellerStateCode: string | null; report: GstReport; itc: ItcPayload }
interface ProductRow { id: string; name: string; gst_rate: number | null; hsn_code: string | null }

const th = 'px-3 py-2 text-left text-xs font-medium text-muted-foreground whitespace-nowrap';
const td = 'px-3 py-2 text-sm whitespace-nowrap';
const num = 'px-3 py-2 text-sm text-right tabular-nums whitespace-nowrap';

function Card({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border bg-card">
      <div className="border-b px-4 py-3">
        <h3 className="text-sm font-semibold">{title}</h3>
        {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      </div>
      <div className="overflow-x-auto">{children}</div>
    </section>
  );
}

export default function GstReportPanel() {
  const [month, setMonth] = useState(thisMonth());
  const [data, setData] = useState<ReportResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [products, setProducts] = useState<ProductRow[] | null>(null);
  const [defaults, setDefaults] = useState({ default_hsn: '', default_description: '' });
  const [showProducts, setShowProducts] = useState(false);
  const [query, setQuery] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/gst-report?month=${month}`, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load report');
      setData(json);
    } catch (e) {
      setData(null);
      setError(e instanceof Error ? e.message : 'Failed to load report');
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => { load(); }, [load]);

  const loadProducts = async () => {
    const res = await fetch('/api/admin/gst-report?view=products', { cache: 'no-store' });
    const json = await res.json();
    if (!res.ok) return toast.error(json.error || 'Failed to load products');
    setProducts(json.products);
    setDefaults(json.defaults);
  };

  useEffect(() => { if (showProducts && !products) loadProducts(); }, [showProducts, products]);

  const saveProduct = async (p: ProductRow) => {
    setSavingId(p.id);
    const res = await fetch('/api/admin/gst-report', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'save_product', id: p.id, gst_rate: p.gst_rate ?? 5, hsn_code: p.hsn_code ?? '' }),
    });
    const json = await res.json();
    setSavingId(null);
    if (!res.ok) return toast.error(json.error || 'Save failed');
    toast.success('Saved. Refresh the report to see the change.');
  };

  const saveDefaults = async () => {
    const res = await fetch('/api/admin/gst-report', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'save_defaults', ...defaults }),
    });
    const json = await res.json();
    if (!res.ok) return toast.error(json.error || 'Save failed');
    toast.success('Default HSN saved');
    load();
  };

  const patchProduct = (id: string, patch: Partial<ProductRow>) =>
    setProducts((list) => list && list.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  const filteredProducts = useMemo(
    () => (products ?? []).filter((p) => p.name.toLowerCase().includes(query.toLowerCase())).slice(0, 100),
    [products, query]
  );

  const r = data?.report;
  const dl = (type: string) => `/api/admin/gst-report?month=${month}&format=csv&type=${type}`;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-serif text-2xl font-semibold">GST Report</h2>
          <p className="text-sm text-muted-foreground">
            Orders se automatic GSTR-1 aur GSTR-3B ka data. Month chuno, download karo, GST portal par daalo.
          </p>
        </div>
        <div className="flex items-end gap-2">
          <div>
            <p className="mb-1 text-xs text-muted-foreground">Month (IST)</p>
            <Input type="month" value={month} max={thisMonth()} onChange={(e) => e.target.value && setMonth(e.target.value)} className="w-44" />
          </div>
          <Button variant="outline" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Refresh
          </Button>
        </div>
      </div>

      {error && <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>}

      {r && data && (
        <>
          <p className="text-xs text-muted-foreground">
            {data.storeName} · GSTIN {data.gstin || 'not set'} · Seller state code {data.sellerStateCode ?? '?'}
          </p>

          {r.warnings.length > 0 && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              <p className="mb-1 flex items-center gap-2 font-medium"><AlertTriangle className="h-4 w-4" /> Filing se pehle dekho</p>
              <ul className="list-disc space-y-1 pl-5">{r.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Card label="Invoices (orders)" value={String(r.summary.orders)} sub={`${r.excluded.length} excluded`} />
            <Card label="Invoice value (with GST)" value={inr(r.summary.invoiceValue)} />
            <Card label="Taxable value (net)" value={inr(r.net.taxable)} sub={`after ${inr(r.creditNotes.taxable)} returns`} />
            <Card label="GST payable (net)" value={inr(r.net.totalTax)} sub={`IGST ${inr(r.net.igst)} · CGST ${inr(r.net.cgst)} · SGST ${inr(r.net.sgst)}`} />
          </div>

          <div className="flex flex-wrap gap-2">
            {[['b2cs', 'GSTR-1 B2CS (CSV)'], ['hsn', 'GSTR-1 HSN summary (CSV)'], ['3b', 'GSTR-3B figures (CSV)'], ['orders', 'Order-wise (CSV)']].map(([t, label]) => (
              <Button key={t} asChild variant="outline" size="sm">
                <a href={dl(t)}><Download className="mr-2 h-4 w-4" />{label}</a>
              </Button>
            ))}
          </div>

          <Section title="GSTR-3B · Table 3.1(a) Outward taxable supplies" hint="Ye 3 numbers seedha 3B me bharo. Net = sales minus returns (credit notes).">
            <table className="w-full">
              <thead><tr className="border-b"><th className={th}></th><th className={th + ' text-right'}>Taxable value</th><th className={th + ' text-right'}>IGST</th><th className={th + ' text-right'}>CGST</th><th className={th + ' text-right'}>SGST</th></tr></thead>
              <tbody>
                <tr className="border-b"><td className={td}>Sales</td><td className={num}>{inr(r.summary.taxable)}</td><td className={num}>{inr(r.summary.igst)}</td><td className={num}>{inr(r.summary.cgst)}</td><td className={num}>{inr(r.summary.sgst)}</td></tr>
                <tr className="border-b"><td className={td}>Less: returns ({r.creditNotes.count})</td><td className={num}>{inr(r.creditNotes.taxable)}</td><td className={num}>{inr(r.creditNotes.igst)}</td><td className={num}>{inr(r.creditNotes.cgst)}</td><td className={num}>{inr(r.creditNotes.sgst)}</td></tr>
                <tr className="font-semibold"><td className={td}>Net to report</td><td className={num}>{inr(r.net.taxable)}</td><td className={num}>{inr(r.net.igst)}</td><td className={num}>{inr(r.net.cgst)}</td><td className={num}>{inr(r.net.sgst)}</td></tr>
              </tbody>
            </table>
          </Section>

          <Section title="GSTR-1 · Table 7 B2CS (state-wise, rate-wise)" hint="Customers GST registered nahi hain, isliye sab B2C small me aata hai. Place of supply = delivery state.">
            <table className="w-full">
              <thead><tr className="border-b"><th className={th}>Place of supply</th><th className={th + ' text-right'}>Rate</th><th className={th + ' text-right'}>Taxable value</th><th className={th + ' text-right'}>IGST</th><th className={th + ' text-right'}>CGST</th><th className={th + ' text-right'}>SGST</th></tr></thead>
              <tbody>
                {r.b2cs.map((x, i) => (
                  <tr key={i} className="border-b last:border-0"><td className={td}>{x.pos}</td><td className={num}>{x.rate}%</td><td className={num}>{inr(x.taxable)}</td><td className={num}>{inr(x.igst)}</td><td className={num}>{inr(x.cgst)}</td><td className={num}>{inr(x.sgst)}</td></tr>
                ))}
                {r.b2cs.length === 0 && <tr><td className={td} colSpan={6}>Is month me koi supply nahi.</td></tr>}
              </tbody>
            </table>
          </Section>

          <Section title="GSTR-1 · Table 12 HSN summary">
            <table className="w-full">
              <thead><tr className="border-b"><th className={th}>HSN</th><th className={th + ' text-right'}>Qty</th><th className={th + ' text-right'}>Rate</th><th className={th + ' text-right'}>Total value</th><th className={th + ' text-right'}>Taxable</th><th className={th + ' text-right'}>IGST</th><th className={th + ' text-right'}>CGST</th><th className={th + ' text-right'}>SGST</th></tr></thead>
              <tbody>
                {r.hsn.map((h, i) => (
                  <tr key={i} className="border-b last:border-0"><td className={td}>{h.hsn || <span className="text-destructive">missing</span>}</td><td className={num}>{h.qty}</td><td className={num}>{h.rate}%</td><td className={num}>{inr(h.value)}</td><td className={num}>{inr(h.taxable)}</td><td className={num}>{inr(h.igst)}</td><td className={num}>{inr(h.cgst)}</td><td className={num}>{inr(h.sgst)}</td></tr>
                ))}
              </tbody>
            </table>
          </Section>

          {r.excluded.length > 0 && (
            <Section title={`Excluded orders (${r.excluded.length})`} hint="Ye GST me count nahi hue. Agar koi galat dikhe to order status check karo.">
              <table className="w-full">
                <thead><tr className="border-b"><th className={th}>Order</th><th className={th}>Status</th><th className={th}>Reason</th><th className={th + ' text-right'}>Amount</th></tr></thead>
                <tbody>
                  {r.excluded.slice(0, 200).map((x) => (
                    <tr key={x.orderId} className="border-b last:border-0"><td className={td}>{x.orderId.slice(0, 8)}</td><td className={td}>{x.status}</td><td className={td}>{x.reason}</td><td className={num}>{inr(x.amount)}</td></tr>
                  ))}
                </tbody>
              </table>
            </Section>
          )}
        </>
      )}

      {data && <GstItcSection key={data.month + JSON.stringify(data.itc.entries.map((e) => e.id + e.in_gstr2b))} itc={data.itc} month={data.month} output={data.report.net} reload={load} />}

      <section className="rounded-lg border bg-card">
        <button type="button" onClick={() => setShowProducts((v) => !v)} className="flex w-full items-center justify-between px-4 py-3 text-left">
          <span>
            <span className="block text-sm font-semibold">HSN code aur GST rate (per product)</span>
            <span className="block text-xs text-muted-foreground">Report har product ke apne rate se banti hai. Pehli baar HSN yahan bhar do.</span>
          </span>
          <span className="text-xs text-muted-foreground">{showProducts ? 'Hide' : 'Show'}</span>
        </button>
        {showProducts && (
          <div className="space-y-4 border-t p-4">
            <div className="flex flex-wrap items-end gap-2">
              <div>
                <p className="mb-1 text-xs text-muted-foreground">Default HSN (jinke paas apna HSN nahi)</p>
                <Input value={defaults.default_hsn} onChange={(e) => setDefaults((d) => ({ ...d, default_hsn: e.target.value }))} className="w-40" placeholder="e.g. 5007" />
              </div>
              <div>
                <p className="mb-1 text-xs text-muted-foreground">Description</p>
                <Input value={defaults.default_description} onChange={(e) => setDefaults((d) => ({ ...d, default_description: e.target.value }))} className="w-64" />
              </div>
              <Button size="sm" onClick={saveDefaults}><Save className="mr-2 h-4 w-4" />Save default</Button>
            </div>
            <Input placeholder="Product search..." value={query} onChange={(e) => setQuery(e.target.value)} className="max-w-xs" />
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead><tr className="border-b"><th className={th}>Product</th><th className={th}>HSN</th><th className={th}>GST %</th><th className={th}></th></tr></thead>
                <tbody>
                  {filteredProducts.map((p) => (
                    <tr key={p.id} className="border-b last:border-0">
                      <td className={td + ' max-w-[320px] truncate'}>{p.name}</td>
                      <td className={td}><Input value={p.hsn_code ?? ''} onChange={(e) => patchProduct(p.id, { hsn_code: e.target.value })} className="h-8 w-28" placeholder="HSN" /></td>
                      <td className={td}>
                        <select value={p.gst_rate ?? 5} onChange={(e) => patchProduct(p.id, { gst_rate: Number(e.target.value) })} className="h-8 rounded-md border bg-background px-2 text-sm">
                          {[0, 3, 5, 12, 18, 28].map((v) => <option key={v} value={v}>{v}%</option>)}
                        </select>
                      </td>
                      <td className={td}><Button size="sm" variant="outline" disabled={savingId === p.id} onClick={() => saveProduct(p)}>{savingId === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}</Button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {products && products.length > 100 && <p className="mt-2 text-xs text-muted-foreground">Pehle 100 dikh rahe hain. Search se baaki dhundho.</p>}
            </div>
          </div>
        )}
      </section>

      <p className="text-xs text-muted-foreground">
        Ye report orders ke data se bani ek help hai, CA ki salah ka substitute nahi. Filing se pehle apne CA ya GST portal ke figures se ek baar match kar lena.
      </p>
    </div>
  );
}
