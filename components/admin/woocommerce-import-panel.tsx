'use client';

import { useEffect, useMemo, useState } from 'react';
import { Download, Send, Trash2, Search, Sparkles, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import {
  Flame,
  ThermometerSnowflake,
  Waves,
  ShoppingCart,
  Heart,
  ShoppingBag,
  MailX,
  MailCheck,
  MailOpen,
  MousePointerClick,
  MailWarning,
} from 'lucide-react';
import {
  fetchImportedCustomers,
  importWooCommerceCustomersChunk,
  deleteImportedCustomer,
  sendWooCommerceCampaign,
  fetchFeaturedProducts,
  fetchCampaignHistory,
  fetchAudienceSegments,
  fetchDripAutomationSettings,
  saveDripAutomationSettings,
  fetchCampaignRecipients,
  type ImportedCustomer,
  type CampaignHistoryEntry,
  type CampaignCategoryOption,
  type AudienceSegment,
  type SegmentCounts,
  type BehaviorFlags,
  type BehaviorCounts,
  type WooCommerceDripSettings,
  type DripProgress,
  type CampaignRecipientStatus,
  type CampaignRecipient,
} from '@/lib/woocommerce-import-api';
import { fetchProductPageCoupons, pickBestCoupon } from '@/lib/coupons-api';
import {
  buildPremiumCampaignHtml,
  CAMPAIGN_TEMPLATES,
  TRACKING_PIXEL_PLACEHOLDER,
  UNSUBSCRIBE_LINK_PLACEHOLDER,
  SOURCE_STORE_FOOTER_CLAUSE_PLACEHOLDER,
  storeDisplayName,
  type CampaignTemplateId,
} from '@/lib/campaign-templates';

const SEGMENT_STYLES: Record<AudienceSegment, string> = {
  cold: 'bg-sky-50 text-sky-700 border-sky-200',
  warm: 'bg-amber-50 text-amber-700 border-amber-200',
  hot: 'bg-red-50 text-red-700 border-red-200',
};

const SEGMENT_LABELS: Record<AudienceSegment, string> = { cold: 'Cold', warm: 'Warm', hot: 'Hot' };

function SegmentBadge({ segment }: { segment: AudienceSegment }) {
  return (
    <span className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-medium ${SEGMENT_STYLES[segment]}`}>
      {SEGMENT_LABELS[segment]}
    </span>
  );
}

export default function WooCommerceImportPanel() {
  const [customers, setCustomers] = useState<ImportedCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState('');
  const [sending, setSending] = useState(false);

  const [storeUrl, setStoreUrl] = useState('');
  const [consumerKey, setConsumerKey] = useState('');
  const [consumerSecret, setConsumerSecret] = useState('');

  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');

  // Premium template picker: when a template is applied, `message` holds
  // full ready-to-send HTML (built from real products) instead of plain
  // text. Detected by content (starts with <!DOCTYPE/<html) rather than a
  // separate boolean, so direct HTML edits after applying a template still
  // send correctly without extra state to keep in sync.
  const isPremiumHtml = /^\s*<(!doctype|html)/i.test(message);
  const [applyingTemplate, setApplyingTemplate] = useState<CampaignTemplateId | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  const [history, setHistory] = useState<CampaignHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [heroImageUrl, setHeroImageUrl] = useState('');
  const [availableCategories, setAvailableCategories] = useState<CampaignCategoryOption[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('__all__');

  // Cold / warm / hot audience segmentation
  const [segments, setSegments] = useState<Record<string, AudienceSegment>>({});
  const [segmentCounts, setSegmentCounts] = useState<SegmentCounts>({ cold: 0, warm: 0, hot: 0, total: 0 });
  // Behaviour tags — separate from cold/warm/hot, a customer can match more
  // than one (e.g. addedToCart AND purchased), so these are their own filter.
  const [behaviorFlags, setBehaviorFlags] = useState<Record<string, BehaviorFlags>>({});
  const [behaviorCounts, setBehaviorCounts] = useState<BehaviorCounts>({
    purchased: 0,
    addedToCart: 0,
    wishlisted: 0,
    cartAbandoner: 0,
    notOpenedWelcome: 0,
    emailSent: 0,
    emailOpened: 0,
    emailClicked: 0,
    emailFailed: 0,
  });
  type BehaviorFilterKey = keyof BehaviorCounts;
  const [segmentFilter, setSegmentFilter] = useState<'all' | AudienceSegment | BehaviorFilterKey>('all');
  const [segmentsLoading, setSegmentsLoading] = useState(true);
  // Lets the admin narrow the list to customers imported from one specific
  // WooCommerce store, now that each customer records which store they
  // actually came from (source_store_url) instead of that only being
  // tracked globally.
  const [storeFilter, setStoreFilter] = useState<string>('__all__');
  const storeOptions = useMemo(() => {
    const urls = new Set<string>();
    for (const c of customers) if (c.source_store_url) urls.add(c.source_store_url);
    return Array.from(urls).sort();
  }, [customers]);
  // Rendering thousands of <tr> rows at once (e.g. "Sabhi"/"Cold" with 6800+
  // customers) is what was making those tabs slow, while "Hot" (2 rows) felt
  // instant — it's a DOM size problem, not a data-fetch problem. So we only
  // render a window of rows and let the user load more, instead of dumping
  // the whole filtered list into the table in one go.
  const ROWS_PER_PAGE = 200;
  const [visibleCount, setVisibleCount] = useState(ROWS_PER_PAGE);

  // Manual send scheduling ("send now" vs "send after N hours")
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduleHours, setScheduleHours] = useState('24');

  // Welcome -> follow-up drip automation
  const [dripSettings, setDripSettings] = useState<WooCommerceDripSettings | null>(null);
  const [dripProgress, setDripProgress] = useState<DripProgress | null>(null);
  const [dripLoading, setDripLoading] = useState(true);
  const [dripSaving, setDripSaving] = useState(false);

  const loadSegments = () =>
    fetchAudienceSegments()
      .then(({ segments: s, counts, behaviorFlags: bf, behaviorCounts: bc }) => {
        setSegments(s);
        setSegmentCounts(counts);
        setBehaviorFlags(bf);
        setBehaviorCounts(bc);
      })
      .catch(() => {})
      .finally(() => setSegmentsLoading(false));

  const loadDripAutomation = () =>
    fetchDripAutomationSettings()
      .then(({ settings, progress }) => {
        setDripSettings(settings);
        setDripProgress(progress);
      })
      .catch(() => {})
      .finally(() => setDripLoading(false));

  const loadHistory = () =>
    fetchCampaignHistory()
      .then(setHistory)
      .catch(() => {})
      .finally(() => setHistoryLoading(false));

  const load = () =>
    fetchImportedCustomers()
      .then(setCustomers)
      .catch((err) => toast.error(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
    loadHistory();
    loadSegments();
    loadDripAutomation();
    fetchFeaturedProducts(1)
      .then(({ categories }) => setAvailableCategories(categories))
      .catch(() => {});
  }, []);

  const matchesSearch = (c: ImportedCustomer, q: string) =>
    !q ||
    (c.name ?? '').toLowerCase().includes(q) ||
    (c.email ?? '').toLowerCase().includes(q) ||
    (c.phone ?? '').toLowerCase().includes(q);

  // Opted-out customers never appear in the selectable/sendable list — this
  // mirrors the hard exclusion send-campaign already does server-side
  // (`.eq('opted_out', false)`), so there's no UI path that lets them get
  // selected for a future campaign even by accident.
  const BEHAVIOR_FILTER_KEYS = new Set<BehaviorFilterKey>([
    'purchased',
    'addedToCart',
    'wishlisted',
    'cartAbandoner',
    'notOpenedWelcome',
    'emailSent',
    'emailOpened',
    'emailClicked',
    'emailFailed',
  ]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return customers.filter((c) => {
      if (c.opted_out || !matchesSearch(c, q)) return false;
      if (storeFilter !== '__all__' && c.source_store_url !== storeFilter) return false;
      if (segmentFilter === 'all') return true;
      if (BEHAVIOR_FILTER_KEYS.has(segmentFilter as BehaviorFilterKey)) {
        return !!behaviorFlags[c.id]?.[segmentFilter as BehaviorFilterKey];
      }
      return (segments[c.id] ?? 'cold') === segmentFilter;
    });
  }, [customers, search, segmentFilter, segments, behaviorFlags, storeFilter]);

  const optedOut = useMemo(() => {
    const q = search.trim().toLowerCase();
    return customers.filter((c) => c.opted_out && matchesSearch(c, q));
  }, [customers, search]);

  // Totals across every campaign ever sent, for the quick-glance summary
  // cards next to the Audience filters (section 2) -- the full per-campaign
  // breakdown still lives in the "4. Pehle bheji gayi campaigns" table below.
  const campaignTotals = useMemo(() => {
    const sent = history.reduce((sum, h) => sum + h.sent, 0);
    const opened = history.reduce((sum, h) => sum + h.opened, 0);
    const clicked = history.reduce((sum, h) => sum + h.clicked, 0);
    const failed = history.reduce((sum, h) => sum + h.failed, 0);
    const openRate = sent > 0 ? Math.round((opened / sent) * 100) : 0;
    return { sent, opened, clicked, failed, openRate };
  }, [history]);

  // Name/email breakdown behind the Sent/Opened/Clicked/Failed cards --
  // same idea as the Purchased/Cart abandoners/etc audience chips below,
  // just for delivery/engagement status instead of shopping behaviour.
  const [recipientsModal, setRecipientsModal] = useState<CampaignRecipientStatus | null>(null);
  const [recipients, setRecipients] = useState<CampaignRecipient[]>([]);
  const [recipientsLoading, setRecipientsLoading] = useState(false);

  const RECIPIENT_STATUS_LABELS: Record<CampaignRecipientStatus, string> = {
    sent: 'Sent',
    opened: 'Opened',
    clicked: 'Clicked',
    failed: 'Failed',
  };

  const openRecipientsModal = (status: CampaignRecipientStatus) => {
    setRecipientsModal(status);
    setRecipientsLoading(true);
    fetchCampaignRecipients(status)
      .then(setRecipients)
      .catch((err) => toast.error(err instanceof Error ? err.message : 'Failed to load recipients'))
      .finally(() => setRecipientsLoading(false));
  };

  useEffect(() => {
    setVisibleCount(ROWS_PER_PAGE);
  }, [segmentFilter, search, storeFilter]);

  const visibleRows = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount]);

  const allFilteredSelected = filtered.length > 0 && filtered.every((c) => selected.has(c.id));

  const toggleAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        filtered.forEach((c) => next.delete(c.id));
      } else {
        filtered.forEach((c) => next.add(c.id));
      }
      return next;
    });
  };

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleImport = async () => {
    if (!storeUrl || !consumerKey || !consumerSecret) {
      toast.error('Store URL, Consumer Key aur Consumer Secret teeno bharo');
      return;
    }
    setImporting(true);
    let totalOrders = 0;
    try {
      for (;;) {
        setImportProgress(
          totalOrders === 0 ? 'Shuru ho raha hai...' : `${totalOrders} orders scan ho chuke hain...`
        );
        // reset is always false here: the server keeps a saved cursor keyed
        // to this storeUrl, so clicking Import again (e.g. after a timeout)
        // automatically resumes from where it left off instead of
        // restarting from page 1. A different storeUrl gets a fresh start
        // automatically too, since the saved cursor won't match it.
        const result = await importWooCommerceCustomersChunk({
          storeUrl,
          consumerKey,
          consumerSecret,
          reset: false,
        });
        totalOrders += result.ordersScanned;
        await load(); // refresh the list so progress is visible as it goes
        if (result.done) {
          if (result.warning) {
            toast.error(result.warning, { duration: 15000 });
          } else {
            toast.success(`Import complete — ${totalOrders} orders scan hue`);
          }
          break;
        }
      }
    } catch (err) {
      toast.error(
        (err instanceof Error ? err.message : 'Import fail ho gaya') +
          ' — dubara "Import Customers" dabao, jaha ruka tha wahi se continue hoga.'
      );
    } finally {
      setImporting(false);
      setImportProgress('');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteImportedCustomer(id);
      setCustomers((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Delete fail ho gaya');
    }
  };

  const applyTemplate = async (templateId: CampaignTemplateId) => {
    setApplyingTemplate(templateId);
    try {
      const categoryFilter = selectedCategory === '__all__' ? undefined : selectedCategory;
      const [{ products, categories }, productPageCoupons] = await Promise.all([
        fetchFeaturedProducts(6, categoryFilter),
        // Whichever coupon is currently active AND flagged "Show on
        // Product Page" in Admin > Coupons -- same source the product
        // page's own coupon list reads from, so the email banner and the
        // product page never disagree about what's actually live. Fails
        // open (empty list) rather than blocking template generation if
        // this lookup has a hiccup.
        fetchProductPageCoupons().catch(() => []),
      ]);
      setAvailableCategories(categories); // keeps the dropdown's options fresh/live
      if (products.length === 0) {
        toast.error(
          categoryFilter
            ? `"${categoryFilter}" category me koi in-stock product (image ke saath) nahi mila`
            : 'Koi in-stock product (image ke saath) nahi mila is store me'
        );
        return;
      }
      const coupon = pickBestCoupon(productPageCoupons);
      const templateMeta = CAMPAIGN_TEMPLATES.find((t) => t.id === templateId)!;
      const headline =
        templateId === 'festive'
          ? categoryFilter
            ? `${categoryFilter} — Now At Special Prices`
            : 'Handpicked Sarees, Now At Special Prices'
          : templateId === 'new-arrivals'
            ? categoryFilter
              ? `New In ${categoryFilter}`
              : 'Fresh Off The Loom — New Arrivals'
            : templateId === 'introduction'
              ? `Introducing ${'AruhiHandlooms'}`
              : `A Note From ${'AruhiHandlooms'}`;
      const html = buildPremiumCampaignHtml({
        templateId,
        headline,
        subheadline:
          templateId === 'minimal'
            ? 'Handpicked ethnic wear, woven by master craftsmen across India.'
            : 'Handpicked pieces our customers love — real photos, real stock, click to shop instantly.',
        discountBadge: templateId === 'festive' ? 'LIMITED TIME OFFER' : undefined,
        heroImage: templateId === 'festive' && heroImageUrl.trim() ? heroImageUrl.trim() : undefined,
        products,
        categories, // renders the "Shop by Category" circle row, same as homepage
        coupon,
      });
      setMessage(html);
      if (!subject.trim()) setSubject(headline);
      toast.success(`${templateMeta.label} template laga diya (${products.length} real products ke saath)`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Template load nahi ho paya');
    } finally {
      setApplyingTemplate(null);
    }
  };

  const handleSend = async () => {
    if (selected.size === 0) {
      toast.error('Kam se kam ek customer select karo');
      return;
    }
    if (!subject.trim() || !message.trim()) {
      toast.error('Subject aur message dono likho');
      return;
    }
    setSending(true);
    try {
      // Leaves the SOURCE_STORE_FOOTER_CLAUSE placeholder in place — the
      // server resolves it per recipient (their own source_store_url,
      // falling back to Settings' global store name) right before sending,
      // so a mixed-store selection still gets each person's real store.
      const html = isPremiumHtml
        ? message
        : `<div style="font-family:sans-serif;font-size:15px;line-height:1.6">${message.replace(
            /\n/g,
            '<br/>'
          )}<hr style="margin-top:24px"/><p style="font-size:12px;color:#888">You're receiving this email because ${SOURCE_STORE_FOOTER_CLAUSE_PLACEHOLDER}. <a href="${UNSUBSCRIBE_LINK_PLACEHOLDER}" style="color:#888;">Not interested? Click here and we'll never email you again.</a>${TRACKING_PIXEL_PLACEHOLDER}</p></div>`;
      const scheduleAfterHours = scheduleEnabled ? Number(scheduleHours) || 0 : 0;
      const result = await sendWooCommerceCampaign({
        customerIds: Array.from(selected),
        subject,
        html,
        scheduleAfterHours: scheduleAfterHours > 0 ? scheduleAfterHours : undefined,
      });
      if (scheduleAfterHours > 0) {
        toast.success(
          `${result.queued ?? 0} customers ke liye schedule ho gaya — ~${scheduleAfterHours} ghante baad bhejna shuru hoga (daily cap ke hisaab se).`
        );
      } else {
        toast.success(`Sent: ${result.sent}, Skipped: ${result.skipped}, Failed: ${result.failed}`);
      }
      loadHistory();
      loadSegments();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Campaign send fail ho gaya');
    } finally {
      setSending(false);
    }
  };

  const handleSaveDrip = async (runNow: boolean) => {
    if (!dripSettings) return;
    setDripSaving(true);
    try {
      const { runResult } = await saveDripAutomationSettings(dripSettings, runNow);
      toast.success(runNow ? 'Settings save ho gayi aur batch bhej diya' : 'Automation settings save ho gayi');
      if (runNow && runResult && !runResult.error) {
        toast.success(
          `Run result — Welcome queued: ${runResult.welcomeQueued ?? 0}, Follow-up queued: ${runResult.followupQueued ?? 0}, Sent: ${runResult.sent ?? 0}, Failed: ${runResult.failed ?? 0}`
        );
      }
      await loadDripAutomation();
      loadHistory();
      loadSegments();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Automation settings save nahi hui');
    } finally {
      setDripSaving(false);
    }
  };

  return (
    <div className="grid gap-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-secondary">Admin</p>
        <h1 className="text-2xl font-serif font-semibold">WooCommerce Customer Import</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Apne WooCommerce store ke <strong>real orders</strong> se customer name, email, phone
          yahan la kar unhe email marketing bhejo. Ye sirf un logon ko import karta hai jinhone
          kabhi order kiya ho — WordPress ke fake/spam registered users kabhi include nahi
          honge. Sirf apne khud ke store ka data import karo, aur emails me hamesha opt-out ka
          option rakho.
        </p>
      </div>

      {/* Connect form */}
      <div className="rounded-lg border p-4 grid gap-3 max-w-xl">
        <h2 className="font-medium">1. WooCommerce se connect karo</h2>
        <Input
          placeholder="Store URL (e.g. https://mystore.com)"
          value={storeUrl}
          onChange={(e) => setStoreUrl(e.target.value)}
        />
        <Input
          placeholder="Consumer Key (ck_...)"
          value={consumerKey}
          onChange={(e) => setConsumerKey(e.target.value)}
        />
        <Input
          type="password"
          placeholder="Consumer Secret (cs_...)"
          value={consumerSecret}
          onChange={(e) => setConsumerSecret(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          Ye WooCommerce me milta hai: WordPress Admin → WooCommerce → Settings → Advanced →
          REST API → "Add key" (Permissions: Read).
        </p>
        <Button onClick={handleImport} disabled={importing} className="gap-2 w-fit">
          <Download className="h-4 w-4" />
          {importing ? importProgress || 'Import ho raha hai...' : 'Import Customers'}
        </Button>
      </div>

      {/* Imported list + campaign composer */}
      <div className="rounded-lg border p-4 grid gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-medium">2. Imported customers ({customers.length})</h2>
          <div className="flex items-center gap-2">
            {storeOptions.length > 1 && (
              <Select value={storeFilter} onValueChange={setStoreFilter}>
                <SelectTrigger className="w-44">
                  <SelectValue placeholder="Sabhi stores" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Sabhi stores</SelectItem>
                  {storeOptions.map((url) => (
                    <SelectItem key={url} value={url}>
                      {storeDisplayName(url)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <div className="relative w-64">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="Search name/email/phone"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Quick-glance campaign stats -- same numbers as the "Pehle bheji
            gayi campaigns" table below, just totalled across every campaign
            so you don't have to scroll down to check them. */}
        {!historyLoading && history.length > 0 && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            <button
              type="button"
              onClick={() => openRecipientsModal('sent')}
              className="rounded-md border bg-muted/20 p-2.5 text-left transition hover:border-primary/50 hover:bg-muted/40"
            >
              <p className="text-[11px] text-muted-foreground">Sent</p>
              <p className="text-lg font-semibold">{campaignTotals.sent}</p>
            </button>
            <button
              type="button"
              onClick={() => openRecipientsModal('opened')}
              className="rounded-md border bg-muted/20 p-2.5 text-left transition hover:border-primary/50 hover:bg-muted/40"
            >
              <p className="text-[11px] text-muted-foreground">Opened</p>
              <p className="text-lg font-semibold">{campaignTotals.opened}</p>
            </button>
            <div className="rounded-md border bg-muted/20 p-2.5">
              <p className="text-[11px] text-muted-foreground">Open rate</p>
              <p className="text-lg font-semibold">{campaignTotals.openRate}%</p>
            </div>
            <button
              type="button"
              onClick={() => openRecipientsModal('clicked')}
              className="rounded-md border bg-muted/20 p-2.5 text-left transition hover:border-primary/50 hover:bg-muted/40"
            >
              <p className="text-[11px] text-muted-foreground">Clicked</p>
              <p className="text-lg font-semibold">{campaignTotals.clicked}</p>
            </button>
            <button
              type="button"
              onClick={() => openRecipientsModal('failed')}
              className="rounded-md border bg-muted/20 p-2.5 text-left transition hover:border-primary/50 hover:bg-muted/40"
            >
              <p className="text-[11px] text-muted-foreground">Failed</p>
              <p className="text-lg font-semibold">{campaignTotals.failed}</p>
            </button>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Audience:</span>
          <Button
            type="button"
            variant={segmentFilter === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSegmentFilter('all')}
          >
            Sabhi ({segmentCounts.total})
          </Button>
          <Button
            type="button"
            variant={segmentFilter === 'cold' ? 'default' : 'outline'}
            size="sm"
            className="gap-1"
            onClick={() => setSegmentFilter('cold')}
            title="Kabhi email open nahi kiya, ya open kiya par link click nahi kiya"
          >
            <ThermometerSnowflake className="h-3.5 w-3.5" /> Cold ({segmentCounts.cold})
          </Button>
          <Button
            type="button"
            variant={segmentFilter === 'warm' ? 'default' : 'outline'}
            size="sm"
            className="gap-1"
            onClick={() => setSegmentFilter('warm')}
            title="Link click kiya, site pe aaya, par kharida nahi (sirf 1 page dekha)"
          >
            <Waves className="h-3.5 w-3.5" /> Warm ({segmentCounts.warm})
          </Button>
          <Button
            type="button"
            variant={segmentFilter === 'hot' ? 'default' : 'outline'}
            size="sm"
            className="gap-1"
            onClick={() => setSegmentFilter('hot')}
            title="Kharida, ya click karke 2+ pages dekhe"
          >
            <Flame className="h-3.5 w-3.5" /> Hot ({segmentCounts.hot})
          </Button>
          <span className="mx-1 h-4 w-px bg-border" />
          <Button
            type="button"
            variant={segmentFilter === 'purchased' ? 'default' : 'outline'}
            size="sm"
            className="gap-1"
            onClick={() => setSegmentFilter('purchased')}
            title="Campaign email se click karke aakar kharida"
          >
            <ShoppingBag className="h-3.5 w-3.5" /> Purchased ({behaviorCounts.purchased})
          </Button>
          <Button
            type="button"
            variant={segmentFilter === 'cartAbandoner' ? 'default' : 'outline'}
            size="sm"
            className="gap-1"
            onClick={() => setSegmentFilter('cartAbandoner')}
            title="Checkout shuru kiya par kharida nahi — cart abandoners"
          >
            <ShoppingCart className="h-3.5 w-3.5" /> Cart abandoners ({behaviorCounts.cartAbandoner})
          </Button>
          <Button
            type="button"
            variant={segmentFilter === 'addedToCart' ? 'default' : 'outline'}
            size="sm"
            className="gap-1"
            onClick={() => setSegmentFilter('addedToCart')}
            title="Cart me item daala"
          >
            <ShoppingCart className="h-3.5 w-3.5" /> Added to cart ({behaviorCounts.addedToCart})
          </Button>
          <Button
            type="button"
            variant={segmentFilter === 'wishlisted' ? 'default' : 'outline'}
            size="sm"
            className="gap-1"
            onClick={() => setSegmentFilter('wishlisted')}
            title="Wishlist me kuch save kiya"
          >
            <Heart className="h-3.5 w-3.5" /> Wishlist ({behaviorCounts.wishlisted})
          </Button>
          <Button
            type="button"
            variant={segmentFilter === 'notOpenedWelcome' ? 'default' : 'outline'}
            size="sm"
            className="gap-1"
            onClick={() => setSegmentFilter('notOpenedWelcome')}
            title="Welcome email bheje ko follow-up delay se zyada din ho gaye, par abhi tak open nahi kiya — inhe follow-up nahi jaata"
          >
            <MailX className="h-3.5 w-3.5" /> Not opened ({behaviorCounts.notOpenedWelcome})
          </Button>
          <span className="mx-1 h-4 w-px bg-border" />
          <Button
            type="button"
            variant={segmentFilter === 'emailSent' ? 'default' : 'outline'}
            size="sm"
            className="gap-1"
            onClick={() => setSegmentFilter('emailSent')}
            title="Kisi bhi campaign email inhe successfully bheji gayi"
          >
            <MailCheck className="h-3.5 w-3.5" /> Sent ({behaviorCounts.emailSent})
          </Button>
          <Button
            type="button"
            variant={segmentFilter === 'emailOpened' ? 'default' : 'outline'}
            size="sm"
            className="gap-1"
            onClick={() => setSegmentFilter('emailOpened')}
            title="Kisi bhi campaign email ko open kiya"
          >
            <MailOpen className="h-3.5 w-3.5" /> Opened ({behaviorCounts.emailOpened})
          </Button>
          <Button
            type="button"
            variant={segmentFilter === 'emailClicked' ? 'default' : 'outline'}
            size="sm"
            className="gap-1"
            onClick={() => setSegmentFilter('emailClicked')}
            title="Kisi bhi campaign email ke andar link pe click kiya"
          >
            <MousePointerClick className="h-3.5 w-3.5" /> Clicked ({behaviorCounts.emailClicked})
          </Button>
          <Button
            type="button"
            variant={segmentFilter === 'emailFailed' ? 'default' : 'outline'}
            size="sm"
            className="gap-1"
            onClick={() => setSegmentFilter('emailFailed')}
            title="Inko kam se kam ek campaign email bhejne me fail hui"
          >
            <MailWarning className="h-3.5 w-3.5" /> Failed ({behaviorCounts.emailFailed})
          </Button>
          {segmentsLoading && <span className="text-xs text-muted-foreground">Audience calculate ho raha hai...</span>}
          <Button type="button" variant="ghost" size="sm" onClick={loadSegments} className="ml-auto text-xs">
            Refresh
          </Button>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">Abhi koi customer import nahi hua.</p>
        ) : (
          <div className="max-h-80 overflow-auto rounded border">
            <table className="w-full text-sm">
              <thead className="bg-muted sticky top-0">
                <tr>
                  <th className="p-2 text-left">
                    <Checkbox checked={allFilteredSelected} onCheckedChange={toggleAll} />
                  </th>
                  <th className="p-2 text-left">Name</th>
                  <th className="p-2 text-left">Email</th>
                  <th className="p-2 text-left">Phone</th>
                  {storeOptions.length > 1 && <th className="p-2 text-left">Store</th>}
                  <th className="p-2 text-left">Audience</th>
                  <th className="p-2 text-left text-muted-foreground">📤 Sent</th>
                  <th className="p-2 text-left text-muted-foreground">📬 Opened</th>
                  <th className="p-2 text-left text-muted-foreground">🖱️ Clicked</th>
                  <th className="p-2" />
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((c) => (
                  <tr key={c.id} className="border-t">
                    <td className="p-2">
                      <Checkbox checked={selected.has(c.id)} onCheckedChange={() => toggleOne(c.id)} />
                    </td>
                    <td className="p-2">{c.name || '—'}</td>
                    <td className="p-2">{c.email || '—'}</td>
                    <td className="p-2">{c.phone || '—'}</td>
                    {storeOptions.length > 1 && (
                      <td className="p-2 text-muted-foreground">
                        {c.source_store_url ? storeDisplayName(c.source_store_url) : '—'}
                      </td>
                    )}
                    <td className="p-2">
                      <SegmentBadge segment={segments[c.id] ?? 'cold'} />
                    </td>
                    <td className="p-2 whitespace-nowrap text-xs text-muted-foreground">
                      {c.last_sent_at
                        ? new Date(c.last_sent_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' })
                        : <span className="text-muted-foreground/40">—</span>}
                    </td>
                    <td className="p-2 whitespace-nowrap text-xs text-muted-foreground">
                      {c.last_opened_at
                        ? <span className="text-green-600">{new Date(c.last_opened_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                        : <span className="text-muted-foreground/40">—</span>}
                    </td>
                    <td className="p-2 whitespace-nowrap text-xs text-muted-foreground">
                      {c.last_clicked_at
                        ? <span className="text-blue-600">{new Date(c.last_clicked_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                        : <span className="text-muted-foreground/40">—</span>}
                    </td>
                    <td className="p-2 text-right">
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(c.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {filtered.length > 0 && (
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              Showing {Math.min(visibleCount, filtered.length)} of {filtered.length}
            </span>
            {visibleCount < filtered.length && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setVisibleCount((v) => v + ROWS_PER_PAGE)}
              >
                Load more
              </Button>
            )}
          </div>
        )}

        {optedOut.length > 0 && (
          <details className="rounded border bg-muted/20">
            <summary className="cursor-pointer p-2 text-sm font-medium text-muted-foreground">
              Opted out ({optedOut.length}) — excluded from every future campaign
            </summary>
            <div className="max-h-56 overflow-auto border-t">
              <table className="w-full text-sm">
                <thead className="bg-muted sticky top-0">
                  <tr>
                    <th className="p-2 text-left">Name</th>
                    <th className="p-2 text-left">Email</th>
                    <th className="p-2 text-left">Opted out</th>
                  </tr>
                </thead>
                <tbody>
                  {optedOut.map((c) => (
                    <tr key={c.id} className="border-t text-muted-foreground">
                      <td className="p-2">{c.name || '—'}</td>
                      <td className="p-2">{c.email || '—'}</td>
                      <td className="p-2">{c.opted_out_at ? new Date(c.opted_out_at).toLocaleDateString() : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        )}

        <h2 className="font-medium">3. Email campaign bhejo ({selected.size} selected)</h2>

        <div className="rounded-md border bg-muted/30 p-3 grid gap-2">
          <p className="text-xs font-medium flex items-center gap-1">
            <Sparkles className="h-3.5 w-3.5" /> Premium template (asli products, clickable)
          </p>
          <p className="text-xs text-muted-foreground">
            Source store naam ab automatic hai — har customer ko unke apne source store ka naam
            dikhega (disclosure line me), Settings me diye gaye naam ko sirf fallback ki tarah use
            karte hue jab kisi customer ka apna store pata na ho.
          </p>
          <Input
            placeholder="Hero banner image URL (optional — Festive template ke top pe dikhega, jaisa homepage pe hai)"
            value={heroImageUrl}
            onChange={(e) => setHeroImageUrl(e.target.value)}
            className="text-xs"
          />
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground whitespace-nowrap">Category filter:</span>
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="h-8 w-56 text-xs">
                <SelectValue placeholder="Sabhi categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Sabhi categories (featured/latest)</SelectItem>
                {availableCategories.map((c) => (
                  <SelectItem key={c.slug} value={c.name}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-wrap gap-2">
            {CAMPAIGN_TEMPLATES.map((t) => (
              <Button
                key={t.id}
                type="button"
                variant="outline"
                size="sm"
                disabled={applyingTemplate !== null}
                onClick={() => applyTemplate(t.id)}
                title={t.description}
              >
                {applyingTemplate === t.id ? 'Loading...' : t.label}
              </Button>
            ))}
            {isPremiumHtml && (
              <Button type="button" variant="ghost" size="sm" className="gap-1" onClick={() => setShowPreview((s) => !s)}>
                <Eye className="h-3.5 w-3.5" /> {showPreview ? 'Preview hide karo' : 'Preview dekho'}
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Ek click me tumhare store ke real in-stock products (photo, naam, price) aur
            categories (round photo, jaisa homepage pe hai) se poora template ban jayega — har
            category aur product click karne par uske asli page pe khulega. Upar se ek category
            chun ke products sirf usi category ke dikha sakte ho (default: featured/latest sabse).
            Hero banner me ek <strong>animated .gif</strong> ka URL bhi daal sakte ho (jo 2-3 banners
            cycle kare) — asli JS carousel to email me nahi chalta, lekin GIF sabse close alternative hai.
            Jo bhi coupon abhi <strong>Active</strong> aur <strong>Show on Product Page</strong> pe on hai
            (Admin → Coupons), wo apne aap ek discount banner ki tarah template me lag jayega — koi
            manual step nahi; agar coupon badlega ya band hoga, agli baar template banate hi wo bhi
            khud update ho jayega.
          </p>
        </div>

        {showPreview && isPremiumHtml && (
          <iframe
            title="Email preview"
            srcDoc={message.replace(TRACKING_PIXEL_PLACEHOLDER, '')}
            className="w-full h-96 rounded border bg-white"
          />
        )}

        <Input placeholder="Subject line" value={subject} onChange={(e) => setSubject(e.target.value)} />
        {isPremiumHtml && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
            Premium template active hai (HTML source niche dikh raha hai) — "Preview dekho" se
            visual check karo. Niche direct HTML edit bhi kar sakte ho.
          </p>
        )}
        <Textarea
          placeholder="Message likho... (ya upar se ek premium template chuno)"
          rows={isPremiumHtml ? 10 : 6}
          className={isPremiumHtml ? 'font-mono text-xs' : undefined}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />

        <p className="text-xs text-muted-foreground">
          Email bhejne ke liye Admin → Settings → Email Notifications me pehle Resend ya
          ZeptoMail configure karo, warna send fail hoga.
        </p>

        <div className="flex flex-wrap items-center gap-3 rounded-md border bg-muted/20 p-3">
          <label className="flex items-center gap-2 text-xs font-medium">
            <Switch checked={scheduleEnabled} onCheckedChange={setScheduleEnabled} />
            Schedule karo (abhi nahi, baad me bhejo)
          </label>
          {scheduleEnabled && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">Kitne ghante baad:</span>
              <Input
                type="number"
                min={1}
                className="h-8 w-20"
                value={scheduleHours}
                onChange={(e) => setScheduleHours(e.target.value)}
              />
              <span className="text-muted-foreground">
                (daily cron ek din me sirf ek baar chalta hai, isliye ye N ghante baad se pehle
                available cron run pe bhejega, exact minute pe nahi)
              </span>
            </div>
          )}
        </div>

        <Button onClick={handleSend} disabled={sending} className="gap-2 w-fit">
          <Send className="h-4 w-4" />
          {sending
            ? 'Bhej raha hai...'
            : scheduleEnabled
              ? `Schedule ${selected.size} customers`
              : `Send to ${selected.size} customers`}
        </Button>
      </div>

      {/* Campaign history + open tracking */}
      <div className="rounded-lg border p-4 grid gap-3">
        <h2 className="font-medium">4. Pehle bheji gayi campaigns (open tracking)</h2>
        {historyLoading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : history.length === 0 ? (
          <p className="text-sm text-muted-foreground">Abhi tak koi campaign nahi bheji gayi.</p>
        ) : (
          <div className="overflow-auto rounded border">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="p-2 text-left">Subject</th>
                  <th className="p-2 text-right">Sent</th>
                  <th className="p-2 text-right">Opened</th>
                  <th className="p-2 text-right">Open rate</th>
                  <th className="p-2 text-right">Clicked</th>
                  <th className="p-2 text-right">Failed</th>
                  <th className="p-2 text-left">Last sent</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.subject} className="border-t">
                    <td className="p-2">{h.subject}</td>
                    <td className="p-2 text-right">{h.sent}</td>
                    <td className="p-2 text-right">{h.opened}</td>
                    <td className="p-2 text-right">
                      {h.sent > 0 ? `${Math.round((h.opened / h.sent) * 100)}%` : '—'}
                    </td>
                    <td className="p-2 text-right">{h.clicked}</td>
                    <td className="p-2 text-right">{h.failed}</td>
                    <td className="p-2">{new Date(h.lastSentAt).toLocaleString('en-IN')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Welcome -> follow-up drip automation */}
      <div className="rounded-lg border p-4 grid gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-medium">5. Automated welcome + follow-up (drip)</h2>
          {dripSettings && (
            <label className="flex items-center gap-2 text-xs font-medium">
              <Switch
                checked={dripSettings.enabled}
                onCheckedChange={(checked) => setDripSettings({ ...dripSettings, enabled: checked })}
              />
              {dripSettings.enabled ? 'ON — automatic emails ja rahe hain' : 'OFF — koi automatic email nahi jaayega'}
            </label>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          Jab ON ho: har naye imported customer ko pehle <strong>Welcome</strong> email jaata hai. Us
          welcome ke bhejne ke <strong>N din baad</strong>, agar wo customer opt-out nahi hua, use
          doosra <strong>Follow-up</strong> email jaata hai (jo template aap niche set karo). Poori
          list ek saath nahi jaati — roz sirf <strong>daily cap</strong> tak bhejta hai, list ke sabse
          purane/top imported customer se shuru karke.
        </p>

        {dripLoading || !dripSettings ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : (
          <>
            {dripProgress && (
              <div className="grid grid-cols-2 gap-2 rounded-md border bg-muted/20 p-3 text-xs sm:grid-cols-4">
                <div>
                  <p className="text-muted-foreground">Aaj bheje</p>
                  <p className="font-medium">
                    {dripProgress.sentToday} / {dripProgress.dailyCap}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Welcome queue me</p>
                  <p className="font-medium">{dripProgress.queuedWelcome}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Follow-up queue me</p>
                  <p className="font-medium">{dripProgress.queuedFollowup}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Total welcome/follow-up bheje</p>
                  <p className="font-medium">
                    {dripProgress.sentWelcomeTotal} / {dripProgress.sentFollowupTotal}
                  </p>
                </div>
              </div>
            )}

            <div className="grid gap-2 sm:grid-cols-2">
              <div className="grid gap-1">
                <label className="text-xs font-medium">Daily send cap (per din max kitne email)</label>
                <Input
                  type="number"
                  min={1}
                  value={dripSettings.dailySendCap}
                  onChange={(e) => setDripSettings({ ...dripSettings, dailySendCap: Number(e.target.value) || 1 })}
                />
              </div>
              <div className="grid gap-1">
                <label className="text-xs font-medium">Follow-up kitne din baad</label>
                <Input
                  type="number"
                  min={0}
                  value={dripSettings.followupDelayDays}
                  onChange={(e) => setDripSettings({ ...dripSettings, followupDelayDays: Number(e.target.value) || 0 })}
                />
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <div className="grid gap-1">
                <label className="text-xs font-medium">Daily send time (IST)</label>
                <div className="flex gap-2">
                  <Select
                    value={String(((dripSettings.sendHourIST + 11) % 12) + 1)}
                    onValueChange={(v) => {
                      const hour12 = Number(v);
                      const isPM = dripSettings.sendHourIST >= 12;
                      const hour24 = (hour12 % 12) + (isPM ? 12 : 0);
                      setDripSettings({ ...dripSettings, sendHourIST: hour24 });
                    }}
                  >
                    <SelectTrigger className="w-20">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => (
                        <SelectItem key={h} value={String(h)}>
                          {h}:00
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={dripSettings.sendHourIST >= 12 ? 'PM' : 'AM'}
                    onValueChange={(v) => {
                      const hour12 = ((dripSettings.sendHourIST + 11) % 12) + 1;
                      const hour24 = (hour12 % 12) + (v === 'PM' ? 12 : 0);
                      setDripSettings({ ...dripSettings, sendHourIST: hour24 });
                    }}
                  >
                    <SelectTrigger className="w-20">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="AM">AM</SelectItem>
                      <SelectItem value="PM">PM</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Cron sirf isi ghante ke ±1 ghante mein bhejega. Vercel Hobby ka cron abhi bhi ek fixed UTC time pe
                  chalta hai (vercel.json) — agar wo iss window se bahar hai to koi email nahi jayega jab tak ya to
                  vercel.json ka time update na karo, ya kisi external scheduler (jaise cron-job.org) se isi time pe
                  /api/cron/daily-jobs ko CRON_SECRET header ke saath hit na karo.
                </p>
              </div>
              <div className="grid gap-1">
                <label className="text-xs font-medium">Follow-up sirf openers ko</label>
                <label className="flex items-center gap-2 text-sm rounded-md border px-3 py-2">
                  <Checkbox
                    checked={dripSettings.followupRequiresOpen}
                    onCheckedChange={(checked) =>
                      setDripSettings({ ...dripSettings, followupRequiresOpen: checked === true })
                    }
                  />
                  Welcome open na karne walon ko follow-up mat bhejo
                </label>
                <p className="text-[11px] text-muted-foreground">
                  ON rahega to "Not opened" audience chip mein wo log dikhenge, taaki unhe manually alag se target kar
                  sako — spam complaints kam karta hai.
                </p>
              </div>
            </div>

            <div className="grid gap-1">
              <label className="text-xs font-medium">Source store name (disclosure me dikhega)</label>
              <Input
                value={dripSettings.sourceStoreName}
                onChange={(e) => setDripSettings({ ...dripSettings, sourceStoreName: e.target.value })}
                placeholder="e.g. mishaboutique.com"
              />
            </div>

            {(['welcome', 'followup'] as const).map((step) => (
              <div key={step} className="grid gap-2 rounded-md border p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {step === 'welcome' ? '1st email — Welcome' : `2nd email — Follow-up (${dripSettings.followupDelayDays} din baad)`}
                </p>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground whitespace-nowrap">Template:</span>
                  <Select
                    value={dripSettings[step].templateId}
                    onValueChange={(v) =>
                      setDripSettings({ ...dripSettings, [step]: { ...dripSettings[step], templateId: v } })
                    }
                  >
                    <SelectTrigger className="h-8 w-56 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CAMPAIGN_TEMPLATES.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Input
                  placeholder="Subject line"
                  value={dripSettings[step].subject}
                  onChange={(e) => setDripSettings({ ...dripSettings, [step]: { ...dripSettings[step], subject: e.target.value } })}
                />
                <Input
                  placeholder="Headline"
                  value={dripSettings[step].headline}
                  onChange={(e) => setDripSettings({ ...dripSettings, [step]: { ...dripSettings[step], headline: e.target.value } })}
                />
                <Textarea
                  placeholder="Subheadline (optional)"
                  rows={2}
                  value={dripSettings[step].subheadline}
                  onChange={(e) => setDripSettings({ ...dripSettings, [step]: { ...dripSettings[step], subheadline: e.target.value } })}
                />
              </div>
            ))}

            <div className="flex flex-wrap gap-2">
              <Button onClick={() => handleSaveDrip(false)} disabled={dripSaving} variant="outline">
                {dripSaving ? 'Save ho raha hai...' : 'Settings save karo'}
              </Button>
              <Button onClick={() => handleSaveDrip(true)} disabled={dripSaving}>
                {dripSaving ? 'Chal raha hai...' : 'Save & Abhi Run Karo'}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Note: ye daily cron (roz ek baar) se chalta hai, isliye kitne-din-baad wala gap
              approximate hai (agle cron run tak). Save &amp; Abhi Run Karo turant ek batch bhej dega
              (daily cap tak) taaki turant test kar sako.
            </p>
          </>
        )}
      </div>

      {/* Name/email list behind the Sent/Opened/Clicked/Failed cards above */}
      <Dialog open={recipientsModal !== null} onOpenChange={(open) => !open && setRecipientsModal(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {recipientsModal ? RECIPIENT_STATUS_LABELS[recipientsModal] : ''} ({recipients.length})
            </DialogTitle>
          </DialogHeader>
          {recipientsLoading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : recipients.length === 0 ? (
            <p className="text-sm text-muted-foreground">Koi record nahi mila.</p>
          ) : (
            <div className="max-h-96 overflow-auto rounded border">
              <table className="w-full text-sm">
                <thead className="bg-muted sticky top-0">
                  <tr>
                    <th className="p-2 text-left">Name</th>
                    <th className="p-2 text-left">Email</th>
                    <th className="p-2 text-left">Phone</th>
                    <th className="p-2 text-left">Campaign</th>
                    <th className="p-2 text-left">📤 Sent</th>
                    <th className="p-2 text-left">📬 Opened</th>
                    <th className="p-2 text-left">🖱️ Clicked</th>
                  </tr>
                </thead>
                <tbody>
                  {recipients.map((r) => (
                    <tr key={r.id} className="border-t">
                      <td className="p-2">{r.name || '—'}</td>
                      <td className="p-2">{r.email}</td>
                      <td className="p-2">{r.phone || '—'}</td>
                      <td className="p-2 max-w-[160px] truncate" title={r.subject}>{r.subject}</td>
                      <td className="p-2 whitespace-nowrap text-xs">
                        {r.sentAt ? new Date(r.sentAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}
                      </td>
                      <td className="p-2 whitespace-nowrap text-xs">
                        {r.openedAt
                          ? <span className="text-green-600">{new Date(r.openedAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                          : <span className="text-muted-foreground/40">—</span>}
                      </td>
                      <td className="p-2 whitespace-nowrap text-xs">
                        {r.clickedAt
                          ? <span className="text-blue-600">{new Date(r.clickedAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                          : <span className="text-muted-foreground/40">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
