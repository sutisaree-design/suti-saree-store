'use client';

import { useState } from 'react';
import { Check, Copy, Loader2, RotateCcw, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { ItcDefaults, ItcEntry, ItcEstimate, ItcSummary } from '@/lib/gst-report';

export interface ItcPayload {
  entries: ItcEntry[];
  defaults: ItcDefaults;
  factoryDefaults: ItcDefaults;
  estimate: ItcEstimate;
  summary: ItcSummary;
  tableMissing: boolean;
}

const inr = (n: number) => '₹' + (n ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const th = 'px-3 py-2 text-left text-xs font-medium text-muted-foreground whitespace-nowrap';
const td = 'px-3 py-2 text-sm whitespace-nowrap';
const num = 'px-3 py-2 text-sm text-right tabular-nums whitespace-nowrap';
const VENDOR_LABEL: Record<string, string> = { delhivery: 'Delhivery', razorpay: 'Razorpay', other: 'Other' };

async function post(body: Record<string, unknown>) {
  const res = await fetch('/api/admin/gst-report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Request failed');
  return json;
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      type="button" variant="outline" size="sm"
      onClick={async () => {
        try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); toast.success('Copied'); }
        catch { toast.error('Copy nahi hua, manually select karke copy karo'); }
      }}
    >
      {done ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}{label}
    </Button>
  );
}

