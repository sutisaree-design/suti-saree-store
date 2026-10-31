'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle2, CircleDashed, Plug, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { fetchAnalyticsSettings, saveAnalyticsSettings, type AnalyticsSettings } from '@/lib/marketing-api';

// ---------------------------------------------------------------------------
// Admin > Integrations
// One place for everything that tells Google (and Meta) what happened on the
// store: GA4, Google Ads conversions + Enhanced Conversions, GTM, Meta Pixel.
// Stored in the same settings row (`analytics_settings`) the storefront
// already reads, so nothing else needs to change for it to take effect.
// ---------------------------------------------------------------------------

const GA_RE = /^G-[A-Z0-9]{6,}$/;
const ADS_RE = /^AW-\d{6,}$/;
const GTM_RE = /^GTM-[A-Z0-9]{4,}$/;
const LABEL_RE = /^[A-Za-z0-9_-]{6,}$/;
const PIXEL_RE = /^\d{8,}$/;

type Status = 'ok' | 'warn' | 'off';

function StatusRow({ status, title, hint }: { status: Status; title: string; hint?: string }) {
  const Icon = status === 'ok' ? CheckCircle2 : status === 'warn' ? AlertTriangle : CircleDashed;
  const color = status === 'ok' ? 'text-emerald-600' : status === 'warn' ? 'text-amber-600' : 'text-muted-foreground';
  return (
    <li className="flex items-start gap-2 text-sm">
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${color}`} />
      <span>
        <span className="font-medium">{title}</span>
        {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      </span>
    </li>
  );
}

function Card({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-lg border border-border bg-card p-5">
      <div>
        <h3 className="font-serif text-lg font-bold text-primary">{title}</h3>
        {desc && <p className="text-xs text-muted-foreground">{desc}</p>}
      </div>
      {children}
    </section>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  placeholder,
  help,
  invalid,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  help?: string;
  invalid?: string | null;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      {invalid ? (
        <p className="text-xs text-amber-700">{invalid}</p>
      ) : (
        help && <p className="text-xs text-muted-foreground">{help}</p>
      )}
    </div>
  );
}

/** "AW-123/AbCd" pasted into the label box -> "AbCd". */
function cleanLabel(v: string) {
  const t = v.trim();
  return t.includes('/') ? t.slice(t.lastIndexOf('/') + 1) : t;
}

export default function IntegrationsPanel() {
  const [form, setForm] = useState<AnalyticsSettings | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchAnalyticsSettings()
      .then(setForm)
      .catch(() => toast.error('Failed to load integration settings'));
  }, []);

  const set = <K extends keyof AnalyticsSettings>(key: K, value: AnalyticsSettings[K]) =>
    setForm((f) => (f ? { ...f, [key]: value } : f));

  const checks = useMemo(() => {
    if (!form) return [];
    const gtmOn = form.gtm_enabled && !!form.gtm_container_id.trim();
    const gaOk = form.ga_enabled && GA_RE.test(form.ga_measurement_id.trim());
    const adsOk = ADS_RE.test(form.google_ads_id.trim());
    const labelOk = LABEL_RE.test(form.google_ads_purchase_label.trim());
    const rows: { status: Status; title: string; hint?: string }[] = [];

    if (gtmOn) {
      rows.push({
        status: 'warn',
        title: 'Google Tag Manager is ON',
        hint: 'While GTM is on, the GA4 / Google Ads tags below are NOT loaded by the site — GTM replaces them. Turn GTM off to use this page, or set the tags up inside GTM.',
      });
    }
    rows.push(
      gaOk
        ? { status: 'ok', title: 'Google Analytics 4 is live', hint: `Sending page views + ecommerce events to ${form.ga_measurement_id.trim()}.` }
        : form.ga_enabled
        ? { status: 'warn', title: 'GA4 is switched on but the Measurement ID is missing or wrong', hint: 'It looks like G-XXXXXXXXXX. Until this is fixed GA4 shows "No data received".' }
        : { status: 'off', title: 'Google Analytics 4 is OFF', hint: 'Switch it on and paste your Measurement ID — this is why GA4 shows "No data received".' }
    );
    rows.push(
      adsOk
        ? { status: 'ok', title: 'Google Ads tag is live', hint: `Remarketing + conversion tracking for ${form.google_ads_id.trim()}.` }
        : { status: 'off', title: 'Google Ads ID not set', hint: 'Needed for conversion tracking and remarketing audiences.' }
    );
    rows.push(
      adsOk && labelOk
        ? { status: 'ok', title: 'Purchase conversion is set up', hint: 'Every paid order is reported to Google Ads with its value, so Smart Bidding can optimise for sales.' }
        : { status: adsOk ? 'warn' : 'off', title: 'Purchase conversion label missing', hint: 'Without it Google Ads cannot see your sales. Add the label (see steps below).' }
    );
    rows.push(
      adsOk && labelOk && form.enhanced_conversions_enabled
        ? { status: 'ok', title: 'Enhanced Conversions is sending customer data', hint: 'Hashed (SHA-256) email, phone and address are attached to each purchase. Also tick "Turn on enhanced conversions" inside Google Ads.' }
        : { status: 'off', title: 'Enhanced Conversions is not active', hint: 'Needs Google Ads ID + purchase label + the switch below.' }
    );
    rows.push(
      form.meta_pixel_enabled && PIXEL_RE.test(form.meta_pixel_id.trim())
        ? { status: 'ok', title: 'Meta Pixel is live', hint: form.meta_events_enabled ? 'PageView + ViewContent, AddToCart, InitiateCheckout, Purchase.' : 'PageView only (standard events are switched off).' }
        : { status: 'off', title: 'Meta Pixel is OFF' }
    );
    return rows;
  }, [form]);

  if (!form) return <p className="py-6 text-sm text-muted-foreground">Loading…</p>;

  const gaInvalid = form.ga_measurement_id && !GA_RE.test(form.ga_measurement_id.trim()) ? 'Should look like G-XXXXXXXXXX' : null;
  const adsInvalid = form.google_ads_id && !ADS_RE.test(form.google_ads_id.trim()) ? 'Should look like AW-123456789' : null;
  const gtmInvalid = form.gtm_container_id && !GTM_RE.test(form.gtm_container_id.trim()) ? 'Should look like GTM-XXXXXXX' : null;
  const pixelInvalid = form.meta_pixel_id && !PIXEL_RE.test(form.meta_pixel_id.trim()) ? 'Pixel ID is a number, e.g. 123456789012345' : null;
  const labelInvalid = (v: string) => (v && !LABEL_RE.test(v.trim()) ? 'Paste only the label — the part after the slash in AW-123456789/AbCdEfGh' : null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form) return;
    // Tidy what the admin pasted so a stray space or full "AW-123/label" string can't break tracking.
    const adsIdRaw = form.google_ads_id.trim();
    const adsId = adsIdRaw.includes('/') ? adsIdRaw.slice(0, adsIdRaw.indexOf('/')) : adsIdRaw;
    const next: AnalyticsSettings = {
      ...form,
      ga_measurement_id: form.ga_measurement_id.trim(),
      gtm_container_id: form.gtm_container_id.trim(),
      meta_pixel_id: form.meta_pixel_id.trim(),
      google_ads_id: adsId,
      google_ads_purchase_label: cleanLabel(form.google_ads_purchase_label || (adsIdRaw.includes('/') ? adsIdRaw : '')),
      google_ads_add_to_cart_label: cleanLabel(form.google_ads_add_to_cart_label),
      google_ads_begin_checkout_label: cleanLabel(form.google_ads_begin_checkout_label),
    };
    if (next.ga_enabled && !GA_RE.test(next.ga_measurement_id)) return void toast.error('GA4 is on but the Measurement ID looks wrong (G-XXXXXXXXXX).');
    if (next.google_ads_id && !ADS_RE.test(next.google_ads_id)) return void toast.error('Google Ads ID should look like AW-123456789.');
    if (next.gtm_enabled && !GTM_RE.test(next.gtm_container_id)) return void toast.error('GTM is on but the Container ID looks wrong (GTM-XXXXXXX).');
    if (next.meta_pixel_enabled && !PIXEL_RE.test(next.meta_pixel_id)) return void toast.error('Meta Pixel is on but the Pixel ID looks wrong.');
    for (const l of [next.google_ads_purchase_label, next.google_ads_add_to_cart_label, next.google_ads_begin_checkout_label]) {
      if (l && !LABEL_RE.test(l)) return void toast.error('A conversion label looks wrong — paste only the part after the slash.');
    }
    setSaving(true);
    try {
      await saveAnalyticsSettings(next);
      setForm(next);
      toast.success('Integrations saved — live on the site within a minute');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="max-w-3xl space-y-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-amber-600">Admin</p>
        <h1 className="flex items-center gap-2 font-serif text-3xl font-bold text-primary">
          <Plug className="h-6 w-6" /> Integrations
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Connect Google Analytics, Google Ads (with Enhanced Conversions) and Meta so every sale is measured
          correctly — this is what lets Google Ads find more buyers and spend your budget well.
        </p>
      </div>

      <Card title="Setup status" desc="Updates as you type. Save to apply.">
        <ul className="space-y-2.5">
          {checks.map((c, i) => (
            <StatusRow key={i} {...c} />
          ))}
        </ul>
      </Card>

      <Card title="Google Analytics 4" desc="Page views, product views, add to cart, checkout and purchases.">
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="int-ga-on">Enable Google Analytics 4</Label>
          <Switch id="int-ga-on" checked={form.ga_enabled} onCheckedChange={(v) => set('ga_enabled', v)} />
        </div>
        <Field
          id="int-ga-id"
          label="Measurement ID"
          value={form.ga_measurement_id}
          onChange={(v) => set('ga_measurement_id', v)}
          placeholder="G-XXXXXXXXXX"
          invalid={gaInvalid}
          help="Google Analytics → Admin → Data streams → your web stream → Measurement ID (top right)."
        />
      </Card>

      <Card
        title="Google Ads — conversions & Enhanced Conversions"
        desc="Tells Google Ads which clicks turned into paid orders, and how much each was worth."
      >
        <Field
          id="int-ads-id"
          label="Google Ads ID (Conversion ID)"
          value={form.google_ads_id}
          onChange={(v) => set('google_ads_id', v)}
          placeholder="AW-123456789"
          invalid={adsInvalid}
        />
        <Field
          id="int-ads-purchase"
          label="Purchase conversion label"
          value={form.google_ads_purchase_label}
          onChange={(v) => set('google_ads_purchase_label', v)}
          placeholder="AbCdEfGhIjKlMnOp"
          invalid={labelInvalid(form.google_ads_purchase_label)}
          help="The part after the slash in AW-123456789/AbCdEfGh. You can paste the whole thing — we keep only the label."
        />
        <div className="flex items-start justify-between gap-4 rounded-md bg-muted/40 p-3">
          <div>
            <Label htmlFor="int-ec">Enhanced Conversions</Label>
            <p className="text-xs text-muted-foreground">
              Sends the customer’s email, phone and delivery address with each purchase. Google hashes it
              (SHA-256) in the browser before it leaves — we never send it readable. Recovers sales that
              cookies alone miss, so reporting and Smart Bidding get more accurate. Recommended: ON.
            </p>
          </div>
          <Switch id="int-ec" checked={form.enhanced_conversions_enabled} onCheckedChange={(v) => set('enhanced_conversions_enabled', v)} />
        </div>

        <details className="rounded-md border border-border p-3 text-sm">
          <summary className="cursor-pointer font-medium">Optional: also track Add to cart / Begin checkout in Google Ads</summary>
          <div className="mt-3 space-y-3">
            <Field
              id="int-ads-atc"
              label="Add to cart conversion label"
              value={form.google_ads_add_to_cart_label}
              onChange={(v) => set('google_ads_add_to_cart_label', v)}
              placeholder="(optional)"
              invalid={labelInvalid(form.google_ads_add_to_cart_label)}
            />
            <Field
              id="int-ads-bc"
              label="Begin checkout conversion label"
              value={form.google_ads_begin_checkout_label}
              onChange={(v) => set('google_ads_begin_checkout_label', v)}
              placeholder="(optional)"
              invalid={labelInvalid(form.google_ads_begin_checkout_label)}
              help="Create these as SECONDARY conversions in Google Ads so they don’t distort bidding."
            />
          </div>
        </details>

        <details className="rounded-md border border-border p-3 text-sm" open>
          <summary className="cursor-pointer font-medium">How to get the ID and label (one time, ~3 minutes)</summary>
          <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-xs text-muted-foreground">
            <li>Google Ads → <b>Goals</b> → <b>Conversions</b> → <b>New conversion action</b> → <b>Website</b>.</li>
            <li>Choose <b>Purchase</b>. Value: <b>use different values for each conversion</b>, currency INR. Count: <b>One</b>. Create it.</li>
            <li>On the tag setup step pick <b>Use Google tag</b> / install manually and look for <code>send_to: &apos;AW-123456789/AbCdEfGh&apos;</code>. Paste <b>AW-123456789</b> in the ID box and <b>AbCdEfGh</b> in the label box above.</li>
            <li>Google Ads → Goals → Conversions → <b>Settings</b> → <b>Enhanced conversions for web</b> → tick <b>Turn on enhanced conversions</b> and choose the <b>Google tag</b> method.</li>
            <li>Make this Purchase conversion your <b>Primary</b> goal. If you also import GA4’s “purchase” into Ads, set only ONE of them as Primary — otherwise every sale is counted twice.</li>
            <li>Place a test order, then in Google Ads check the conversion status (it can take up to a day to turn “Recording conversions”).</li>
          </ol>
        </details>
      </Card>

      <Card title="Google Tag Manager" desc="Only if you manage tags inside GTM. Leave OFF to use the direct GA4 + Google Ads setup above.">
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="int-gtm-on">Enable Google Tag Manager</Label>
          <Switch id="int-gtm-on" checked={form.gtm_enabled} onCheckedChange={(v) => set('gtm_enabled', v)} />
        </div>
        <Field
          id="int-gtm-id"
          label="Container ID"
          value={form.gtm_container_id}
          onChange={(v) => set('gtm_container_id', v)}
          placeholder="GTM-XXXXXXX"
          invalid={gtmInvalid}
        />
        {form.gtm_enabled && (
          <p className="flex items-start gap-2 rounded-md bg-amber-50 p-2.5 text-xs text-amber-800">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            With GTM on, the site stops loading GA4 / Google Ads itself. Make sure those tags exist inside your GTM container.
          </p>
        )}
      </Card>

      <Card title="Meta (Facebook / Instagram) Pixel" desc="For Facebook & Instagram ads and retargeting.">
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="int-pixel-on">Enable Meta Pixel</Label>
          <Switch id="int-pixel-on" checked={form.meta_pixel_enabled} onCheckedChange={(v) => set('meta_pixel_enabled', v)} />
        </div>
        <Field
          id="int-pixel-id"
          label="Pixel ID"
          value={form.meta_pixel_id}
          onChange={(v) => set('meta_pixel_id', v)}
          placeholder="123456789012345"
          invalid={pixelInvalid}
        />
        <div className="flex items-start justify-between gap-4">
          <div>
            <Label htmlFor="int-meta-events">Track shopping events</Label>
            <p className="text-xs text-muted-foreground">
              ViewContent, AddToCart, InitiateCheckout and Purchase (with order value) — needed for Meta to optimise for sales, not just visits.
            </p>
          </div>
          <Switch id="int-meta-events" checked={form.meta_events_enabled} onCheckedChange={(v) => set('meta_events_enabled', v)} />
        </div>
      </Card>

      <p className="text-xs text-muted-foreground">
        Google Customer Reviews and Trustpilot stay in Marketing → Analytics.
      </p>

      <Button type="submit" disabled={saving} className="bg-primary">
        <Save className="mr-1.5 h-4 w-4" /> {saving ? 'Saving…' : 'Save Integrations'}
      </Button>
    </form>
  );
}
