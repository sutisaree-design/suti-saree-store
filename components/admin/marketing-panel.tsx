'use client';

import { useEffect, useState, FormEvent } from 'react';
import { Save, Download, Trash2, ExternalLink, Copy, Upload, Loader2 } from 'lucide-react';
import Image from 'next/image';
import {
  LegalPages,
  LEGAL_PAGE_TITLES,
  LegalSlug,
  fetchLegalPages,
  saveLegalPages,
  MarketingSettings,
  fetchMarketingSettings,
  saveMarketingSettings,
  NewsletterSubscriber,
  fetchNewsletterSubscribers,
  deleteNewsletterSubscriber,
  SeoSettings,
  fetchSeoSettings,
  saveSeoSettings,
  AnalyticsSettings,
  fetchAnalyticsSettings,
  saveAnalyticsSettings,
  FulfillmentSettings,
  DEFAULT_FULFILLMENT_SETTINGS,
  fetchFulfillmentSettings,
  saveFulfillmentSettings,
  SHIPPING_POLICY_TEMPLATE,
  REFUND_POLICY_TEMPLATE,
  PRIVACY_POLICY_TEMPLATE,
  TERMS_CONDITIONS_TEMPLATE,
} from '@/lib/marketing-api';
import {
  SocialPublishSettings,
} from '@/lib/settings-api';
import {
  GrowthSettings,
  DEFAULT_GROWTH_SETTINGS,
  fetchGrowthSettings,
  saveGrowthSettings,
} from '@/lib/growth-api';
import {
  CheckoutBumpSettings,
  DEFAULT_CHECKOUT_BUMP_SETTINGS,
  fetchCheckoutBumpSettings,
  saveCheckoutBumpSettings,
} from '@/lib/checkout-bump-api';
import { fetchProducts, uploadProductImage } from '@/lib/products-api';
import { Product } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';

const LEGAL_SLUGS = Object.keys(LEGAL_PAGE_TITLES) as LegalSlug[];

export default function MarketingPanel() {
  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle>Marketing & SEO</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="legal">
          <TabsList>
            <TabsTrigger value="fulfillment">Shipping & Returns Timing</TabsTrigger>
            <TabsTrigger value="legal">Legal Pages</TabsTrigger>
            <TabsTrigger value="whatsapp">WhatsApp</TabsTrigger>
            <TabsTrigger value="growth">Growth Tools</TabsTrigger>
            <TabsTrigger value="checkout-bump">Checkout Bump</TabsTrigger>
            <TabsTrigger value="newsletter">Newsletter</TabsTrigger>
            <TabsTrigger value="feed">Merchant Feed</TabsTrigger>
            <TabsTrigger value="seo">SEO</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
            <TabsTrigger value="social-publish">Social Auto-Post</TabsTrigger>
          </TabsList>

          <TabsContent value="fulfillment"><FulfillmentTimingTab /></TabsContent>
          <TabsContent value="legal"><LegalPagesTab /></TabsContent>
          <TabsContent value="whatsapp"><WhatsAppTab /></TabsContent>
          <TabsContent value="growth"><GrowthTab /></TabsContent>
          <TabsContent value="checkout-bump"><CheckoutBumpTab /></TabsContent>
          <TabsContent value="newsletter"><NewsletterTab /></TabsContent>
          <TabsContent value="feed"><MerchantFeedTab /></TabsContent>
          <TabsContent value="seo"><SeoTab /></TabsContent>
          <TabsContent value="analytics"><AnalyticsTab /></TabsContent>
          <TabsContent value="social-publish"><SocialPublishTab /></TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------
// Shipping & Returns Timing — THE single place to set dispatch/delivery/
// return/cancellation windows. Every other surface (product page,
// footer badges, checkout trust badges, legal pages via {{tokens}},
// live chat, order-return eligibility, and the Google Merchant Center
// feed) reads from this one settings row, so changing a number here
// updates the whole site at once — no more hunting through multiple
// pages to keep the numbers consistent, and no risk of the site
// contradicting what's declared to Google Merchant Center.
// ---------------------------------------------------------------------

function FulfillmentTimingTab() {
  const [settings, setSettings] = useState<FulfillmentSettings | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchFulfillmentSettings()
      .then(setSettings)
      .catch(() => toast.error('Failed to load shipping & returns timing'));
  }, []);

  const set = (key: keyof FulfillmentSettings, value: number) =>
    setSettings((s) => (s ? { ...s, [key]: value } : s));

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    setSaving(true);
    try {
      await saveFulfillmentSettings(settings);
      toast.success('Shipping & returns timing saved — this updates everywhere it\'s shown');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (!settings) return <p className="py-6 text-sm text-muted-foreground">Loading...</p>;

  const numField = (
    key: keyof FulfillmentSettings,
    label: string,
  ) => (
    <div className="space-y-1.5">
      <Label htmlFor={key}>{label}</Label>
      <Input
        id={key}
        type="number"
        min={0}
        value={settings[key]}
        onChange={(e) => set(key, Number(e.target.value))}
      />
    </div>
  );

  return (
    <form onSubmit={onSubmit} className="mt-4 space-y-6">
      <p className="text-sm text-muted-foreground">
        These numbers drive every "dispatched in X days" / "X-day returns" / "cancel within X hours"
        message across the site — the product page, checkout badges, the footer, the live chat
        widget, the legal pages (wherever they use a <code>{'{{token}}'}</code>, see below), and the
        Google Merchant Center feed. Update them once here instead of editing each page separately.
      </p>

      <div className="space-y-3">
        <h4 className="text-sm font-semibold">Dispatch (order confirmed → handed to courier)</h4>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {numField('dispatch_days_min', 'Min days')}
          {numField('dispatch_days_max', 'Max days')}
        </div>
      </div>

      <div className="space-y-3">
        <h4 className="text-sm font-semibold">Delivery (courier pickup → doorstep), by zone</h4>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {numField('delivery_metro_min', 'Metro cities: min')}
          {numField('delivery_metro_max', 'Metro cities: max')}
          {numField('delivery_other_min', 'Other cities: min')}
          {numField('delivery_other_max', 'Other cities: max')}
          {numField('delivery_remote_min', 'Remote areas: min')}
          {numField('delivery_remote_max', 'Remote areas: max')}
        </div>
      </div>

      <div className="space-y-3">
        <h4 className="text-sm font-semibold">Cancellation & returns</h4>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {numField('cancellation_window_hours', 'Cancel within (hours)')}
          {numField('return_window_days', 'Return within (days)')}
        </div>
      </div>

      <Button type="submit" disabled={saving} className="gap-2 bg-primary">
        <Save className="h-4 w-4" />
        {saving ? 'Saving...' : 'Save Shipping & Returns Timing'}
      </Button>
    </form>
  );
}