export default function GstItcSection({ itc, month, output, reload }: {
  itc: ItcPayload; month: string; output: { taxable: number; igst: number; cgst: number; sgst: number }; reload: () => void;
}) {
  const { summary: s, estimate: est } = itc;
  const [defaults, setDefaults] = useState<ItcDefaults>(itc.defaults);
  const [busy, setBusy] = useState(false);
  const blank = { vendor: 'delhivery', invoice_no: '', invoice_date: '', taxable: '', gst_type: 'cgst_sgst', gst: '', in_gstr2b: false };
  const [f, setF] = useState(blank);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try { await fn(); toast.success(ok); reload(); } catch (e) { toast.error(e instanceof Error ? e.message : 'Failed'); } finally { setBusy(false); }
  };

  const addEntry = () => {
    const gst = Number(f.gst) || 0;
    const half = Math.round((gst / 2) * 100) / 100;
    return run(async () => {
      await post({
        action: 'add_itc', month, vendor: f.vendor, invoice_no: f.invoice_no, invoice_date: f.invoice_date || null, taxable: f.taxable,
        igst: f.gst_type === 'igst' ? gst : 0, cgst: f.gst_type === 'igst' ? 0 : half, sgst: f.gst_type === 'igst' ? 0 : half, in_gstr2b: f.in_gstr2b,
      });
      setF(blank);
    }, 'Invoice saved');
  };

  const f2 = (n: number) => n.toFixed(2);
  const copy3b31 = `3.1(a) Outward taxable supplies\nTaxable value: ${f2(output.taxable)}\nIntegrated tax: ${f2(output.igst)}\nCentral tax: ${f2(output.cgst)}\nState/UT tax: ${f2(output.sgst)}`;
  const copy3b4 = `4(A)(5) All other ITC (as per GSTR-2B)\nIntegrated tax: ${f2(s.eligible.igst)}\nCentral tax: ${f2(s.eligible.cgst)}\nState/UT tax: ${f2(s.eligible.sgst)}`;
  const copyPay = `Tax payable in cash (after ITC)\nIntegrated tax: ${f2(s.cashToPay.igst)}\nCentral tax: ${f2(s.cashToPay.cgst)}\nState/UT tax: ${f2(s.cashToPay.sgst)}`;
  const isDefault = JSON.stringify(defaults) === JSON.stringify(itc.factoryDefaults);

  return (
    <section className="rounded-lg border bg-card">
      <div className="border-b px-4 py-3">
        <h3 className="text-sm font-semibold">Input Tax Credit: Delhivery aur Razorpay ka GST wapas</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Delhivery (courier) aur Razorpay (gateway fee) dono 18% GST lete hain. Ye GST aap GSTR-3B me Table 4(A)(5) me claim karke apni GST payable se kam kar sakte ho.
        </p>
      </div>

      <div className="space-y-5 p-4">
        {itc.tableMissing && (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            ITC table abhi bana nahi hai. Supabase SQL editor me <code>20261026000000_gst_rate_snapshot_and_itc.sql</code> chala do.
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Andaaza (estimate)</p><p className="mt-1 text-lg font-semibold tabular-nums">{inr(est.totalGst)}</p><p className="mt-1 text-xs text-muted-foreground">Razorpay {inr(est.razorpay.gst)} · Delhivery {inr(est.delhivery.gst)}</p></div>
          <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Claim kar sakte ho (2B me aa gaya)</p><p className="mt-1 text-lg font-semibold tabular-nums">{inr(s.eligibleTotal)}</p></div>
          <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">2B ka intezaar</p><p className="mt-1 text-lg font-semibold tabular-nums">{inr(s.waitingTotal)}</p><p className="mt-1 text-xs text-muted-foreground">Abhi claim mat karo</p></div>
          <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Cash me bharna (ITC ke baad)</p><p className="mt-1 text-lg font-semibold tabular-nums">{inr(s.cashTotal)}</p></div>
        </div>
        <p className="text-xs text-muted-foreground">
          Estimate sirf andaaza hai (orders, fee % aur courier cost se). Asli claim hamesha invoice ke GST se hota hai, aur wo bhi tabhi jab wo GSTR-2B me dikhe. Razorpay domestic card payment ₹2,000 tak par GST nahi lagata, isliye estimate thoda zyada ho sakta hai.
        </p>

        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full">
            <thead><tr className="border-b"><th className={th}></th><th className={th + ' text-right'}>IGST</th><th className={th + ' text-right'}>CGST</th><th className={th + ' text-right'}>SGST</th></tr></thead>
            <tbody>
              <tr className="border-b"><td className={td}>Output GST (net, sales minus returns)</td><td className={num}>{inr(s.output.igst)}</td><td className={num}>{inr(s.output.cgst)}</td><td className={num}>{inr(s.output.sgst)}</td></tr>
              <tr className="border-b"><td className={td}>ITC claim (Table 4(A)(5))</td><td className={num}>{inr(s.eligible.igst)}</td><td className={num}>{inr(s.eligible.cgst)}</td><td className={num}>{inr(s.eligible.sgst)}</td></tr>
              <tr className="border-b font-semibold"><td className={td}>Cash me bharna</td><td className={num}>{inr(s.cashToPay.igst)}</td><td className={num}>{inr(s.cashToPay.cgst)}</td><td className={num}>{inr(s.cashToPay.sgst)}</td></tr>
              <tr><td className={td}>Agle mahine ke liye bacha ITC</td><td className={num}>{inr(s.carryForward.igst)}</td><td className={num}>{inr(s.carryForward.cgst)}</td><td className={num}>{inr(s.carryForward.sgst)}</td></tr>
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap gap-2">
          <CopyButton text={copy3b31} label="Copy 3.1(a)" />
          <CopyButton text={copy3b4} label="Copy ITC 4(A)(5)" />
          <CopyButton text={copyPay} label="Copy cash payable" />
        </div>

        <div className="rounded-lg border p-3">
          <p className="mb-2 text-sm font-medium">Invoice jodo ({month})</p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <select value={f.vendor} onChange={(e) => setF({ ...f, vendor: e.target.value })} className="h-9 rounded-md border bg-background px-2 text-sm">
              <option value="delhivery">Delhivery</option><option value="razorpay">Razorpay</option><option value="other">Other</option>
            </select>
            <Input placeholder="Invoice number" value={f.invoice_no} onChange={(e) => setF({ ...f, invoice_no: e.target.value })} />
            <Input type="date" value={f.invoice_date} onChange={(e) => setF({ ...f, invoice_date: e.target.value })} />
            <Input type="number" min="0" step="0.01" placeholder="Taxable value (GST se pehle)" value={f.taxable} onChange={(e) => setF({ ...f, taxable: e.target.value })} />
            <select value={f.gst_type} onChange={(e) => setF({ ...f, gst_type: e.target.value })} className="h-9 rounded-md border bg-background px-2 text-sm">
              <option value="cgst_sgst">CGST + SGST (same state)</option><option value="igst">IGST (dusra state)</option>
            </select>
            <Input type="number" min="0" step="0.01" placeholder="Total GST amount" value={f.gst} onChange={(e) => setF({ ...f, gst: e.target.value })} />
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.in_gstr2b} onChange={(e) => setF({ ...f, in_gstr2b: e.target.checked })} /> GSTR-2B me dikh raha hai</label>
            <Button onClick={addEntry} disabled={busy}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Save invoice</Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Invoice par jo GST amount likha hai wahi daalo. Total GST do, CGST aur SGST aadha-aadha apne aap ban jayega.</p>
        </div>

        {itc.entries.length > 0 && (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full">
              <thead><tr className="border-b"><th className={th}>Vendor</th><th className={th}>Invoice</th><th className={th + ' text-right'}>Taxable</th><th className={th + ' text-right'}>IGST</th><th className={th + ' text-right'}>CGST</th><th className={th + ' text-right'}>SGST</th><th className={th}>2B</th><th className={th}></th></tr></thead>
              <tbody>
                {itc.entries.map((e) => (
                  <tr key={e.id} className="border-b last:border-0">
                    <td className={td}>{VENDOR_LABEL[e.vendor]}</td><td className={td}>{e.invoice_no}</td>
                    <td className={num}>{inr(e.taxable)}</td><td className={num}>{inr(e.igst)}</td><td className={num}>{inr(e.cgst)}</td><td className={num}>{inr(e.sgst)}</td>
                    <td className={td}><input type="checkbox" checked={e.in_gstr2b} disabled={busy} onChange={(ev) => run(() => post({ action: 'update_itc_2b', id: e.id, in_gstr2b: ev.target.checked }), 'Updated')} /></td>
                    <td className={td}><Button size="icon" variant="ghost" disabled={busy} onClick={() => { if (confirm('Ye invoice delete karein?')) run(() => post({ action: 'delete_itc', id: e.id }), 'Deleted'); }}><Trash2 className="h-4 w-4" /></Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="rounded-lg border p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium">Defaults (estimate ke liye)</p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={busy || isDefault} onClick={() => run(async () => { const j = await post({ action: 'reset_itc_defaults' }); setDefaults(j.defaults); }, 'Default wapas set ho gaya')}>
                <RotateCcw className="mr-2 h-4 w-4" />Default par reset
              </Button>
              <Button size="sm" disabled={busy} onClick={() => run(() => post({ action: 'save_itc_defaults', defaults }), 'Defaults saved')}><Save className="mr-2 h-4 w-4" />Save</Button>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {([['delhivery_gst_rate', 'Delhivery GST %'], ['razorpay_gst_rate', 'Razorpay GST % (fee par)'], ['razorpay_fee_percent_ex_gst', 'Razorpay fee % (GST ke bina)']] as const).map(([k, label]) => (
              <div key={k}>
                <p className="mb-1 text-xs text-muted-foreground">{label} <span className="opacity-60">(default {itc.factoryDefaults[k]})</span></p>
                <Input type="number" min="0" max="100" step="0.01" value={defaults[k]} onChange={(e) => setDefaults({ ...defaults, [k]: Number(e.target.value) })} />
              </div>
            ))}
          </div>
          <label className="mt-3 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={defaults.logistics_cost_includes_gst} onChange={(e) => setDefaults({ ...defaults, logistics_cost_includes_gst: e.target.checked })} />
            Settings me daala courier cost GST samet hai
          </label>
          <p className="mt-2 text-xs text-muted-foreground">Courier cost per order Admin, Settings me "COD/Prepaid logistics cost" se aata hai. Razorpay fee 2% + 18% GST = 2.36% hi hai jo aapke Settings me pehle se hai.</p>
        </div>

        <div className="rounded-lg border bg-muted/30 p-3 text-sm">
          <p className="mb-1 font-medium">Claim kaise karein (har mahine)</p>
          <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
            <li>Razorpay Dashboard, Reports me "Monthly Invoice Report" download karo. Delhivery ke dashboard ke billing/invoice section se uska invoice lo. Dono par aapka GSTIN hona chahiye.</li>
            <li>GST portal par GSTR-2B kholo (mahine ki 14 tareekh ke aas-paas ban jata hai). Dekho ki dono invoice wahan aaye.</li>
            <li>Jo invoice 2B me dikhe, unhe upar "Invoice jodo" me daalo aur "2B me dikh raha hai" tick karo.</li>
            <li>GSTR-3B me "Copy ITC 4(A)(5)" wali values Table 4(A)(5) "All other ITC" me bharo. Jo invoice 2B me nahi aaya, wo mat bharo. Wo jab aaye tab agle mahine claim hoga.</li>
            <li>Invoice ke 180 din ke andar supplier ko payment ho jani chahiye, warna ITC lautana padta hai.</li>
          </ol>
        </div>
      </div>
    </section>
  );
}