// ---------------------------------------------------------------------
// Legal Pages
// ---------------------------------------------------------------------

function LegalPagesTab() {
  const [pages, setPages] = useState<LegalPages | null>(null);
  const [activeSlug, setActiveSlug] = useState<LegalSlug>('privacy-policy');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchLegalPages()
      .then(setPages)
      .catch(() => toast.error('Failed to load legal pages'));
  }, []);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!pages) return;
    setSaving(true);
    try {
      await saveLegalPages(pages);
      toast.success('Legal pages saved');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (!pages) return <p className="py-6 text-sm text-muted-foreground">Loading...</p>;

  return (
    <form onSubmit={onSubmit} className="mt-4 space-y-4">
      <div className="flex flex-wrap gap-2">
        {LEGAL_SLUGS.map((slug) => (
          <button
            type="button"
            key={slug}
            onClick={() => setActiveSlug(slug)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              activeSlug === slug
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border text-muted-foreground hover:border-primary'
            }`}
          >
            {LEGAL_PAGE_TITLES[slug]}
          </button>
        ))}
      </div>

      {(activeSlug === 'shipping-policy' || activeSlug === 'refund-policy') && (
        <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-xs">
          <p className="font-medium text-foreground">
            Keep this in sync with Admin &gt; Marketing &gt; Shipping &amp; Returns Timing and
            Admin &gt; Settings &gt; GST &amp; Shipping
          </p>
          <p className="mt-1 text-muted-foreground">
            Use these tokens anywhere in the text below and they'll always show the live numbers
            from those settings, instead of numbers you'd otherwise have to update by hand every
            time they change:{' '}
            <code>{'{{dispatch_days}}'}</code>, <code>{'{{metro_days}}'}</code>,{' '}
            <code>{'{{other_days}}'}</code>, <code>{'{{remote_days}}'}</code>,{' '}
            <code>{'{{return_days}}'}</code>, <code>{'{{cancellation_hours}}'}</code>,{' '}
            <code>{'{{shipping_fee}}'}</code>, <code>{'{{free_shipping_threshold}}'}</code>.
          </p>
          <button
            type="button"
            onClick={() =>
              setPages({
                ...pages,
                [activeSlug]: activeSlug === 'shipping-policy' ? SHIPPING_POLICY_TEMPLATE : REFUND_POLICY_TEMPLATE,
              })
            }
            className="mt-2 rounded border border-primary/40 px-2 py-1 font-medium text-primary hover:bg-primary/10"
          >
            Replace with ready-made template (tokens included)
          </button>
        </div>
      )}

      {(activeSlug === 'privacy-policy' || activeSlug === 'terms-conditions') && (
        <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-xs">
          <p className="font-medium text-foreground">Ready-made AruhiHandlooms template</p>
          <p className="mt-1 text-muted-foreground">
            Drops in a complete, pre-written {LEGAL_PAGE_TITLES[activeSlug]} for aruhihandlooms.com
            (contact email, phone number, and registered address already filled in). Review it and
            adjust anything specific to your business before saving.
          </p>
          <button
            type="button"
            onClick={() =>
              setPages({
                ...pages,
                [activeSlug]:
                  activeSlug === 'privacy-policy' ? PRIVACY_POLICY_TEMPLATE : TERMS_CONDITIONS_TEMPLATE,
              })
            }
            className="mt-2 rounded border border-primary/40 px-2 py-1 font-medium text-primary hover:bg-primary/10"
          >
            Replace with ready-made template
          </button>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="legal-content">{LEGAL_PAGE_TITLES[activeSlug]} content</Label>
        <Textarea
          id="legal-content"
          rows={14}
          value={pages[activeSlug]}
          onChange={(e) => setPages({ ...pages, [activeSlug]: e.target.value })}
          placeholder={`Write your ${LEGAL_PAGE_TITLES[activeSlug].toLowerCase()} here...`}
        />
        <p className="text-xs text-muted-foreground">
          Live at <code>/legal/{activeSlug}</code>. Plain text — line breaks are preserved.
        </p>
      </div>

      <Button type="submit" disabled={saving} className="gap-2 bg-primary">
        <Save className="h-4 w-4" />
        {saving ? 'Saving...' : 'Save Legal Pages'}
      </Button>
    </form>
  );
}

// ---------------------------------------------------------------------
// WhatsApp + Merchant Feed share one settings row, split into two tabs
// ---------------------------------------------------------------------

function useMarketingSettings() {
  const [settings, setSettings] = useState<MarketingSettings | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchMarketingSettings()
      .then(setSettings)
      .catch(() => toast.error('Failed to load marketing settings'));
  }, []);

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      await saveMarketingSettings(settings);
      toast.success('Marketing settings saved');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return { settings, setSettings, saving, save };
}

function WhatsAppTab() {
  const { settings, setSettings, saving, save } = useMarketingSettings();

  if (!settings) return <p className="py-6 text-sm text-muted-foreground">Loading...</p>;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      className="mt-4 max-w-lg space-y-4"
    >
      <div className="flex items-center justify-between rounded-lg border border-border p-3">
        <div>
          <Label htmlFor="wa-enabled">Show floating WhatsApp button</Label>
          <p className="text-xs text-muted-foreground">Appears on every storefront page (not in admin).</p>
        </div>
        <Switch
          id="wa-enabled"
          checked={settings.whatsapp_enabled}
          onCheckedChange={(checked) => setSettings({ ...settings, whatsapp_enabled: checked })}
        />
      </div>

      <div className="flex items-center justify-between rounded-lg border border-border p-3">
        <div>
          <Label htmlFor="wa-chat-widget-enabled">Show WhatsApp bar inside chat popup</Label>
          <p className="text-xs text-muted-foreground">
            Controls only the "Prefer WhatsApp?" bar inside the on-site chat popup, separate from the floating button above.
          </p>
        </div>
        <Switch
          id="wa-chat-widget-enabled"
          checked={settings.whatsapp_chat_widget_enabled}
          onCheckedChange={(checked) => setSettings({ ...settings, whatsapp_chat_widget_enabled: checked })}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="wa-number">WhatsApp number (with country code, digits only)</Label>
        <Input
          id="wa-number"
          value={settings.whatsapp_number}
          onChange={(e) => setSettings({ ...settings, whatsapp_number: e.target.value })}
          placeholder="919876543210"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="wa-message">Pre-filled message</Label>
        <Textarea
          id="wa-message"
          rows={3}
          value={settings.whatsapp_message}
          onChange={(e) => setSettings({ ...settings, whatsapp_message: e.target.value })}
        />
      </div>

      <Button type="submit" disabled={saving} className="gap-2 bg-primary">
        <Save className="h-4 w-4" />
        {saving ? 'Saving...' : 'Save WhatsApp Settings'}
      </Button>
    </form>
  );
}

function MerchantFeedTab() {
  const { settings, setSettings, saving, save } = useMarketingSettings();
  const [feedUrl, setFeedUrl] = useState('');

  useEffect(() => {
    setFeedUrl(`${window.location.origin}/api/merchant-feed`);
  }, []);

  const copyFeedUrl = async () => {
    try {
      await navigator.clipboard.writeText(feedUrl);
      toast.success('Feed URL copied');
    } catch {
      toast.error('Could not copy — please copy manually');
    }
  };

  if (!settings) return <p className="py-6 text-sm text-muted-foreground">Loading...</p>;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      className="mt-4 max-w-lg space-y-4"
    >
      <div className="flex items-center justify-between rounded-lg border border-border p-3">
        <div>
          <Label htmlFor="feed-enabled">Enable Google Merchant / Meta Catalog feed</Label>
          <p className="text-xs text-muted-foreground">Turn off to make the feed URL return 404.</p>
        </div>
        <Switch
          id="feed-enabled"
          checked={settings.merchant_feed_enabled}
          onCheckedChange={(checked) => setSettings({ ...settings, merchant_feed_enabled: checked })}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="feed-brand">Brand name (shown in each feed item)</Label>
        <Input
          id="feed-brand"
          value={settings.merchant_feed_brand}
          onChange={(e) => setSettings({ ...settings, merchant_feed_brand: e.target.value })}
        />
      </div>

      <div className="space-y-2">
        <Label>Feed URL — add this in Google Merchant Center / Meta Commerce as a scheduled fetch</Label>
        <div className="flex gap-2">
          <Input readOnly value={feedUrl} className="text-xs" />
          <Button type="button" variant="outline" onClick={copyFeedUrl}>
            <Copy className="h-4 w-4" />
          </Button>
          <Button type="button" variant="outline" asChild>
            <a href="/api/merchant-feed" target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4" />
            </a>
          </Button>
        </div>
      </div>

      <Button type="submit" disabled={saving} className="gap-2 bg-primary">
        <Save className="h-4 w-4" />
        {saving ? 'Saving...' : 'Save Feed Settings'}
      </Button>
    </form>
  );
}

// ---------------------------------------------------------------------
// Newsletter subscribers
// ---------------------------------------------------------------------

function NewsletterTab() {
  const [subs, setSubs] = useState<NewsletterSubscriber[] | null>(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    fetchNewsletterSubscribers()
      .then(setSubs)
      .catch(() => toast.error('Failed to load subscribers'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleDelete = async (id: string) => {
    try {
      await deleteNewsletterSubscriber(id);
      setSubs((prev) => prev?.filter((s) => s.id !== id) ?? null);
      toast.success('Subscriber removed');
    } catch {
      toast.error('Could not remove subscriber');
    }
  };

  const exportCsv = () => {
    if (!subs || subs.length === 0) return;
    const rows = [['email', 'source', 'subscribed_at'], ...subs.map((s) => [s.email, s.source ?? '', s.created_at])];
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `newsletter-subscribers-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mt-4">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {loading ? 'Loading...' : `${subs?.length ?? 0} subscriber${subs?.length === 1 ? '' : 's'}`}
        </p>
        <Button variant="outline" size="sm" className="gap-2" onClick={exportCsv} disabled={!subs?.length}>
          <Download className="h-4 w-4" />
          Export CSV
        </Button>
      </div>

      {!loading && subs && subs.length === 0 && (
        <p className="text-sm text-muted-foreground">No subscribers yet.</p>
      )}

      {subs && subs.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Email</th>
                <th className="px-3 py-2">Source</th>
                <th className="px-3 py-2">Subscribed</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {subs.map((s) => (
                <tr key={s.id} className="border-t border-border">
                  <td className="px-3 py-2">{s.email}</td>
                  <td className="px-3 py-2 text-muted-foreground">{s.source || '—'}</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {new Date(s.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(s.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// Site SEO
// ---------------------------------------------------------------------

function SeoTab() {
  const [seo, setSeo] = useState<SeoSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingFavicon, setUploadingFavicon] = useState(false);

  useEffect(() => {
    fetchSeoSettings()
      .then(setSeo)
      .catch(() => toast.error('Failed to load SEO settings'));
  }, []);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!seo) return;
    setSaving(true);
    try {
      await saveSeoSettings(seo);
      toast.success('SEO settings saved');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const onUploadFavicon = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !seo) return;
    setUploadingFavicon(true);
    try {
      const url = await uploadProductImage(file, 'favicon');
      const next = { ...seo, favicon_url: url };
      setSeo(next);
      await saveSeoSettings(next);
      toast.success('Favicon uploaded');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Favicon upload failed');
    } finally {
      setUploadingFavicon(false);
      e.target.value = '';
    }
  };

  const removeFavicon = async () => {
    if (!seo) return;
    const next = { ...seo, favicon_url: '' };
    setSeo(next);
    try {
      await saveSeoSettings(next);
      toast.success('Favicon removed');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove favicon');
    }
  };

  if (!seo) return <p className="py-6 text-sm text-muted-foreground">Loading...</p>;

  return (
    <form onSubmit={onSubmit} className="mt-4 max-w-lg space-y-4">
      <div className="space-y-2">
        <Label htmlFor="seo-title">Site title</Label>
        <Input
          id="seo-title"
          value={seo.site_title}
          onChange={(e) => setSeo({ ...seo, site_title: e.target.value })}
          placeholder="AruhiHandlooms — Handwoven Indian Ethnic Wear & Sarees"
        />
        <p className="text-xs text-muted-foreground">
          Shown in Google search results and the browser tab on the homepage.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="seo-description">Meta description</Label>
        <Textarea
          id="seo-description"
          rows={3}
          value={seo.meta_description}
          onChange={(e) => setSeo({ ...seo, meta_description: e.target.value })}
          placeholder="Discover handpicked sarees, lehengas and ethnic wear..."
        />
        <p className="text-xs text-muted-foreground">
          Ideal length: under 160 characters. Currently {seo.meta_description.length}.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="seo-keywords">Keywords (comma-separated)</Label>
        <Textarea
          id="seo-keywords"
          rows={2}
          value={seo.keywords}
          onChange={(e) => setSeo({ ...seo, keywords: e.target.value })}
          placeholder="saree, ethnic wear, lehenga, silk saree"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="seo-og-image">Social share image URL (Open Graph)</Label>
        <Input
          id="seo-og-image"
          value={seo.og_image}
          onChange={(e) => setSeo({ ...seo, og_image: e.target.value })}
          placeholder="https://your-cdn.com/social-share.jpg"
        />
        <p className="text-xs text-muted-foreground">
          Shown when the site is shared on WhatsApp, Facebook, Twitter/X. Recommended: 1200×630px.
        </p>
      </div>

      <div className="space-y-2">
        <Label>Favicon</Label>
        {seo.favicon_url ? (
          <div className="flex items-center gap-3">
            <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md border border-border bg-muted">
              <Image
                src={seo.favicon_url}
                alt="Favicon preview"
                fill
                sizes="48px"
                className="object-contain"
              />
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={removeFavicon}
              className="gap-1.5 text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Remove favicon
            </Button>
          </div>
        ) : (
          <label className="flex w-fit cursor-pointer items-center gap-2 rounded-md border border-dashed border-border bg-muted/40 px-4 py-2 text-sm hover:border-primary/50">
            {uploadingFavicon ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            <span>{uploadingFavicon ? 'Uploading…' : 'Upload favicon image'}</span>
            <input
              type="file"
              accept="image/png,image/x-icon,image/svg+xml,image/jpeg,image/webp"
              className="hidden"
              onChange={onUploadFavicon}
              disabled={uploadingFavicon}
            />
          </label>
        )}
        <p className="text-xs text-muted-foreground">
          Used as the browser tab icon and phone home-screen icon. Square image, at least 180×180px
          (PNG recommended). Leave empty to use the default monogram icon.
        </p>
        <Input
          value={seo.favicon_url}
          onChange={(e) => setSeo({ ...seo, favicon_url: e.target.value })}
          onBlur={() => seo && saveSeoSettings(seo).catch(() => toast.error('Save failed'))}
          placeholder="Or paste an image URL directly"
          className="text-xs"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="seo-gsc">Google Search Console verification code</Label>
        <Input
          id="seo-gsc"
          value={seo.google_site_verification}
          onChange={(e) => setSeo({ ...seo, google_site_verification: e.target.value })}
          placeholder="abc123XYZ... (just the content value, not the full <meta> tag)"
        />
        <p className="text-xs text-muted-foreground">
          Google Search Console → Settings → Ownership verification → HTML tag method → copy only
          the <code>content=&quot;...&quot;</code> value here.
        </p>
      </div>

      <Button type="submit" disabled={saving} className="gap-2 bg-primary">
        <Save className="h-4 w-4" />
        {saving ? 'Saving...' : 'Save SEO Settings'}
      </Button>
    </form>
  );
}

// ---------------------------------------------------------------------
// Analytics: Google Analytics (GA4) + Meta Pixel
// ---------------------------------------------------------------------

function AnalyticsTab() {
  const [analytics, setAnalytics] = useState<AnalyticsSettings | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchAnalyticsSettings()
      .then(setAnalytics)
      .catch(() => toast.error('Failed to load analytics settings'));
  }, []);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!analytics) return;
    setSaving(true);
    try {
      await saveAnalyticsSettings(analytics);
      toast.success('Analytics settings saved — reload the site to see tracking active');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (!analytics) return <p className="py-6 text-sm text-muted-foreground">Loading...</p>;

  return (
    <form onSubmit={onSubmit} className="mt-4 max-w-lg space-y-6">
      <div className="space-y-3 rounded-lg border border-border p-3">
        <div className="flex items-center justify-between">
          <div>
            <Label htmlFor="ga-enabled">Google Analytics (GA4)</Label>
            <p className="text-xs text-muted-foreground">Tracks page views, sales, and shopper behaviour.</p>
          </div>
          <Switch
            id="ga-enabled"
            checked={analytics.ga_enabled}
            onCheckedChange={(checked) => setAnalytics({ ...analytics, ga_enabled: checked })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ga-id">Measurement ID</Label>
          <Input
            id="ga-id"
            value={analytics.ga_measurement_id}
            onChange={(e) => setAnalytics({ ...analytics, ga_measurement_id: e.target.value })}
            placeholder="G-XXXXXXXXXX"
          />
          <p className="text-xs text-muted-foreground">
            Google Analytics → Admin → Data Streams → your web stream → copy the Measurement ID.
          </p>
        </div>
      </div>

      {/* Google Tag Manager */}
      <div className="space-y-3 rounded-lg border border-border p-3">
        <div className="flex items-center justify-between">
          <div>
            <Label htmlFor="gtm-enabled">Google Tag Manager (GTM)</Label>
            <p className="text-xs text-muted-foreground">Manages all tags (GA4, Ads, Pixel) from one place.</p>
          </div>
          <Switch
            id="gtm-enabled"
            checked={analytics.gtm_enabled}
            onCheckedChange={(checked) => setAnalytics({ ...analytics, gtm_enabled: checked })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="gtm-id">Container ID</Label>
          <Input
            id="gtm-id"
            value={analytics.gtm_container_id}
            onChange={(e) => setAnalytics({ ...analytics, gtm_container_id: e.target.value })}
            placeholder="GTM-XXXXXXX"
          />
          <p className="text-xs text-muted-foreground">
            tagmanager.google.com → your container → top-right corner (e.g. GTM-TT7WGBH4).
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="google-ads-id">Google Ads ID (optional)</Label>
          <Input
            id="google-ads-id"
            value={analytics.google_ads_id}
            onChange={(e) => setAnalytics({ ...analytics, google_ads_id: e.target.value })}
            placeholder="AW-XXXXXXXXX"
          />
          <p className="text-xs text-muted-foreground">
            Google Ads → Tools → Conversions → copy the AW-XXXXXXXXX ID. Only needed if not using GTM.
          </p>
        </div>
      </div>

      <div className="space-y-3 rounded-lg border border-border p-3">
        <div className="flex items-center justify-between">
          <div>
            <Label htmlFor="pixel-enabled">Meta (Facebook/Instagram) Pixel</Label>
            <p className="text-xs text-muted-foreground">Powers retargeting ads and conversion tracking.</p>
          </div>
          <Switch
            id="pixel-enabled"
            checked={analytics.meta_pixel_enabled}
            onCheckedChange={(checked) => setAnalytics({ ...analytics, meta_pixel_enabled: checked })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="pixel-id">Pixel ID</Label>
          <Input
            id="pixel-id"
            value={analytics.meta_pixel_id}
            onChange={(e) => setAnalytics({ ...analytics, meta_pixel_id: e.target.value })}
            placeholder="1234567890123456"
          />
          <p className="text-xs text-muted-foreground">
            Meta Events Manager → Data Sources → your Pixel → copy the numeric Pixel ID.
          </p>
        </div>
      </div>

      <div className="space-y-3 rounded-lg border border-border p-3">
        <div className="flex items-center justify-between">
          <div>
            <Label htmlFor="trustpilot-enabled">Trustpilot Review Invitations</Label>
            <p className="text-xs text-muted-foreground">
              Emails a customer a review request a few days after their order.
            </p>
          </div>
          <Switch
            id="trustpilot-enabled"
            checked={analytics.trustpilot_enabled}
            onCheckedChange={(checked) => setAnalytics({ ...analytics, trustpilot_enabled: checked })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="trustpilot-key">Integration Key</Label>
          <Input
            id="trustpilot-key"
            value={analytics.trustpilot_integration_key}
            onChange={(e) => setAnalytics({ ...analytics, trustpilot_integration_key: e.target.value })}
            placeholder="En3UPwL5Q09ZQO2G"
          />
          <p className="text-xs text-muted-foreground">
            Trustpilot Business → Integrations → Ecommerce → JavaScript Integration → copy the key from
            the <code>tp(&apos;register&apos;, ...)</code> line.
          </p>
        </div>
      </div>

      <div className="space-y-3 rounded-lg border border-border p-3">
        <div>
          <p className="text-sm font-medium">Google Customer Reviews</p>
          <p className="text-xs text-muted-foreground">
            Builds your Google store rating. Merchant ID is set in code (5830177505).
          </p>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <Label htmlFor="gcr-optin-enabled">Review survey popup (order confirmation page)</Label>
            <p className="text-xs text-muted-foreground">
              Google asks the customer if they want a review email after delivery.
            </p>
          </div>
          <Switch
            id="gcr-optin-enabled"
            checked={analytics.gcr_optin_enabled}
            onCheckedChange={(checked) => setAnalytics({ ...analytics, gcr_optin_enabled: checked })}
          />
        </div>
        <div className="flex items-center justify-between">
          <div>
            <Label htmlFor="gcr-badge-enabled">Store rating badge (floating, bottom-right)</Label>
            <p className="text-xs text-muted-foreground">
              Hidden on checkout and admin pages. Can take up to 30 minutes to update on the site.
            </p>
          </div>
          <Switch
            id="gcr-badge-enabled"
            checked={analytics.gcr_badge_enabled}
            onCheckedChange={(checked) => setAnalytics({ ...analytics, gcr_badge_enabled: checked })}
          />
        </div>
      </div>

      <Button type="submit" disabled={saving} className="gap-2 bg-primary">
        <Save className="h-4 w-4" />
        {saving ? 'Saving...' : 'Save Analytics Settings'}
      </Button>
    </form>
  );
}

// ---------------------------------------------------------------------
// Social Auto-Post: automatically posts every product that goes live —
// vendor-submitted (after AI processing) or admin-added directly — to a
// Facebook Page and/or linked Instagram Business account via the Meta
// Graph API. Actual posting happens server-side in
// lib/social-publish-api.ts; this tab only stores the settings.
// ---------------------------------------------------------------------

function SocialPublishTab() {
  const [settings, setSettings] = useState<SocialPublishSettings | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/admin/settings/social-publish')
      .then((r) => r.json())
      .then((d) => {
        if (d?.settings) setSettings(d.settings);
        else throw new Error(d?.error || 'Failed to load social auto-post settings');
      })
      .catch(() => toast.error('Failed to load social auto-post settings'));
  }, []);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    setSaving(true);
    try {
      const res = await fetch('/api/admin/settings/social-publish', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Save failed');
      toast.success('Social auto-post settings saved');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (!settings) return <p className="py-6 text-sm text-muted-foreground">Loading...</p>;

  return (
    <form onSubmit={onSubmit} className="mt-4 max-w-lg space-y-6">
      <p className="text-xs text-muted-foreground">
        When on, every product that goes live — vendor-submitted (after AI processing) or added
        directly by you — is posted automatically. No manual step needed for either. Facebook +
        Instagram need a Meta App with a long-lived Page Access Token (permissions:
        pages_manage_posts, pages_read_engagement, instagram_content_publish, instagram_basic).
        Threads is a separate login/token (permissions: threads_basic, threads_content_publish) —
        see the Threads section below.
      </p>

      <div className="space-y-3 rounded-lg border border-border p-3">
        <div className="flex items-center justify-between">
          <div>
            <Label htmlFor="fb-enabled">Facebook Page</Label>
            <p className="text-xs text-muted-foreground">Posts as a Page post with the product photo.</p>
          </div>
          <Switch
            id="fb-enabled"
            checked={settings.facebook_enabled}
            onCheckedChange={(checked) => setSettings({ ...settings, facebook_enabled: checked })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="fb-page-id">Facebook Page ID</Label>
          <Input
            id="fb-page-id"
            value={settings.facebook_page_id}
            onChange={(e) => setSettings({ ...settings, facebook_page_id: e.target.value })}
            placeholder="1234567890123456"
          />
        </div>
      </div>

      <div className="space-y-3 rounded-lg border border-border p-3">
        <div className="flex items-center justify-between">
          <div>
            <Label htmlFor="ig-enabled">Instagram</Label>
            <p className="text-xs text-muted-foreground">
              Requires an Instagram Business/Creator account linked to the Page above.
            </p>
          </div>
          <Switch
            id="ig-enabled"
            checked={settings.instagram_enabled}
            onCheckedChange={(checked) => setSettings({ ...settings, instagram_enabled: checked })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ig-account-id">Instagram Business Account ID</Label>
          <Input
            id="ig-account-id"
            value={settings.instagram_business_account_id}
            onChange={(e) => setSettings({ ...settings, instagram_business_account_id: e.target.value })}
            placeholder="17841400000000000"
          />
          <p className="text-xs text-muted-foreground">
            Graph API Explorer → GET /&#123;page-id&#125;?fields=instagram_business_account
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="meta-token">Page Access Token</Label>
        <Input
          id="meta-token"
          type="password"
          value={settings.access_token}
          onChange={(e) => setSettings({ ...settings, access_token: e.target.value })}
          placeholder="EAAG..."
        />
        <p className="text-xs text-muted-foreground">
          A single long-lived Page token is used for both Facebook and Instagram — that&apos;s how
          the Graph API works for a linked Instagram Business account.
        </p>
      </div>

      <div className="space-y-3 rounded-lg border border-border p-3">
        <div className="flex items-center justify-between">
          <div>
            <Label htmlFor="threads-enabled">Threads</Label>
            <p className="text-xs text-muted-foreground">
              Threads is a separate Meta app/login from Facebook &amp; Instagram — it needs its
              own access token and user ID below, the Page token above won&apos;t work here.
            </p>
          </div>
          <Switch
            id="threads-enabled"
            checked={settings.threads_enabled}
            onCheckedChange={(checked) => setSettings({ ...settings, threads_enabled: checked })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="threads-user-id">Threads User ID</Label>
          <Input
            id="threads-user-id"
            value={settings.threads_user_id}
            onChange={(e) => setSettings({ ...settings, threads_user_id: e.target.value })}
            placeholder="1780..."
          />
          <p className="text-xs text-muted-foreground">
            GET https://graph.threads.net/v1.0/me?access_token=... (with your Threads token) → &quot;id&quot; field
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="threads-token">Threads Access Token</Label>
          <Input
            id="threads-token"
            type="password"
            value={settings.threads_access_token}
            onChange={(e) => setSettings({ ...settings, threads_access_token: e.target.value })}
            placeholder="THQ..."
          />
          <p className="text-xs text-muted-foreground">
            From the Threads API product on your Meta App, with threads_basic + threads_content_publish
            permissions (long-lived token recommended).
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="caption-template">Post Caption Template</Label>
        <Textarea
          id="caption-template"
          rows={5}
          value={settings.caption_template}
          onChange={(e) => setSettings({ ...settings, caption_template: e.target.value })}
        />
        <p className="text-xs text-muted-foreground">
          Placeholders: {'{name}'}, {'{price}'}, {'{description}'}, {'{url}'}, {'{mrp}'}, {'{discount_percent}'}
          <br />
          {'{mrp}'} and {'{discount_percent}'} are left blank automatically for products with no MRP or no discount — no need to check for that yourself.
        </p>
      </div>

      <Button type="submit" disabled={saving} className="gap-2 bg-primary">
        <Save className="h-4 w-4" />
        {saving ? 'Saving...' : 'Save Social Auto-Post Settings'}
      </Button>
    </form>
  );
}

// ---------------------------------------------------------------------
// Growth Tools: urgency banner, low-stock badges, exit-intent popup,
// social proof toasts, sale countdown -- all conversion-focused and all
// toggle-able without touching code.
// ---------------------------------------------------------------------

function GrowthTab() {
  const [settings, setSettings] = useState<GrowthSettings | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchGrowthSettings()
      .then(setSettings)
      .catch(() => toast.error('Failed to load growth settings'));
  }, []);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    setSaving(true);
    try {
      await saveGrowthSettings(settings);
      toast.success('Growth settings saved');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (!settings) return <p className="py-6 text-sm text-muted-foreground">Loading...</p>;

  return (
    <form onSubmit={onSubmit} className="space-y-8 py-4">
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium">Urgency banner</p>
            <p className="text-sm text-muted-foreground">Sticky bar at the top of every page.</p>
          </div>
          <Switch
            checked={settings.urgency_banner_enabled}
            onCheckedChange={(v) => setSettings({ ...settings, urgency_banner_enabled: v })}
          />
        </div>
        <Input
          value={settings.urgency_banner_text}
          onChange={(e) => setSettings({ ...settings, urgency_banner_text: e.target.value })}
          placeholder="Free shipping on orders above ₹1999 — today only!"
        />
      </section>

      <section className="space-y-3 border-t border-border pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium">Feature icons row</p>
            <p className="text-sm text-muted-foreground">
              The 3-column strip right below the header (Easy returns / Fast delivery / Free
              shipping). Icons stay fixed; only the text below is editable.
            </p>
          </div>
          <Switch
            checked={settings.feature_strip_enabled}
            onCheckedChange={(v) => setSettings({ ...settings, feature_strip_enabled: v })}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label>Icon 1 — Returns title</Label>
            <Input
              value={settings.feature_strip_returns_title}
              onChange={(e) => setSettings({ ...settings, feature_strip_returns_title: e.target.value })}
              placeholder="Easy returns"
            />
            <Label>Icon 1 — Returns subtitle</Label>
            <Input
              value={settings.feature_strip_returns_subtitle}
              onChange={(e) =>
                setSettings({ ...settings, feature_strip_returns_subtitle: e.target.value })
              }
              placeholder="Free pick up"
            />
          </div>
          <div className="space-y-2">
            <Label>Icon 2 — Delivery title</Label>
            <Input
              value={settings.feature_strip_delivery_title}
              onChange={(e) => setSettings({ ...settings, feature_strip_delivery_title: e.target.value })}
              placeholder="Fast delivery"
            />
            <Label>Icon 2 — Delivery subtitle</Label>
            <Input
              value={settings.feature_strip_delivery_subtitle}
              onChange={(e) =>
                setSettings({ ...settings, feature_strip_delivery_subtitle: e.target.value })
              }
              placeholder="10000+ styles"
            />
          </div>
          <div className="space-y-2">
            <Label>Icon 3 — Shipping title</Label>
            <Input
              value={settings.feature_strip_shipping_title}
              onChange={(e) => setSettings({ ...settings, feature_strip_shipping_title: e.target.value })}
              placeholder="Free shipping"
            />
            <Label>Icon 3 — Shipping subtitle</Label>
            <Input
              value={settings.feature_strip_shipping_subtitle}
              onChange={(e) =>
                setSettings({ ...settings, feature_strip_shipping_subtitle: e.target.value })
              }
              placeholder="Leave blank to auto-fill from Settings > Shipping"
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Leave the shipping subtitle blank to keep it auto-synced with the free-shipping amount
          set under Admin &gt; Settings &gt; Shipping.
        </p>
      </section>

      <section className="space-y-3 border-t border-border pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium">Low stock badge</p>
            <p className="text-sm text-muted-foreground">Shows "Only N left" on product pages.</p>
          </div>
          <Switch
            checked={settings.low_stock_enabled}
            onCheckedChange={(v) => setSettings({ ...settings, low_stock_enabled: v })}
          />
        </div>
        <div className="max-w-xs">
          <Label>Show badge when stock is at or below</Label>
          <Input
            type="number"
            min={1}
            value={settings.low_stock_threshold}
            onChange={(e) => setSettings({ ...settings, low_stock_threshold: Number(e.target.value) })}
          />
        </div>
      </section>

      <section className="space-y-3 border-t border-border pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium">Exit-intent discount popup</p>
            <p className="text-sm text-muted-foreground">
              Shows once per visit when the cursor heads toward the tab bar.
            </p>
          </div>
          <Switch
            checked={settings.exit_intent_enabled}
            onCheckedChange={(v) => setSettings({ ...settings, exit_intent_enabled: v })}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Headline</Label>
            <Input
              value={settings.exit_intent_headline}
              onChange={(e) => setSettings({ ...settings, exit_intent_headline: e.target.value })}
            />
          </div>
          <div>
            <Label>Coupon code shown</Label>
            <Input
              value={settings.exit_intent_coupon_code}
              onChange={(e) => setSettings({ ...settings, exit_intent_coupon_code: e.target.value })}
            />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="exit-intent-discount-type">Discount type shown on popup</Label>
            <Select
              value={settings.exit_intent_discount_type}
              onValueChange={(v) =>
                setSettings({ ...settings, exit_intent_discount_type: v as 'percentage' | 'flat' })
              }
            >
              <SelectTrigger id="exit-intent-discount-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="percentage">Percentage (%)</SelectItem>
                <SelectItem value="flat">Flat amount (₹)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>{settings.exit_intent_discount_type === 'percentage' ? 'Percent off' : 'Amount off (₹)'}</Label>
            <Input
              type="number"
              min={1}
              value={settings.exit_intent_discount_value}
              onChange={(e) =>
                setSettings({ ...settings, exit_intent_discount_value: Number(e.target.value) })
              }
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          This just controls the "{settings.exit_intent_discount_type === 'percentage'
            ? `${settings.exit_intent_discount_value || 0}% OFF`
            : `₹${settings.exit_intent_discount_value || 0} OFF`}" badge shown on the popup —
          it doesn't create the discount by itself. Create a coupon with the same code and value
          under Admin &gt; Coupons so it actually applies at checkout.
        </p>
        <div>
          <Label>Message</Label>
          <Textarea
            rows={2}
            value={settings.exit_intent_message}
            onChange={(e) => setSettings({ ...settings, exit_intent_message: e.target.value })}
          />
        </div>
      </section>

      <section className="space-y-3 border-t border-border pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium">Social proof toasts</p>
            <p className="text-sm text-muted-foreground">
              "Someone in [city] just bought this" — pulled from real recent orders.
            </p>
          </div>
          <Switch
            checked={settings.social_proof_enabled}
            onCheckedChange={(v) => setSettings({ ...settings, social_proof_enabled: v })}
          />
        </div>
      </section>

      <section className="space-y-3 border-t border-border pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium">Live viewers</p>
            <p className="text-sm text-muted-foreground">
              "12 people are viewing this right now" on the product page — a real count of
              distinct visitors currently browsing that product, not a fake number.
            </p>
          </div>
          <Switch
            checked={settings.live_viewers_enabled}
            onCheckedChange={(v) => setSettings({ ...settings, live_viewers_enabled: v })}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Count window (minutes)</Label>
            <Input
              type="number"
              min={1}
              value={settings.live_viewers_window_minutes}
              onChange={(e) =>
                setSettings({ ...settings, live_viewers_window_minutes: Number(e.target.value) })
              }
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Counts visitors who viewed this product in the last X minutes.
            </p>
          </div>
          <div>
            <Label>Only show badge when count is at least</Label>
            <Input
              type="number"
              min={1}
              value={settings.live_viewers_min_to_show}
              onChange={(e) =>
                setSettings({ ...settings, live_viewers_min_to_show: Number(e.target.value) })
              }
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Keeps the badge hidden instead of showing an unconvincing "1 person viewing".
            </p>
          </div>
        </div>
      </section>

      <section className="space-y-3 border-t border-border pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium">Frequently Bought Together</p>
            <p className="text-sm text-muted-foreground">
              Shows bundle suggestions on product pages. Pairs are curated under Admin &gt;
              Marketing &gt; Bundles, or auto-computed from past orders.
            </p>
          </div>
          <Switch
            checked={settings.bundles_enabled}
            onCheckedChange={(v) => setSettings({ ...settings, bundles_enabled: v })}
          />
        </div>
      </section>

      <section className="space-y-3 border-t border-border pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium">Sale countdown bar</p>
            <p className="text-sm text-muted-foreground">Ticking countdown until a set end time.</p>
          </div>
          <Switch
            checked={settings.sale_countdown_enabled}
            onCheckedChange={(v) => setSettings({ ...settings, sale_countdown_enabled: v })}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Text</Label>
            <Input
              value={settings.sale_countdown_text}
              onChange={(e) => setSettings({ ...settings, sale_countdown_text: e.target.value })}
            />
          </div>
          <div>
            <Label>Ends at</Label>
            <Input
              type="datetime-local"
              value={settings.sale_countdown_end_at ? settings.sale_countdown_end_at.slice(0, 16) : ''}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  sale_countdown_end_at: e.target.value ? new Date(e.target.value).toISOString() : null,
                })
              }
            />
          </div>
        </div>
      </section>

      <Button type="submit" disabled={saving} className="gap-2 bg-primary">
        <Save className="h-4 w-4" />
        {saving ? 'Saving...' : 'Save Growth Settings'}
      </Button>
    </form>
  );
}

// ---------------------------------------------------------------------
// Checkout Order Bump
// ---------------------------------------------------------------------

function CheckoutBumpTab() {
  const [settings, setSettings] = useState<CheckoutBumpSettings | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchCheckoutBumpSettings()
      .then(setSettings)
      .catch(() => toast.error('Failed to load checkout bump settings'));
    fetchProducts()
      .then(setProducts)
      .catch(() => toast.error('Failed to load products'));
  }, []);

  const selectedProduct = products.find((p) => p.id === settings?.product_id) || null;
  const bumpPrice = selectedProduct
    ? Math.round(selectedProduct.price * (1 - (settings?.discount_percent ?? 0) / 100))
    : null;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    if (settings.enabled && !settings.product_id) {
      toast.error('Pick a product first, or turn the bump off');
      return;
    }
    setSaving(true);
    try {
      await saveCheckoutBumpSettings(settings);
      toast.success('Checkout bump settings saved');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (!settings) return <p className="py-6 text-sm text-muted-foreground">Loading...</p>;

  return (
    <form onSubmit={onSubmit} className="space-y-6 py-4">
      <p className="max-w-2xl text-sm text-muted-foreground">
        Ek chota, discounted add-on product jo checkout page par har customer ko dikhta hai —
        cart mein jo bhi ho, iska koi lena-dena nahi. One-click "Add" karte hi order total mein
        turant jud jata hai. Isse average order value badhta hai (classic "order bump" — jaise
        ₹99 ka pouch/scarf add karna).
      </p>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium">Enable checkout bump</p>
            <p className="text-sm text-muted-foreground">
              Order Summary ke andar, "Place Order" button ke upar dikhega.
            </p>
          </div>
          <Switch
            checked={settings.enabled}
            onCheckedChange={(v) => setSettings({ ...settings, enabled: v })}
          />
        </div>
      </section>

      <section className="space-y-3 border-t border-border pt-6">
        <div>
          <Label>Product</Label>
          <Select
            value={settings.product_id ?? ''}
            onValueChange={(v) => setSettings({ ...settings, product_id: v })}
          >
            <SelectTrigger className="max-w-sm">
              <SelectValue placeholder="Choose a product" />
            </SelectTrigger>
            <SelectContent>
              {products.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name} — ₹{p.price}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="mt-1 text-xs text-muted-foreground">
            Kuch sasta, high-margin, sabke liye relevant product chuno (pouch, scarf, jewellery
            box, styling accessory) — kapde ka size/fit nahi hona chahiye, kyunki checkout par
            size select karne ka option nahi hoga.
          </p>
        </div>

        <div className="max-w-xs">
          <Label>Discount on checkout (%)</Label>
          <Input
            type="number"
            min={0}
            max={90}
            value={settings.discount_percent}
            onChange={(e) =>
              setSettings({ ...settings, discount_percent: Number(e.target.value) })
            }
          />
        </div>

        {selectedProduct && bumpPrice !== null && (
          <div className="rounded-md bg-muted/50 p-3 text-sm">
            <p>
              Customer ko dikhega: <strong>{selectedProduct.name}</strong> — normal price ₹
              {selectedProduct.price}, checkout price{' '}
              <strong className="text-primary">₹{bumpPrice}</strong>
              {settings.discount_percent > 0 ? ` (${settings.discount_percent}% off)` : ''}.
            </p>
          </div>
        )}
      </section>

      <section className="space-y-3 border-t border-border pt-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Headline</Label>
            <Input
              value={settings.headline}
              onChange={(e) => setSettings({ ...settings, headline: e.target.value })}
            />
          </div>
        </div>
        <div>
          <Label>Subtext</Label>
          <Textarea
            rows={2}
            value={settings.subtext}
            onChange={(e) => setSettings({ ...settings, subtext: e.target.value })}
          />
        </div>
      </section>

      <Button type="submit" disabled={saving} className="gap-2 bg-primary">
        <Save className="h-4 w-4" />
        {saving ? 'Saving...' : 'Save Checkout Bump'}
      </Button>
    </form>
  );
}
