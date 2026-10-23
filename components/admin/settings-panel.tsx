'use client';

import { useEffect, useState, FormEvent } from 'react';
import { Save, Upload, Loader2, Trash2 } from 'lucide-react';
import Image from 'next/image';
import {
  StoreInfo,
  fetchStoreInfo,
  saveStoreInfo,
  AboutContent,
  fetchAboutContent,
  saveAboutContent,
  DEFAULT_ABOUT_CONTENT,
  EmailSettings,
  SiteBanner,
  fetchSiteBanner,
  saveSiteBanner,
  AiChatSettings,
  fetchAiChatSettings,
  saveAiChatSettings,
  AI_CHAT_MODEL_OPTIONS,
  ImageSearchAiSettings,
  fetchImageSearchAiSettings,
  saveImageSearchAiSettings,
  SocialLinks,
  fetchSocialLinks,
  saveSocialLinks,
  PaymentDiscountSettings,
  fetchPaymentDiscountSettings,
  savePaymentDiscountSettings,
  RefundAutomationSettings,
  fetchRefundAutomationSettings,
  saveRefundAutomationSettings,
  OrderNotificationSettings,
  fetchOrderNotificationSettings,
  saveOrderNotificationSettings,
  HandlingFeeSettings,
  fetchHandlingFeeSettings,
  saveHandlingFeeSettings,
  MediaDeliverySettings,
  fetchMediaDeliverySettings,
  saveMediaDeliverySettings,
  MediaStorageBackendSettings,
  fetchMediaStorageBackendSettings,
  saveMediaStorageBackendSettings,
  CatalogVideoSettings,
  fetchCatalogVideoSettings,
  saveCatalogVideoSettings,
  CatalogListingSettings,
  fetchCatalogListingSettings,
  saveCatalogListingSettings,
  ResponsiveImagesSettings,
  fetchResponsiveImagesSettings,
  saveResponsiveImagesSettings,
  AvifNegotiationSettings,
  fetchAvifNegotiationSettings,
  saveAvifNegotiationSettings,
  BlurPlaceholderSettings,
  fetchBlurPlaceholderSettings,
  saveBlurPlaceholderSettings,
} from '@/lib/settings-api';
import { DEFAULT_PARTIAL_PAY_SETTINGS, normalizePartialPay, computeAdvance, type PartialPaySettings } from '@/lib/partial-pay';
import type { BackfillProgress } from '@/lib/media-backfill';
import type { ResizeBackfillProgress } from '@/lib/image-resize-backfill';
import type { BlurBackfillProgress } from '@/lib/blur-preview-backfill';
import { uploadProductImage } from '@/lib/products-api';
import {
  ShippingSettings,
  fetchShippingSettings,
  saveShippingSettings,
} from '@/lib/pincode-api';
import {
  DelhiverySettings,
  fetchDelhiverySettings,
  saveDelhiverySettings,
} from '@/lib/delhivery-api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { toast } from 'sonner';

export default function SettingsPanel() {
  const [form, setForm] = useState<StoreInfo | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const [aboutForm, setAboutForm] = useState<AboutContent | null>(null);
  const [savingAbout, setSavingAbout] = useState(false);

  const [checkoutForm, setCheckoutForm] = useState<ShippingSettings | null>(null);
  const [savingCheckout, setSavingCheckout] = useState(false);

  const [delhiveryForm, setDelhiveryForm] = useState<DelhiverySettings | null>(null);
  const [savingDelhivery, setSavingDelhivery] = useState(false);

  const [emailForm, setEmailForm] = useState<EmailSettings | null>(null);
  const [savingEmail, setSavingEmail] = useState(false);
  const [testEmailTo, setTestEmailTo] = useState('');
  const [sendingTest, setSendingTest] = useState(false);

  const [bannerForm, setBannerForm] = useState<SiteBanner | null>(null);
  const [savingBanner, setSavingBanner] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);

  const [webpRunning, setWebpRunning] = useState(false);
  const [webpDone, setWebpDone] = useState(false);
  const [webpStats, setWebpStats] = useState({ total: 0, converted: 0, skipped: 0, alreadyOptimal: 0, remaining: 0 });

  const [aiChatForm, setAiChatForm] = useState<AiChatSettings | null>(null);
  const [savingAiChat, setSavingAiChat] = useState(false);
  const [testingAiChat, setTestingAiChat] = useState(false);
  const [aiTestResult, setAiTestResult] = useState<any>(null);

  const [imageSearchAiForm, setImageSearchAiForm] = useState<ImageSearchAiSettings | null>(null);
  const [savingImageSearchAi, setSavingImageSearchAi] = useState(false);
  const [testingImageSearchAi, setTestingImageSearchAi] = useState(false);
  const [imageSearchAiTestResult, setImageSearchAiTestResult] = useState<any>(null);

  const [socialForm, setSocialForm] = useState<SocialLinks | null>(null);
  const [savingSocial, setSavingSocial] = useState(false);

  const [paymentDiscountForm, setPaymentDiscountForm] = useState<PaymentDiscountSettings | null>(null);
  const [savingPaymentDiscount, setSavingPaymentDiscount] = useState(false);
  const [partialPayForm, setPartialPayForm] = useState<PartialPaySettings | null>(null);
  const [savingPartialPay, setSavingPartialPay] = useState(false);
  const [catalogVideoForm, setCatalogVideoForm] = useState<CatalogVideoSettings | null>(null);
  const [savingCatalogVideo, setSavingCatalogVideo] = useState(false);
  const [catalogListingForm, setCatalogListingForm] = useState<CatalogListingSettings | null>(null);
  const [savingCatalogListing, setSavingCatalogListing] = useState(false);
  const [refundAutomationForm, setRefundAutomationForm] = useState<RefundAutomationSettings | null>(null);
  const [savingRefundAutomation, setSavingRefundAutomation] = useState(false);
  const [mediaDeliveryForm, setMediaDeliveryForm] = useState<MediaDeliverySettings | null>(null);
  const [savingMediaDelivery, setSavingMediaDelivery] = useState(false);
  const [mediaStorageBackendForm, setMediaStorageBackendForm] = useState<MediaStorageBackendSettings | null>(null);
  const [savingMediaStorageBackend, setSavingMediaStorageBackend] = useState(false);
  const [r2EnvConfigured, setR2EnvConfigured] = useState(false);
  const [backfillProgress, setBackfillProgress] = useState<BackfillProgress | null>(null);
  const [backfillStarting, setBackfillStarting] = useState(false);
  const [responsiveImagesForm, setResponsiveImagesForm] = useState<ResponsiveImagesSettings | null>(null);
  const [savingResponsiveImages, setSavingResponsiveImages] = useState(false);
  const [avifNegotiationForm, setAvifNegotiationForm] = useState<AvifNegotiationSettings | null>(null);
  const [savingAvifNegotiation, setSavingAvifNegotiation] = useState(false);
  const [blurPlaceholderForm, setBlurPlaceholderForm] = useState<BlurPlaceholderSettings | null>(null);
  const [savingBlurPlaceholder, setSavingBlurPlaceholder] = useState(false);
  const [resizeBackfillProgress, setResizeBackfillProgress] = useState<ResizeBackfillProgress | null>(null);
  const [resizeBackfillStarting, setResizeBackfillStarting] = useState(false);
  const [blurBackfillProgress, setBlurBackfillProgress] = useState<BlurBackfillProgress | null>(null);
  const [blurBackfillStarting, setBlurBackfillStarting] = useState(false);
  const [orderNotifForm, setOrderNotifForm] = useState<OrderNotificationSettings | null>(null);
  const [savingOrderNotif, setSavingOrderNotif] = useState(false);
  const [handlingFeeForm, setHandlingFeeForm] = useState<HandlingFeeSettings | null>(null);
  const [savingHandlingFee, setSavingHandlingFee] = useState(false);

  useEffect(() => {
    fetchStoreInfo()
      .then(setForm)
      .catch(() => toast.error('Failed to load store settings'))
      .finally(() => setLoading(false));

    fetchAboutContent()
      .then(setAboutForm)
      .catch(() => toast.error('Failed to load About Us content'));

    fetchShippingSettings()
      .then(setCheckoutForm)
      .catch(() => toast.error('Failed to load GST & shipping settings'));

    fetchDelhiverySettings()
      .then(setDelhiveryForm)
      .catch(() => toast.error('Failed to load Delhivery settings'));

    fetch('/api/admin/settings/email')
      .then((r) => r.json())
      .then((d) => {
        if (d?.settings) setEmailForm(d.settings);
        else throw new Error(d?.error || 'Failed to load email settings');
      })
      .catch(() => toast.error('Failed to load email settings'));

    fetchSiteBanner()
      .then(setBannerForm)
      .catch(() => toast.error('Failed to load site banner'));

    fetchAiChatSettings()
      .then(setAiChatForm)
      .catch(() => toast.error('Failed to load AI chat settings'));

    fetchImageSearchAiSettings()
      .then(setImageSearchAiForm)
      .catch(() => toast.error('Failed to load image search AI settings'));

    fetchSocialLinks()
      .then(setSocialForm)
      .catch(() => toast.error('Failed to load social media links'));

    // Partial Pay is read/written through an admin-only route (the advance is derived from it).
    fetch('/api/admin/settings/partial-pay', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('load failed'))))
      .then((d) => setPartialPayForm(normalizePartialPay(d.settings)))
      .catch(() => {
        setPartialPayForm(DEFAULT_PARTIAL_PAY_SETTINGS);
        toast.error('Failed to load Partial Pay settings');
      });

    fetchPaymentDiscountSettings()
      .then(setPaymentDiscountForm)
      .catch(() => toast.error('Failed to load online payment discount settings'));

    fetchCatalogVideoSettings()
      .then(setCatalogVideoForm)
      .catch(() => toast.error('Failed to load catalog video settings'));

    fetchCatalogListingSettings()
      .then(setCatalogListingForm)
      .catch(() => toast.error('Failed to load catalog listing settings'));

    fetchRefundAutomationSettings()
      .then(setRefundAutomationForm)
      .catch(() => toast.error('Failed to load refund automation settings'));

    fetchMediaDeliverySettings()
      .then(setMediaDeliveryForm)
      .catch(() => toast.error('Failed to load media delivery settings'));

    fetchMediaStorageBackendSettings()
      .then(setMediaStorageBackendForm)
      .catch(() => toast.error('Failed to load media storage backend settings'));

    // Load current backfill status once on mount. If a run is already
    // in progress (e.g. the admin refreshed the page mid-run), the
    // polling effect below picks it up automatically.
    fetch('/api/admin/media-backfill')
      .then((r) => r.json())
      .then((j) => setBackfillProgress(j?.progress ?? null))
      .catch(() => {}); // non-critical — panel just shows "Loading…" until retried

    // Check whether R2 env vars are configured (server reports via a simple
    // endpoint rather than exposing secrets to the client).
    fetch('/api/admin/media-storage-backend/status')
      .then((r) => r.json())
      .then((j) => setR2EnvConfigured(!!j?.r2_configured))
      .catch(() => {}); // non-critical — defaults to false (disables R2 option)

    fetchResponsiveImagesSettings()
      .then(setResponsiveImagesForm)
      .catch(() => toast.error('Failed to load responsive images setting'));

    fetchAvifNegotiationSettings()
      .then(setAvifNegotiationForm)
      .catch(() => toast.error('Failed to load AVIF negotiation setting'));

    fetchBlurPlaceholderSettings()
      .then(setBlurPlaceholderForm)
      .catch(() => toast.error('Failed to load blur placeholder setting'));

    fetch('/api/admin/image-resize-backfill')
      .then((r) => r.json())
      .then((j) => setResizeBackfillProgress(j?.progress ?? null))
      .catch(() => {}); // non-critical — panel just shows "Loading…" until retried

    fetch('/api/admin/blur-preview-backfill')
      .then((r) => r.json())
      .then((j) => setBlurBackfillProgress(j?.progress ?? null))
      .catch(() => {}); // non-critical — panel just shows "Loading…" until retried

    fetchOrderNotificationSettings()
      .then(setOrderNotifForm)
      .catch(() => toast.error('Failed to load order notification settings'));

    fetchHandlingFeeSettings()
      .then(setHandlingFeeForm)
      .catch(() => toast.error('Failed to load vendor commission settings'));
  }, []);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    try {
      await saveStoreInfo(form);
      toast.success('Store settings saved');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const onSubmitAbout = async (e: FormEvent) => {
    e.preventDefault();
    if (!aboutForm) return;
    setSavingAbout(true);
    try {
      await saveAboutContent(aboutForm);
      toast.success('About Us content saved');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSavingAbout(false);
    }
  };

  const updateAboutValue = (index: number, field: 'title' | 'body', text: string) => {
    setAboutForm((f) => {
      if (!f) return f;
      const values = f.values.map((v, i) => (i === index ? { ...v, [field]: text } : v));
      return { ...f, values };
    });
  };

  const updateAboutStep = (index: number, field: 'title' | 'body', text: string) => {
    setAboutForm((f) => {
      if (!f) return f;
      const process_steps = f.process_steps.map((s, i) =>
        i === index ? { ...s, [field]: text } : s
      );
      return { ...f, process_steps };
    });
  };

  const onSubmitCheckout = async (e: FormEvent) => {
    e.preventDefault();
    if (!checkoutForm) return;
    setSavingCheckout(true);
    try {
      await saveShippingSettings(checkoutForm);
      toast.success('GST & shipping settings saved');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSavingCheckout(false);
    }
  };

  const onSubmitDelhivery = async (e: FormEvent) => {
    e.preventDefault();
    if (!delhiveryForm) return;
    setSavingDelhivery(true);
    try {
      await saveDelhiverySettings(delhiveryForm);
      toast.success('Delhivery settings saved');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSavingDelhivery(false);
    }
  };

  const onSubmitAiChat = async (e: FormEvent) => {
    e.preventDefault();
    if (!aiChatForm) return;
    setSavingAiChat(true);
    try {
      await saveAiChatSettings(aiChatForm);
      toast.success('AI chat settings saved');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSavingAiChat(false);
    }
  };

  const onSubmitImageSearchAi = async (e: FormEvent) => {
    e.preventDefault();
    if (!imageSearchAiForm) return;
    setSavingImageSearchAi(true);
    try {
      await saveImageSearchAiSettings(imageSearchAiForm);
      toast.success('Image search AI settings saved');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSavingImageSearchAi(false);
    }
  };

  const onSubmitSocial = async (e: FormEvent) => {
    e.preventDefault();
    if (!socialForm) return;
    setSavingSocial(true);
    try {
      await saveSocialLinks(socialForm);
      toast.success('Social media links saved');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSavingSocial(false);
    }
  };

  const onSubmitPartialPay = async (e: FormEvent) => {
    e.preventDefault();
    if (!partialPayForm) return;
    setSavingPartialPay(true);
    try {
      const res = await fetch('/api/admin/settings/partial-pay', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(partialPayForm),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Save failed');
      setPartialPayForm(normalizePartialPay(data.settings));
      toast.success('Partial Pay settings saved');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSavingPartialPay(false);
    }
  };

  const onSubmitPaymentDiscount = async (e: FormEvent) => {
    e.preventDefault();
    if (!paymentDiscountForm) return;
    setSavingPaymentDiscount(true);
    try {
      await savePaymentDiscountSettings(paymentDiscountForm);
      toast.success('Online payment discount saved');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSavingPaymentDiscount(false);
    }
  };

  // Single master toggle -- saves the moment it's flipped, same as other
  // one-switch settings (e.g. media delivery), no separate Save button.
  const onToggleCatalogVideoDefault = async (checked: boolean) => {
    if (!catalogVideoForm) return;
    const next = { ...catalogVideoForm, default_enabled: checked };
    setCatalogVideoForm(next);
    setSavingCatalogVideo(true);
    try {
      await saveCatalogVideoSettings(next);
      toast.success('Catalog video default saved');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
      setCatalogVideoForm(catalogVideoForm);
    } finally {
      setSavingCatalogVideo(false);
    }
  };

  const onSubmitCatalogListing = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!catalogListingForm) return;
    setSavingCatalogListing(true);
    try {
      await saveCatalogListingSettings(catalogListingForm);
      toast.success('Catalog listing size saved');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSavingCatalogListing(false);
    }
  };

  const onToggleRefundAutomation = async (checked: boolean) => {
    if (!refundAutomationForm) return;
    const next = { ...refundAutomationForm, auto_refund_enabled: checked };
    setRefundAutomationForm(next); // update immediately so the switch feels responsive
    setSavingRefundAutomation(true);
    try {
      await saveRefundAutomationSettings(next);
      toast.success(checked ? 'Automatic refunds turned on' : 'Switched to manual refunds');
    } catch (err) {
      setRefundAutomationForm(refundAutomationForm); // revert the switch on failure
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSavingRefundAutomation(false);
    }
  };

  const onToggleMediaDelivery = async (checked: boolean) => {
    if (!mediaDeliveryForm) return;
    const next = { ...mediaDeliveryForm, proxy_enabled: checked };
    setMediaDeliveryForm(next); // update immediately so the switch feels responsive
    setSavingMediaDelivery(true);
    try {
      const result = await saveMediaDeliverySettings(next);
      const mode = checked ? 'domain (Vercel)' : 'Supabase directly';
      if (result.cloudflare_purge.attempted && result.cloudflare_purge.ok) {
        toast.success(`Now serving media from ${mode} — Cloudflare cache cleared, takes effect immediately.`);
      } else if (result.cloudflare_purge.attempted && !result.cloudflare_purge.ok) {
        toast.warning(
          `Saved, but Cloudflare cache purge failed (${result.cloudflare_purge.error}). Already-viewed images may take up to a year to reflect this until their cache expires — new images are unaffected.`
        );
      } else {
        toast.success(
          `Saved (serving from ${mode}). Cloudflare purge isn't configured, so already-viewed images won't reflect this until their cache expires — new images will.`
        );
      }
    } catch (err) {
      setMediaDeliveryForm(mediaDeliveryForm); // revert the switch on failure
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSavingMediaDelivery(false);
    }
  };

  const onToggleMediaStorageBackend = async (checked: boolean) => {
    if (!mediaStorageBackendForm) return;
    const next: MediaStorageBackendSettings = { backend: checked ? 'r2' : 'supabase' };
    setMediaStorageBackendForm(next);
    setSavingMediaStorageBackend(true);
    try {
      const result = await saveMediaStorageBackendSettings(next);
      const backend = result.backend === 'r2' ? 'Cloudflare R2' : 'Supabase';
      if (result.cloudflare_purge.ok) {
        toast.success(`Preferred backend set to ${backend} — Cloudflare cache cleared, takes effect immediately.`);
      } else {
        toast.success(`Preferred backend set to ${backend}. Cloudflare purge wasn't configured — new requests will use the new backend, already-cached images may take time.`);
      }
    } catch (err) {
      setMediaStorageBackendForm(mediaStorageBackendForm);
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSavingMediaStorageBackend(false);
    }
  };

  // ---------------------------------------------------------------------
  // R2 backfill — copies pre-existing Supabase-only files into R2 too.
  // Read-only on Supabase (originals are never touched), idempotent
  // (already-mirrored files are skipped), safe to re-run any time.
  // While status === 'running', this polls the server for the next
  // batch every ~1.5s so the progress bar updates live.
  // ---------------------------------------------------------------------
  useEffect(() => {
    if (backfillProgress?.status !== 'running') return;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch('/api/admin/media-backfill', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'run-batch' }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || 'Backfill batch failed');
        setBackfillProgress(json.progress);
        if (json.progress?.status === 'done') {
          toast.success(
            `Backfill complete — ${json.progress.mirrored} file(s) copied to R2, ${json.progress.alreadyMirrored} already had a mirror, ${json.progress.failed} failed. Every original file in Supabase is untouched.`
          );
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Backfill batch failed — will retry');
      }
    }, 1500);
    return () => clearTimeout(timer);
  }, [backfillProgress]);

  const onStartBackfill = async () => {
    setBackfillStarting(true);
    try {
      const res = await fetch('/api/admin/media-backfill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start' }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Could not start backfill');
      setBackfillProgress(json.progress);
      if (json.progress?.total === 0) {
        toast.success('Nothing to backfill — every file already has an R2 mirror.');
      } else {
        toast.success(`Backfill started — mirroring ${json.progress.total} existing file(s) to R2 in the background.`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not start backfill');
    } finally {
      setBackfillStarting(false);
    }
  };

  const onResetBackfill = async () => {
    try {
      const res = await fetch('/api/admin/media-backfill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset' }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Could not reset backfill status');
      setBackfillProgress(json.progress);
      toast.success('Backfill status reset. No files were changed — this only clears the progress counter.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not reset backfill status');
    }
  };

  // ---------------------------------------------------------------------
  // Responsive Images toggle. OFF (default) = every image resolves to its
  // original URL, exactly like before this feature existed. ON = smaller
  // -sm/-md variants get requested for smaller widths. Safe to flip at
  // any time — see app/media/[...path]/route.ts for why a missing
  // variant can never show a broken image.
  // ---------------------------------------------------------------------
  const onToggleResponsiveImages = async (checked: boolean) => {
    if (!responsiveImagesForm) return;
    const next = { ...responsiveImagesForm, enabled: checked };
    setResponsiveImagesForm(next); // update immediately so the switch feels responsive
    setSavingResponsiveImages(true);
    try {
      await saveResponsiveImagesSettings(next);
      toast.success(
        checked
          ? 'Responsive images ON — smaller sizes will be served where available. Existing images without a size yet keep working at full size, never broken.'
          : 'Responsive images OFF — every image serves from its original URL, exactly as before.'
      );
    } catch (err) {
      setResponsiveImagesForm(responsiveImagesForm); // revert the switch on failure
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSavingResponsiveImages(false);
    }
  };

  // ---------------------------------------------------------------------
  // AVIF Format Negotiation kill-switch. ON (default) = smaller AVIF
  // files get served instead of WebP to browsers that support it (bots
  // and feed-fetchers like Google Merchant Center / Pinterest are always
  // excluded, on or off — they only ever see WebP). OFF = every image
  // reverts to plain WebP for everyone, immediately (Cloudflare cache is
  // purged on save) — this is the emergency switch if a product image
  // ever gets flagged/disapproved somewhere for a possibly-AVIF-related
  // reason.
  // ---------------------------------------------------------------------
  const onToggleAvifNegotiation = async (checked: boolean) => {
    if (!avifNegotiationForm) return;
    const next = { ...avifNegotiationForm, enabled: checked };
    setAvifNegotiationForm(next); // update immediately so the switch feels responsive
    setSavingAvifNegotiation(true);
    try {
      const result = await saveAvifNegotiationSettings(next);
      if (result.cloudflare_purge.attempted && result.cloudflare_purge.ok) {
        toast.success(
          checked
            ? 'AVIF ON — smaller AVIF images will be served to supporting browsers. Cloudflare cache cleared, takes effect immediately.'
            : 'AVIF OFF — every image reverts to plain WebP for everyone. Cloudflare cache cleared, takes effect immediately.'
        );
      } else {
        toast.success(
          checked
            ? 'AVIF ON — smaller AVIF images will be served to supporting browsers (new/uncached images right away; Cloudflare purge not configured, so already-cached images catch up as their cache expires).'
            : 'AVIF OFF — every image reverts to plain WebP for everyone (new/uncached images right away; Cloudflare purge not configured, so already-cached images catch up as their cache expires).'
        );
      }
    } catch (err) {
      setAvifNegotiationForm(avifNegotiationForm); // revert the switch on failure
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSavingAvifNegotiation(false);
    }
  };

  // ---------------------------------------------------------------------
  // Blur Placeholder toggles — two independent switches:
  //   shimmer_enabled: ON (default) = every product-gallery photo shows
  //     a soft shimmer while loading (whenever no real preview is being
  //     shown for it), instead of a blank/white box. Generic placeholder
  //     (not per-photo), so it needs no backfill — flipping it applies to
  //     every image immediately, old or new.
  //   real_preview_enabled: ON (default) = wherever a real per-image
  //     preview has already been generated (see the backfill below), the
  //     storefront actually shows it instead of the shimmer. Turning this
  //     off doesn't stop generation, only display.
  // ---------------------------------------------------------------------
  const onToggleBlurShimmer = async (checked: boolean) => {
    if (!blurPlaceholderForm) return;
    const next = { ...blurPlaceholderForm, shimmer_enabled: checked };
    setBlurPlaceholderForm(next); // update immediately so the switch feels responsive
    setSavingBlurPlaceholder(true);
    try {
      await saveBlurPlaceholderSettings(next);
      toast.success(
        checked
          ? 'Shimmer placeholder ON — product photos with no real preview show a soft shimmer while loading, on every image immediately (no backfill needed).'
          : 'Shimmer placeholder OFF — photos with no real preview show no placeholder while loading, exactly as before.'
      );
    } catch (err) {
      setBlurPlaceholderForm(blurPlaceholderForm); // revert the switch on failure
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSavingBlurPlaceholder(false);
    }
  };

  const onToggleBlurRealPreview = async (checked: boolean) => {
    if (!blurPlaceholderForm) return;
    const next = { ...blurPlaceholderForm, real_preview_enabled: checked };
    setBlurPlaceholderForm(next);
    setSavingBlurPlaceholder(true);
    try {
      await saveBlurPlaceholderSettings(next);
      toast.success(
        checked
          ? 'Real photo previews ON — wherever a real preview has been generated, it\u2019s now shown instead of the generic shimmer.'
          : 'Real photo previews OFF — generation keeps running, but the storefront no longer displays them (falls back to shimmer).'
      );
    } catch (err) {
      setBlurPlaceholderForm(blurPlaceholderForm);
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSavingBlurPlaceholder(false);
    }
  };

  // ---------------------------------------------------------------------
  // Generate Responsive Image Sizes — backfill -sm/-md variants for
  // pre-existing product/review images. Read-only on originals (only
  // ever adds new files alongside them), idempotent, safe to re-run.
  // ---------------------------------------------------------------------
  useEffect(() => {
    if (resizeBackfillProgress?.status !== 'running') return;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch('/api/admin/image-resize-backfill', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'run-batch' }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || 'Resize backfill batch failed');
        setResizeBackfillProgress(json.progress);
        if (json.progress?.status === 'done') {
          toast.success(
            `Resize backfill complete — ${json.progress.generated} variant file(s) generated, ${json.progress.failed} failed. No original image was touched or deleted.`
          );
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Resize backfill batch failed — will retry');
      }
    }, 1500);
    return () => clearTimeout(timer);
  }, [resizeBackfillProgress]);

  const onStartResizeBackfill = async () => {
    setResizeBackfillStarting(true);
    try {
      const res = await fetch('/api/admin/image-resize-backfill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start' }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Could not start resize backfill');
      setResizeBackfillProgress(json.progress);
      if (json.progress?.total === 0) {
        toast.success('Nothing to do — every existing image already has both sizes.');
      } else {
        toast.success(`Started — generating sizes for ${json.progress.total} existing image(s) in the background.`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not start resize backfill');
    } finally {
      setResizeBackfillStarting(false);
    }
  };

  const onResetResizeBackfill = async () => {
    try {
      const res = await fetch('/api/admin/image-resize-backfill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset' }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Could not reset resize backfill status');
      setResizeBackfillProgress(json.progress);
      toast.success('Resize backfill status reset. No files were changed — this only clears the progress counter.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not reset resize backfill status');
    }
  };

  // ---------------------------------------------------------------------
  // Generate Real Photo Previews — backfill real per-image LQIP blur
  // previews for pre-existing product/variant images (Part 1 of the
  // real-blur feature: lib/blur-preview-backfill.ts). Optional — the
  // generic shimmer above already covers every image with no backfill
  // needed; this only upgrades old photos to their own sharper-looking
  // preview. Only ever adds rows to the independent image_blur_previews
  // table, idempotent, safe to re-run.
  // ---------------------------------------------------------------------
  useEffect(() => {
    if (blurBackfillProgress?.status !== 'running') return;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch('/api/admin/blur-preview-backfill', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'run-batch' }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || 'Blur preview backfill batch failed');
        setBlurBackfillProgress(json.progress);
        if (json.progress?.status === 'done') {
          toast.success(
            `Real photo preview backfill complete — ${json.progress.generated} preview(s) generated, ${json.progress.failed} failed.`
          );
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Blur preview backfill batch failed — will retry');
      }
    }, 1500);
    return () => clearTimeout(timer);
  }, [blurBackfillProgress]);

  const onStartBlurBackfill = async () => {
    setBlurBackfillStarting(true);
    try {
      const res = await fetch('/api/admin/blur-preview-backfill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start' }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Could not start blur preview backfill');
      setBlurBackfillProgress(json.progress);
      if (json.progress?.total === 0) {
        toast.success('Nothing to do — every existing image already has a real preview.');
      } else {
        toast.success(`Started — generating real previews for ${json.progress.total} existing image(s) in the background.`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not start blur preview backfill');
    } finally {
      setBlurBackfillStarting(false);
    }
  };

  const onResetBlurBackfill = async () => {
    try {
      const res = await fetch('/api/admin/blur-preview-backfill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset' }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Could not reset blur preview backfill status');
      setBlurBackfillProgress(json.progress);
      toast.success('Real photo preview backfill status reset. No previews were deleted — this only clears the progress counter.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not reset blur preview backfill status');
    }
  };


  const onToggleOrderNotif = async (checked: boolean) => {
    if (!orderNotifForm) return;
    const next = { ...orderNotifForm, enabled: checked };
    setOrderNotifForm(next);
    setSavingOrderNotif(true);
    try {
      await saveOrderNotificationSettings(next);
      toast.success(checked ? 'New-order email alerts turned on' : 'New-order email alerts turned off');
    } catch (err) {
      setOrderNotifForm(orderNotifForm);
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSavingOrderNotif(false);
    }
  };

  const onSubmitOrderNotif = async (e: FormEvent) => {
    e.preventDefault();
    if (!orderNotifForm) return;
    setSavingOrderNotif(true);
    try {
      await saveOrderNotificationSettings(orderNotifForm);
      toast.success('Order notification email saved');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSavingOrderNotif(false);
    }
  };

  const onSubmitHandlingFee = async (e: FormEvent) => {
    e.preventDefault();
    if (!handlingFeeForm) return;
    setSavingHandlingFee(true);
    try {
      await saveHandlingFeeSettings(handlingFeeForm);
      toast.success('Vendor commission settings saved');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSavingHandlingFee(false);
    }
  };

  const onTestImageSearchAi = async () => {
    setTestingImageSearchAi(true);
    setImageSearchAiTestResult(null);
    try {
      const res = await fetch('/api/admin/image-search-ai-test', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      setImageSearchAiTestResult(data);
      if (!data.keyPresent) {
        toast.error('NVIDIA_API_KEY is missing on this deployment');
      } else if (data.results?.every((r: any) => r.ok)) {
        toast.success('AI connection is working');
      } else {
        toast.error('AI connection test found a problem — see details below');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Test failed');
    } finally {
      setTestingImageSearchAi(false);
    }
  };

  const onTestAiChat = async () => {
    setTestingAiChat(true);
    setAiTestResult(null);
    try {
      const res = await fetch('/api/admin/ai-chat-test', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      setAiTestResult(data);
      if (!data.keyPresent) {
        toast.error('NVIDIA_API_KEY is missing on this deployment');
      } else if (data.results?.every((r: any) => r.ok)) {
        toast.success('AI connection is working');
      } else {
        toast.error('AI connection test found a problem — see details below');
      }
    } catch (err) {
      toast.error('Could not run the test');
      setAiTestResult({ keyPresent: null, results: [], summary: 'Request to /api/admin/ai-chat-test failed.' });
    } finally {
      setTestingAiChat(false);
    }
  };

  const onSubmitEmail = async (e: FormEvent) => {
    e.preventDefault();
    if (!emailForm) return;
    setSavingEmail(true);
    try {
      const res = await fetch('/api/admin/settings/email', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(emailForm),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Save failed');
      toast.success('Email settings saved');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSavingEmail(false);
    }
  };

  const saveBanner = async (next: SiteBanner) => {
    setBannerForm(next);
    setSavingBanner(true);
    try {
      await saveSiteBanner(next);
      toast.success('Site banner saved');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSavingBanner(false);
    }
  };

  const onUploadBanner = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !bannerForm) return;
    setUploadingBanner(true);
    try {
      const url = await uploadProductImage(file);
      await saveBanner({ ...bannerForm, image_url: url });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Banner upload failed');
    } finally {
      setUploadingBanner(false);
      e.target.value = '';
    }
  };

  const removeBanner = () => {
    if (!bannerForm) return;
    saveBanner({ ...bannerForm, image_url: '' });
  };

  const runWebpConversion = async () => {
    setWebpRunning(true);
    setWebpDone(false);
    setWebpStats({ total: 0, converted: 0, skipped: 0, alreadyOptimal: 0, remaining: 0 });
    const excludeUrls: string[] = [];
    let convertedTotal = 0;
    let skippedTotal = 0;
    let alreadyOptimalTotal = 0;
    let firstTotal: number | null = null;

    try {
      // Keeps calling the batch endpoint until it reports `done`. Each call
      // converts a handful of images server-side (sharp can't run in the
      // browser) and reports back what it did, so the counters below update
      // live instead of the button just spinning with no feedback.
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const res = await fetch('/api/admin/convert-images-webp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ excludeUrls }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || 'Conversion batch failed');

        if (firstTotal === null) firstTotal = data.totalRemainingBeforeBatch ?? 0;
        convertedTotal += data.converted ?? 0;
        skippedTotal += data.skipped ?? 0;
        alreadyOptimalTotal += data.alreadyOptimal ?? 0;
        excludeUrls.push(...((data.attemptedUrls as string[]) ?? []));

        setWebpStats({
          total: firstTotal ?? 0,
          converted: convertedTotal,
          skipped: skippedTotal,
          alreadyOptimal: alreadyOptimalTotal,
          remaining: data.remainingAfterBatch ?? 0,
        });

        if (data.done) break;
      }
      setWebpDone(true);
      if (convertedTotal === 0 && skippedTotal === 0) {
        toast.success('Nothing to convert — every image is already optimized');
      } else {
        toast.success(`Done — ${convertedTotal} resized/converted, ${alreadyOptimalTotal} already optimal, ${skippedTotal} failed`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Conversion failed');
    } finally {
      setWebpRunning(false);
    }
  };

  const onSendTestEmail = async () => {
    if (!testEmailTo.trim()) {
      toast.error('Enter an email address to send the test to');
      return;
    }
    setSendingTest(true);
    try {
      const res = await fetch('/api/admin/settings/test-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: testEmailTo.trim() }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success('Test email sent — check the inbox (and spam folder)');
      } else {
        if (body.details) console.error('[test-email] provider details:', body.details);
        toast.error(body.error || 'Failed to send test email');
      }
    } catch {
      toast.error('Failed to send test email');
    } finally {
      setSendingTest(false);
    }
  };

  if (loading || !form) {
    return <p className="py-8 text-sm text-muted-foreground">Loading…</p>;
  }

  return (
    <div>
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-secondary">Admin</p>
        <h1 className="mt-1 font-serif text-3xl font-bold text-primary sm:text-4xl">Store Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          This info appears on GST invoices and customer-facing pages — no code or SQL needed.
        </p>
      </div>

      <form
        onSubmit={onSubmit}
        className="grid max-w-xl gap-4 rounded-lg border border-border/60 bg-card p-5"
      >
        <div className="grid gap-1.5">
          <Label htmlFor="store-name">Store name</Label>
          <Input
            id="store-name"
            value={form.name}
            onChange={(e) => setForm((f) => f && { ...f, name: e.target.value })}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="store-address">Store address</Label>
          <Textarea
            id="store-address"
            rows={2}
            value={form.address}
            onChange={(e) => setForm((f) => f && { ...f, address: e.target.value })}
            placeholder="Shop no., street, city, state, PIN"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="store-gstin">GSTIN</Label>
          <Input
            id="store-gstin"
            value={form.gstin}
            onChange={(e) => setForm((f) => f && { ...f, gstin: e.target.value.toUpperCase() })}
            placeholder="27ABCDE1234F1Z5"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="store-email">Support email</Label>
            <Input
              id="store-email"
              type="email"
              value={form.support_email}
              onChange={(e) => setForm((f) => f && { ...f, support_email: e.target.value })}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="store-phone">Support phone</Label>
            <Input
              id="store-phone"
              value={form.support_phone}
              onChange={(e) => setForm((f) => f && { ...f, support_phone: e.target.value })}
            />
          </div>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="store-whatsapp">WhatsApp number (optional)</Label>
          <Input
            id="store-whatsapp"
            value={form.whatsapp_number ?? ''}
            onChange={(e) => setForm((f) => f && { ...f, whatsapp_number: e.target.value })}
          />
        </div>
        <Button type="submit" disabled={saving} className="mt-2 w-fit bg-primary">
          <Save className="mr-1.5 h-4 w-4" /> {saving ? 'Saving…' : 'Save Settings'}
        </Button>
      </form>

      <div className="mt-8">
        <h2 className="font-serif text-2xl font-bold text-primary">About Us Page Content</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Edits the story, values and process steps shown on the public /about page.
          Address, GSTIN, email and phone shown there come from Store Settings above,
          not from here.
        </p>
      </div>

      {!aboutForm ? (
        <p className="py-4 text-sm text-muted-foreground">Loading…</p>
      ) : (
        <form
          onSubmit={onSubmitAbout}
          className="mt-4 grid max-w-2xl gap-4 rounded-lg border border-border/60 bg-card p-5"
        >
          <div className="grid gap-1.5">
            <Label htmlFor="about-hero-heading">Hero heading</Label>
            <Textarea
              id="about-hero-heading"
              rows={2}
              value={aboutForm.hero_heading}
              onChange={(e) => setAboutForm((f) => f && { ...f, hero_heading: e.target.value })}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="about-hero-subtext">Hero subtext</Label>
            <Textarea
              id="about-hero-subtext"
              rows={2}
              value={aboutForm.hero_subtext}
              onChange={(e) => setAboutForm((f) => f && { ...f, hero_subtext: e.target.value })}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="about-story-1">Story — paragraph 1</Label>
            <Textarea
              id="about-story-1"
              rows={3}
              value={aboutForm.story_paragraph_1}
              onChange={(e) => setAboutForm((f) => f && { ...f, story_paragraph_1: e.target.value })}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="about-story-2">Story — paragraph 2</Label>
            <Textarea
              id="about-story-2"
              rows={3}
              value={aboutForm.story_paragraph_2}
              onChange={(e) => setAboutForm((f) => f && { ...f, story_paragraph_2: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              Links to the refund policy and contact page are appended automatically after this text.
            </p>
          </div>

          <div className="mt-2 border-t border-border/60 pt-4">
            <p className="text-sm font-medium">Values (4 cards — icons are fixed, only text is editable)</p>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              {aboutForm.values.map((v, i) => (
                <div key={i} className="grid gap-1.5 rounded-md border border-border/60 p-3">
                  <Label htmlFor={`about-value-title-${i}`}>Title {i + 1}</Label>
                  <Input
                    id={`about-value-title-${i}`}
                    value={v.title}
                    onChange={(e) => updateAboutValue(i, 'title', e.target.value)}
                  />
                  <Label htmlFor={`about-value-body-${i}`}>Body {i + 1}</Label>
                  <Textarea
                    id={`about-value-body-${i}`}
                    rows={2}
                    value={v.body}
                    onChange={(e) => updateAboutValue(i, 'body', e.target.value)}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="mt-2 border-t border-border/60 pt-4">
            <p className="text-sm font-medium">
              Process steps (4 steps — step numbers &amp; icons are fixed, only text is editable)
            </p>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              {aboutForm.process_steps.map((s, i) => (
                <div key={i} className="grid gap-1.5 rounded-md border border-border/60 p-3">
                  <Label htmlFor={`about-step-title-${i}`}>Step {i + 1} title</Label>
                  <Input
                    id={`about-step-title-${i}`}
                    value={s.title}
                    onChange={(e) => updateAboutStep(i, 'title', e.target.value)}
                  />
                  <Label htmlFor={`about-step-body-${i}`}>Step {i + 1} body</Label>
                  <Textarea
                    id={`about-step-body-${i}`}
                    rows={2}
                    value={s.body}
                    onChange={(e) => updateAboutStep(i, 'body', e.target.value)}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={savingAbout} className="w-fit bg-primary">
              <Save className="mr-1.5 h-4 w-4" /> {savingAbout ? 'Saving…' : 'Save About Us Content'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setAboutForm(DEFAULT_ABOUT_CONTENT)}
            >
              Reset to default text
            </Button>
          </div>
        </form>
      )}

      <div className="mt-8">
        <h2 className="font-serif text-2xl font-bold text-primary">Social Media Links</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Paste the full profile link for each platform you use. Leave any field blank
          to hide that icon on the storefront footer — no code needed.
        </p>
      </div>

      {!socialForm ? (
        <p className="py-4 text-sm text-muted-foreground">Loading…</p>
      ) : (
        <form
          onSubmit={onSubmitSocial}
          className="mt-4 grid max-w-xl gap-4 rounded-lg border border-border/60 bg-card p-5"
        >
          <div className="grid gap-1.5">
            <Label htmlFor="social-instagram">Instagram</Label>
            <Input
              id="social-instagram"
              value={socialForm.instagram}
              onChange={(e) => setSocialForm((f) => f && { ...f, instagram: e.target.value })}
              placeholder="https://instagram.com/aruhihandlooms"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="social-facebook">Facebook</Label>
            <Input
              id="social-facebook"
              value={socialForm.facebook}
              onChange={(e) => setSocialForm((f) => f && { ...f, facebook: e.target.value })}
              placeholder="https://facebook.com/aruhihandlooms"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="social-youtube">YouTube</Label>
            <Input
              id="social-youtube"
              value={socialForm.youtube}
              onChange={(e) => setSocialForm((f) => f && { ...f, youtube: e.target.value })}
              placeholder="https://youtube.com/@aruhihandlooms"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="social-twitter">Twitter / X</Label>
            <Input
              id="social-twitter"
              value={socialForm.twitter}
              onChange={(e) => setSocialForm((f) => f && { ...f, twitter: e.target.value })}
              placeholder="https://x.com/aruhihandlooms"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="social-linkedin">LinkedIn</Label>
            <Input
              id="social-linkedin"
              value={socialForm.linkedin}
              onChange={(e) => setSocialForm((f) => f && { ...f, linkedin: e.target.value })}
              placeholder="https://linkedin.com/company/aruhihandlooms"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="social-whatsapp">WhatsApp</Label>
            <Input
              id="social-whatsapp"
              value={socialForm.whatsapp}
              onChange={(e) => setSocialForm((f) => f && { ...f, whatsapp: e.target.value })}
              placeholder="https://wa.me/918001234567"
            />
          </div>
          <Button type="submit" disabled={savingSocial} className="mt-2 w-fit bg-primary">
            <Save className="mr-1.5 h-4 w-4" /> {savingSocial ? 'Saving…' : 'Save Social Links'}
          </Button>
        </form>
      )}

      <div className="mt-8">
        <h2 className="font-serif text-2xl font-bold text-primary">Site Banner</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          A promotional image shown at the top of every page except checkout. The toggles
          below only control the home page and product pages — every other page (shop,
          categories, etc.) always shows it whenever an image is set.
        </p>
      </div>

      {!bannerForm ? (
        <p className="py-4 text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="mt-4 grid max-w-xl gap-4 rounded-lg border border-border/60 bg-card p-5">
          <div className="grid gap-1.5">
            <Label>Banner image</Label>
            {bannerForm.image_url ? (
              <div className="flex items-center gap-3">
                <div className="relative h-16 w-32 shrink-0 overflow-hidden rounded-md border border-border bg-muted">
                  <Image
                    src={bannerForm.image_url}
                    alt="Site banner preview"
                    fill
                    sizes="128px"
                    className="object-cover"
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={removeBanner}
                  disabled={savingBanner}
                  className="gap-1.5 text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Remove banner
                </Button>
              </div>
            ) : (
              <label className="flex w-fit cursor-pointer items-center gap-2 rounded-md border border-dashed border-border bg-muted/40 px-4 py-2 text-sm hover:border-primary/50">
                {uploadingBanner ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                <span>{uploadingBanner ? 'Uploading…' : 'Upload banner image'}</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={onUploadBanner}
                  disabled={uploadingBanner}
                />
              </label>
            )}
            <p className="text-xs text-muted-foreground">
              Wide images work best (e.g. 1600×400). Use the toggles below to control where it
              shows. Remove it and the banner disappears everywhere, regardless of the toggles.
            </p>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="banner-link">Link (optional)</Label>
            <Input
              id="banner-link"
              value={bannerForm.link_url ?? ''}
              onChange={(e) => setBannerForm((f) => f && { ...f, link_url: e.target.value })}
              onBlur={() => bannerForm && saveBanner(bannerForm)}
              placeholder="/shop?category=Bridal"
            />
            <p className="text-xs text-muted-foreground">
              Where the banner takes people if they click it. Leave blank for a non-clickable banner.
            </p>
          </div>
          <div className="flex items-center justify-between gap-4 border-t border-border/60 pt-4">
            <div>
              <Label htmlFor="banner-show-home">Show on home page</Label>
              <p className="text-xs text-muted-foreground">
                Banner appears at the top of the home page only when this is on.
              </p>
            </div>
            <Switch
              id="banner-show-home"
              checked={!!bannerForm.show_on_home}
              onCheckedChange={(checked) => saveBanner({ ...bannerForm, show_on_home: checked })}
              disabled={savingBanner}
            />
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="banner-show-product">Show on product page</Label>
              <p className="text-xs text-muted-foreground">
                Banner appears at the top of individual product pages only when this is on.
              </p>
            </div>
            <Switch
              id="banner-show-product"
              checked={!!bannerForm.show_on_product}
              onCheckedChange={(checked) => saveBanner({ ...bannerForm, show_on_product: checked })}
              disabled={savingBanner}
            />
          </div>
        </div>
      )}

      <div className="mt-8">
        <h2 className="font-serif text-2xl font-bold text-primary">Bulk Image Optimization</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Converts every product and variant image to WebP and resizes anything wider than 1600px
          down to fit — including images that are already WebP but were uploaded before this size
          cap existed, which is why some product photos can be 300-600kB+ today. Also gives each
          file a descriptive filename (product/colour name instead of a random hash) for better
          image SEO. Old files are deleted after each one converts successfully. Each image's{' '}
          <span className="italic">alt</span> text is already generated automatically from the
          product's name, fabric and category wherever it's shown — there's nothing separate to
          fix there.
        </p>
      </div>

      <div className="mt-4 grid max-w-xl gap-3 rounded-lg border border-border/60 bg-card p-5">
        <Button
          type="button"
          onClick={runWebpConversion}
          disabled={webpRunning}
          className="w-fit gap-1.5"
        >
          {webpRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {webpRunning
            ? 'Converting…'
            : webpDone
              ? 'Run again'
              : 'Optimize all images'}
        </Button>

        {(webpRunning || webpDone) && (
          <div className="grid gap-2">
            {webpStats.total > 0 && (
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary transition-all"
                  style={{
                    width: `${Math.min(
                      100,
                      Math.round(
                        ((webpStats.converted + webpStats.skipped + webpStats.alreadyOptimal) /
                          webpStats.total) *
                          100
                      )
                    )}%`,
                  }}
                />
              </div>
            )}
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
              <span>
                Found: <span className="font-medium text-foreground">{webpStats.total}</span>
              </span>
              <span>
                Resized/converted:{' '}
                <span className="font-medium text-green-600">{webpStats.converted}</span>
              </span>
              <span>
                Already optimal:{' '}
                <span className="font-medium text-foreground">{webpStats.alreadyOptimal}</span>
              </span>
              <span>
                Failed: <span className="font-medium text-amber-600">{webpStats.skipped}</span>
              </span>
              {webpRunning && (
                <span>
                  Remaining: <span className="font-medium text-foreground">{webpStats.remaining}</span>
                </span>
              )}
            </div>
            {webpDone && webpStats.skipped > 0 && (
              <p className="text-xs text-muted-foreground">
                Failed images couldn't be downloaded or converted (check server logs for details)
                — they were left untouched, nothing was lost.
              </p>
            )}
          </div>
        )}
      </div>

      <div className="mt-8">
        <h2 className="font-serif text-2xl font-bold text-primary">GST & Shipping</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Controls the tax rate and shipping fee applied at checkout storewide. This is what the
          CUSTOMER sees and pays — nothing here affects the Profit Estimate box below.
        </p>
      </div>

      {!checkoutForm ? (
        <p className="py-4 text-sm text-muted-foreground">Loading…</p>
      ) : (
        <form
          onSubmit={onSubmitCheckout}
          className="mt-4 grid max-w-xl gap-4 rounded-lg border border-border/60 bg-card p-5"
        >
          <div className="grid gap-1.5">
            <Label htmlFor="gst-rate">GST rate (%)</Label>
            <Input
              id="gst-rate"
              type="number"
              min={0}
              max={100}
              step="0.01"
              value={checkoutForm.gst_rate_percent}
              onChange={(e) =>
                setCheckoutForm(
                  (f) => f && { ...f, gst_rate_percent: Number(e.target.value) }
                )
              }
            />
            <p className="text-xs text-muted-foreground">
              Applied to the discounted subtotal at checkout, e.g. 5 = 5% GST.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="shipping-fee">Shipping fee shown to customer (₹)</Label>
              <Input
                id="shipping-fee"
                type="number"
                min={0}
                step="1"
                value={checkoutForm.flat_rate}
                onChange={(e) =>
                  setCheckoutForm(
                    (f) => f && { ...f, flat_rate: Number(e.target.value) }
                  )
                }
              />
              <p className="text-xs text-muted-foreground">
                What appears on cart/checkout. Set to 0 for storewide free shipping — this does
                NOT affect the Profit Estimate box below, which uses your real courier cost instead.
              </p>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="free-shipping-threshold">Free shipping above (₹)</Label>
              <Input
                id="free-shipping-threshold"
                type="number"
                min={0}
                step="1"
                value={checkoutForm.free_shipping_threshold}
                onChange={(e) =>
                  setCheckoutForm(
                    (f) => f && { ...f, free_shipping_threshold: Number(e.target.value) }
                  )
                }
              />
              <p className="text-xs text-muted-foreground">
                Set to 0 to always charge the shipping fee.
              </p>
            </div>
          </div>
          <Button type="submit" disabled={savingCheckout} className="mt-2 w-fit bg-primary">
            <Save className="mr-1.5 h-4 w-4" />{' '}
            {savingCheckout ? 'Saving…' : 'Save GST & Shipping'}
          </Button>
        </form>
      )}

      <div className="mt-8">
        <h2 className="font-serif text-2xl font-bold text-primary">Online Payment Discount</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          An extra % off applied automatically when a customer pays online instead of COD. Shown
          as a badge on the product page and cart drawer, and applied to the total the moment
          "Pay online" is selected at checkout.
        </p>
        <p className="mt-2 max-w-xl rounded-md border border-amber-300/60 bg-amber-50 p-3 text-xs text-amber-900">
          Google Merchant Center note: discounts restricted to one payment method aren't allowed
          as a formal "Promotion" in the Shopping feed (outside Brazil). This stays an on-site,
          checkout-time incentive only — it is never sent to Merchant Center as a promotion, and
          your product feed / structured data keep showing the standard price, so this won't
          create a policy or price-accuracy issue.
        </p>
      </div>

      {!paymentDiscountForm ? (
        <p className="py-4 text-sm text-muted-foreground">Loading…</p>
      ) : (
        <form
          onSubmit={onSubmitPaymentDiscount}
          className="mt-4 grid max-w-xl gap-4 rounded-lg border border-border/60 bg-card p-5"
        >
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="payment-discount-enabled">Enable online payment discount</Label>
              <p className="text-xs text-muted-foreground">
                Turn off to stop showing/applying it anywhere, without losing your saved %.
              </p>
            </div>
            <Switch
              id="payment-discount-enabled"
              checked={paymentDiscountForm.enabled}
              onCheckedChange={(checked) =>
                setPaymentDiscountForm((f) => f && { ...f, enabled: checked })
              }
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="payment-discount-percent">Discount (%)</Label>
            <Input
              id="payment-discount-percent"
              type="number"
              min={0}
              max={100}
              step="0.5"
              value={paymentDiscountForm.percent}
              onChange={(e) =>
                setPaymentDiscountForm(
                  (f) => f && { ...f, percent: Number(e.target.value) }
                )
              }
            />
            <p className="text-xs text-muted-foreground">
              Applied to the order subtotal (after coupon/gift card/loyalty, before shipping) only
              when the customer chooses to pay online.
            </p>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="payment-discount-label">Customer-facing label</Label>
            <Input
              id="payment-discount-label"
              value={paymentDiscountForm.label}
              onChange={(e) =>
                setPaymentDiscountForm((f) => f && { ...f, label: e.target.value })
              }
              placeholder="online payment"
            />
            <p className="text-xs text-muted-foreground">
              Shown as: "Get {paymentDiscountForm.percent || 0}% off on {paymentDiscountForm.label || 'online payment'}".
            </p>
          </div>
          <Button type="submit" disabled={savingPaymentDiscount} className="mt-2 w-fit bg-primary">
            <Save className="mr-1.5 h-4 w-4" />{' '}
            {savingPaymentDiscount ? 'Saving…' : 'Save Payment Discount'}
          </Button>
        </form>
      )}

      <div className="mt-8">
        <h2 className="font-serif text-2xl font-bold text-primary">Partial Pay (Advance + Pay on Delivery)</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Customer pays a part of the order online now (Razorpay) and the rest to the courier on
          delivery. Delhivery is told to collect only the balance. No online-payment discount is
          given on Partial Pay orders.
        </p>
      </div>

      {!partialPayForm ? (
        <p className="py-4 text-sm text-muted-foreground">Loading…</p>
      ) : (
        <form
          onSubmit={onSubmitPartialPay}
          className="mt-4 grid max-w-xl gap-4 rounded-lg border border-border/60 bg-card p-5"
        >
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="partial-pay-enabled">Enable Partial Pay at checkout</Label>
              <p className="text-xs text-muted-foreground">
                Turn off to hide it from checkout. Orders already placed with it are not affected.
              </p>
            </div>
            <Switch
              id="partial-pay-enabled"
              checked={partialPayForm.enabled}
              onCheckedChange={(checked) => setPartialPayForm((f) => f && { ...f, enabled: checked })}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="partial-pay-percent">Advance to collect online (%)</Label>
            <Input
              id="partial-pay-percent"
              type="number"
              min={1}
              max={99}
              step="1"
              value={partialPayForm.percent}
              onChange={(e) => setPartialPayForm((f) => f && { ...f, percent: Number(e.target.value) })}
            />
            <p className="text-xs text-muted-foreground">
              Example: on a ₹1,000 order, {partialPayForm.percent || 0}% = ₹
              {computeAdvance(1000, partialPayForm.percent || 50).advance} now and ₹
              {computeAdvance(1000, partialPayForm.percent || 50).balance} on delivery.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="partial-pay-min">Minimum order (₹)</Label>
              <Input
                id="partial-pay-min"
                type="number"
                min={0}
                value={partialPayForm.min_order_value}
                onChange={(e) => setPartialPayForm((f) => f && { ...f, min_order_value: Number(e.target.value) })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="partial-pay-max">Maximum order (₹)</Label>
              <Input
                id="partial-pay-max"
                type="number"
                min={0}
                value={partialPayForm.max_order_value}
                onChange={(e) => setPartialPayForm((f) => f && { ...f, max_order_value: Number(e.target.value) })}
              />
            </div>
          </div>
          <p className="-mt-2 text-xs text-muted-foreground">
            Only offer Partial Pay for orders between these values. Leave 0 for no limit.
          </p>
          <div className="grid gap-1.5">
            <Label htmlFor="partial-pay-label">Customer-facing title</Label>
            <Input
              id="partial-pay-label"
              value={partialPayForm.label}
              maxLength={40}
              onChange={(e) => setPartialPayForm((f) => f && { ...f, label: e.target.value })}
              placeholder="Partial Pay"
            />
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="partial-pay-refund">Refund the advance if the customer cancels</Label>
              <p className="text-xs text-muted-foreground">
                Applies to self-cancel before dispatch (inside the cancellation window). An order that
                is refused at the door / returned to origin never gets an automatic refund of the
                advance. Keep your Refund &amp; Cancellation Policy page in line with this.
              </p>
            </div>
            <Switch
              id="partial-pay-refund"
              checked={partialPayForm.refund_advance_on_cancel}
              onCheckedChange={(checked) =>
                setPartialPayForm((f) => f && { ...f, refund_advance_on_cancel: checked })
              }
            />
          </div>
          <Button type="submit" disabled={savingPartialPay} className="mt-2 w-fit bg-primary">
            <Save className="mr-1.5 h-4 w-4" /> {savingPartialPay ? 'Saving…' : 'Save Partial Pay'}
          </Button>
        </form>
      )}

      <div className="mt-8">
        <h2 className="font-serif text-2xl font-bold text-primary">Catalog Video Autoplay</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Master switch for the shop/category grid. This decides the DEFAULT state of the
          "Video" toggle shoppers see next to Filters/Sort — they can still flip it for their own
          browsing session either way. Individual products still need "Autoplay video in catalog"
          turned on in Admin &gt; Products before they show a video at all.
        </p>
      </div>

      {!catalogVideoForm ? (
        <p className="py-4 text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="mt-4 flex max-w-xl items-center justify-between gap-4 rounded-lg border border-border/60 bg-card p-5">
          <div>
            <Label htmlFor="catalog-video-default">Autoplay videos by default</Label>
            <p className="text-xs text-muted-foreground">
              On: shoppers see autoplaying video previews unless they switch it off themselves.
              Off: shoppers see still photos unless they switch it on themselves.
            </p>
          </div>
          <Switch
            id="catalog-video-default"
            checked={catalogVideoForm.default_enabled}
            disabled={savingCatalogVideo}
            onCheckedChange={onToggleCatalogVideoDefault}
          />
        </div>
      )}

      <div className="mt-8">
        <h2 className="font-serif text-2xl font-bold text-primary">Catalog Listing Size</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Controls how many product cards load on /shop and category pages, and how many colour
          cards one multi-colour product is allowed to show as separate cards in those grids.
          Lower these if pages feel slow to open — fewer cards means fewer images to load.
        </p>
      </div>

      {!catalogListingForm ? (
        <p className="py-4 text-sm text-muted-foreground">Loading…</p>
      ) : (
        <form
          onSubmit={onSubmitCatalogListing}
          className="mt-4 max-w-xl space-y-4 rounded-lg border border-border/60 bg-card p-5"
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="catalog-page-size">Products per page</Label>
            <p className="text-xs text-muted-foreground">
              How many cards show at first, and how many more load each time a shopper taps
              &quot;Load more&quot;. Lower = faster first load, more clicks to see everything.
            </p>
            <Input
              id="catalog-page-size"
              type="number"
              min={4}
              max={100}
              value={catalogListingForm.page_size}
              onChange={(e) =>
                setCatalogListingForm((f) =>
                  f && { ...f, page_size: Math.max(4, Math.min(100, Number(e.target.value) || 0)) }
                )
              }
              className="w-32"
            />
          </div>

          <div className="flex flex-col gap-2 border-t border-border/60 pt-4">
            <Label htmlFor="catalog-max-variant-cards">Max colour cards per product</Label>
            <p className="text-xs text-muted-foreground">
              A product with 7 colours normally shows 7 separate cards in the grid. Cap that
              here — e.g. 4 shows only its first 4 colours as cards. Set to 0 to turn this off
              entirely and show just one card per product, like before.
            </p>
            <Input
              id="catalog-max-variant-cards"
              type="number"
              min={0}
              max={20}
              value={catalogListingForm.max_variant_cards_per_product}
              onChange={(e) =>
                setCatalogListingForm((f) =>
                  f && {
                    ...f,
                    max_variant_cards_per_product: Math.max(0, Math.min(20, Number(e.target.value) || 0)),
                  }
                )
              }
              className="w-32"
            />
          </div>

          <Button type="submit" disabled={savingCatalogListing} className="mt-2 w-fit bg-primary">
            <Save className="mr-1.5 h-4 w-4" />{' '}
            {savingCatalogListing ? 'Saving…' : 'Save Catalog Listing Size'}
          </Button>
        </form>
      )}

      <div className="mt-8">
        <h2 className="font-serif text-2xl font-bold text-primary">New Order Notifications</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Get an email the moment a new order comes in, so you don't have to keep the admin
          dashboard open to know. Leave the email blank to use your Support Email above.
        </p>
      </div>

      {!orderNotifForm ? (
        <p className="py-4 text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="mt-4 max-w-xl space-y-4 rounded-lg border border-border/60 bg-card p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="order-notif-enabled">
                {orderNotifForm.enabled ? 'Alerts on' : 'Alerts off'}
              </Label>
              <p className="text-xs text-muted-foreground">
                {orderNotifForm.enabled
                  ? 'On: every new order sends you an email notification.'
                  : 'Off: no email is sent to you for new orders (customer still gets their confirmation).'}
              </p>
            </div>
            <Switch
              id="order-notif-enabled"
              checked={orderNotifForm.enabled}
              disabled={savingOrderNotif}
              onCheckedChange={onToggleOrderNotif}
            />
          </div>

          <form onSubmit={onSubmitOrderNotif} className="flex flex-col gap-2 border-t border-border/60 pt-4">
            <Label htmlFor="order-notif-email">Notification email (optional)</Label>
            <div className="flex gap-2">
              <Input
                id="order-notif-email"
                type="email"
                placeholder="you@example.com (defaults to Support Email)"
                value={orderNotifForm.email}
                onChange={(e) => setOrderNotifForm((f) => f && { ...f, email: e.target.value })}
              />
              <Button type="submit" disabled={savingOrderNotif} className="shrink-0 bg-primary">
                <Save className="mr-1.5 h-4 w-4" /> {savingOrderNotif ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </form>
        </div>
      )}

      <div className="mt-8">
        <h2 className="font-serif text-2xl font-bold text-primary">Order Cancellation Refunds</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          When a customer cancels an order they paid for online, this controls whether the refund
          is issued automatically via Razorpay, or left for you to process by hand.
        </p>
      </div>

      {!refundAutomationForm ? (
        <p className="py-4 text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="mt-4 flex max-w-xl items-center justify-between gap-4 rounded-lg border border-border/60 bg-card p-5">
          <div>
            <Label htmlFor="refund-automation-enabled">
              {refundAutomationForm.auto_refund_enabled ? 'Automatic' : 'Manual'} refunds
            </Label>
            <p className="text-xs text-muted-foreground">
              {refundAutomationForm.auto_refund_enabled
                ? 'On: refunds are issued to the customer via Razorpay the moment they cancel — nothing for you to do.'
                : 'Off: the order is still cancelled instantly, but no refund is sent. You\u2019ll need to refund the customer yourself from the Razorpay dashboard or the Orders panel.'}
            </p>
          </div>
          <Switch
            id="refund-automation-enabled"
            checked={refundAutomationForm.auto_refund_enabled}
            disabled={savingRefundAutomation}
            onCheckedChange={onToggleRefundAutomation}
          />
        </div>
      )}

      <div className="mt-8">
        <h2 className="font-serif text-2xl font-bold text-primary">Media Delivery</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Controls how product/blog images and videos are served. Doesn't change any URL on the
          site — only what happens when that URL is requested. Flipping this also purges
          Cloudflare's cache automatically, so it takes effect right away instead of waiting on
          already-cached images to expire.
        </p>
      </div>

      {!mediaDeliveryForm ? (
        <p className="py-4 text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="mt-4 flex max-w-xl items-center justify-between gap-4 rounded-lg border border-border/60 bg-card p-5">
          <div>
            <Label htmlFor="media-delivery-proxy-enabled">
              {mediaDeliveryForm.proxy_enabled
                ? 'Serving from your domain'
                : `Redirecting to ${mediaStorageBackendForm?.backend === 'r2' ? 'R2 (cdn.aruhihandlooms.com)' : 'Supabase'}`}
            </Label>
            <p className="text-xs text-muted-foreground">
              {mediaDeliveryForm.proxy_enabled
                ? 'On (default): images/videos stream through aruhihandlooms.com, so your domain shows everywhere — but every byte counts against your Vercel bandwidth quota.'
                : `Off: aruhihandlooms.com/media links redirect straight to whichever backend is set as preferred below (currently ${mediaStorageBackendForm?.backend === 'r2' ? 'R2 — cdn.aruhihandlooms.com' : 'Supabase'}), so Vercel stops paying the bandwidth cost. Use this if your Vercel Fast Data/Origin Transfer quota is close to running out — switch back on once it resets.`}
            </p>
          </div>
          <Switch
            id="media-delivery-proxy-enabled"
            checked={mediaDeliveryForm.proxy_enabled}
            disabled={savingMediaDelivery}
            onCheckedChange={onToggleMediaDelivery}
          />
        </div>
      )}

      {/* Media Storage — Preferred Backend */}
      <div className="mt-8">
        <h2 className="font-serif text-2xl font-bold text-primary">Media Storage — Preferred Backend</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Every new upload goes to <strong>both</strong> Supabase and Cloudflare R2 automatically
          (dual-write). This toggle only controls which backend is tried <em>first</em> when serving
          files — if the preferred backend is unavailable or returns a 404, the other is tried
          automatically. Switching takes effect immediately (Cloudflare cache is purged on save).
        </p>
        {!r2EnvConfigured && (
          <p className="mt-2 rounded-md border border-yellow-300 bg-yellow-50 px-3 py-2 text-xs text-yellow-800">
            R2 environment variables are not configured (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID,
            R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_URL). Add them in Vercel → Project
            Settings → Environment Variables and redeploy before switching to R2.
          </p>
        )}
      </div>

      {!mediaStorageBackendForm ? (
        <p className="py-4 text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="mt-4 flex max-w-xl items-center justify-between gap-4 rounded-lg border border-border/60 bg-card p-5">
          <div>
            <Label htmlFor="media-storage-backend">
              {mediaStorageBackendForm.backend === 'r2' ? 'Preferred: Cloudflare R2' : 'Preferred: Supabase (default)'}
            </Label>
            <p className="text-xs text-muted-foreground">
              {mediaStorageBackendForm.backend === 'r2'
                ? 'R2 is tried first; if it 404s or errors, Supabase is used automatically. Both always receive new uploads.'
                : 'Supabase is tried first (safe default); R2 is the automatic fallback for dual-written files.'}
            </p>
          </div>
          <Switch
            id="media-storage-backend"
            checked={mediaStorageBackendForm.backend === 'r2'}
            disabled={savingMediaStorageBackend || !r2EnvConfigured}
            onCheckedChange={onToggleMediaStorageBackend}
          />
        </div>
      )}

      {/* R2 Backfill — mirrors pre-existing (pre-dual-write) files into R2 */}
      <div className="mt-6 max-w-xl rounded-lg border border-border/60 bg-card p-5">
        <Label>Backfill Existing Files to R2</Label>
        <p className="mt-1 text-xs text-muted-foreground">
          Files uploaded since dual-write shipped already exist in both Supabase and R2. This
          copies the older, pre-existing files into R2 too — a plain copy, read-only on Supabase.
          <strong> Originals in Supabase are never modified or deleted</strong>, so if R2/Cloudflare
          is ever disabled later, nothing on the live site breaks either way — Supabase remains the
          full, complete copy regardless of whether this backfill has run.
        </p>

        {!r2EnvConfigured && (
          <p className="mt-2 rounded-md border border-yellow-300 bg-yellow-50 px-3 py-2 text-xs text-yellow-800">
            R2 environment variables aren&apos;t configured — backfill can&apos;t start until those
            are added (see the note above).
          </p>
        )}

        {!backfillProgress ? (
          <p className="mt-3 text-sm text-muted-foreground">Loading status…</p>
        ) : (
          <div className="mt-3 space-y-3">
            {backfillProgress.total > 0 && (
              <div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{
                      width: `${Math.min(100, Math.round((backfillProgress.processed / backfillProgress.total) * 100))}%`,
                    }}
                  />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {backfillProgress.processed} / {backfillProgress.total} checked — {backfillProgress.mirrored}{' '}
                  newly copied, {backfillProgress.alreadyMirrored} already had a mirror
                  {backfillProgress.failed > 0 ? `, ${backfillProgress.failed} failed` : ''}.
                </p>
              </div>
            )}

            <p className="text-xs">
              Status:{' '}
              <span className="font-medium">
                {backfillProgress.status === 'idle' && 'Not started'}
                {backfillProgress.status === 'running' && 'Running — mirroring live…'}
                {backfillProgress.status === 'done' && 'Complete'}
                {backfillProgress.status === 'error' && 'Error'}
              </span>
            </p>

            {backfillProgress.recentErrors.length > 0 && (
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer text-yellow-800">
                  {backfillProgress.recentErrors.length} recent error(s) — click to view
                </summary>
                <ul className="mt-1 list-disc pl-4">
                  {backfillProgress.recentErrors.map((e, i) => (
                    <li key={i}>
                      {e.bucket}/{e.path}: {e.error}
                    </li>
                  ))}
                </ul>
              </details>
            )}

            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                disabled={backfillStarting || backfillProgress.status === 'running' || !r2EnvConfigured}
                onClick={onStartBackfill}
              >
                {backfillStarting || backfillProgress.status === 'running' ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                {backfillProgress.status === 'done' ? 'Re-run Backfill' : 'Start Backfill'}
              </Button>
              {backfillProgress.status !== 'idle' && backfillProgress.status !== 'running' && (
                <Button type="button" size="sm" variant="outline" onClick={onResetBackfill}>
                  Reset Status
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Responsive Images — mobile/desktop get right-sized images instead of the full 1600px file */}
      <div className="mt-8">
        <h2 className="font-serif text-2xl font-bold text-primary">Responsive Images</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Serves a smaller image to mobile/desktop product cards instead of the full-size (1600px)
          file, so pages load lighter and faster. Doesn&apos;t touch or delete any existing image —
          only the size requested for display changes. If a size doesn&apos;t exist yet for a given
          image, the original is served automatically instead — this can never show a broken image,
          whether the backfill below has run or not.
        </p>
      </div>

      {!responsiveImagesForm ? (
        <p className="py-4 text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="mt-4 flex max-w-xl items-center justify-between gap-4 rounded-lg border border-border/60 bg-card p-5">
          <div>
            <Label htmlFor="responsive-images-enabled">
              {responsiveImagesForm.enabled ? 'On — serving right-sized images' : 'Off — serving original images (default)'}
            </Label>
            <p className="text-xs text-muted-foreground">
              {responsiveImagesForm.enabled
                ? 'Mobile gets a ~480px image, desktop ~900px, and full zoom still uses the 1600px original. Safe to leave on at any time.'
                : 'Every image serves at its original size, exactly like before this feature existed. Turn on once you\u2019re ready — no risk either way.'}
            </p>
          </div>
          <Switch
            id="responsive-images-enabled"
            checked={responsiveImagesForm.enabled}
            disabled={savingResponsiveImages}
            onCheckedChange={onToggleResponsiveImages}
          />
        </div>
      )}

      {/* AVIF Format Negotiation — kill-switch. Serves a smaller AVIF
          version of .webp images to browsers that support it, via the
          Accept header. Bots/feed-fetchers (Google Merchant Center,
          Pinterest, etc.) always get plain WebP regardless of this
          toggle — see app/media/[...path]/route.ts. Turning this OFF is
          the fastest way to fully revert to pre-AVIF behavior for
          everyone if a product image is ever flagged/disapproved
          anywhere for a possibly-AVIF-related reason. */}
      <div className="mt-8">
        <h2 className="font-serif text-2xl font-bold text-primary">AVIF Format</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Serves an even smaller AVIF version of product images (~20-30% smaller than WebP at the
          same visual quality) to browsers that support it — real browsers only. Google Merchant
          Center, Pinterest, Googlebot, and other feed/crawler traffic always receive the plain
          WebP file, on or off, since Merchant Center doesn&apos;t accept AVIF as an image format.
          If a product image is ever flagged or disapproved anywhere and you suspect this feature,
          switch it off below — every image reverts to plain WebP for everyone immediately, with
          nothing else about your image URLs or files changing.
        </p>
      </div>

      {!avifNegotiationForm ? (
        <p className="py-4 text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="mt-4 flex max-w-xl items-center justify-between gap-4 rounded-lg border border-border/60 bg-card p-5">
          <div>
            <Label htmlFor="avif-negotiation-enabled">
              {avifNegotiationForm.enabled ? 'On — serving AVIF to supporting browsers' : 'Off — serving WebP only (reverted)'}
            </Label>
            <p className="text-xs text-muted-foreground">
              {avifNegotiationForm.enabled
                ? 'Real browsers that support AVIF get the smaller file automatically. Bots/feed-fetchers (Merchant Center, Pinterest, etc.) always get WebP. Safe to leave on.'
                : 'Every image serves as plain WebP for every visitor and every bot — identical to how the site behaved before this feature existed. Use this as an emergency revert.'}
            </p>
          </div>
          <Switch
            id="avif-negotiation-enabled"
            checked={avifNegotiationForm.enabled}
            disabled={savingAvifNegotiation}
            onCheckedChange={onToggleAvifNegotiation}
          />
        </div>
      )}

      {/* Blur Placeholder — two independent switches: a generic shimmer
          while product photos load, and whether an already-generated
          real per-image preview is actually shown when available. */}
      <div className="mt-8">
        <h2 className="font-serif text-2xl font-bold text-primary">Blur Placeholder</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Shows a placeholder on product-gallery photos while they load, instead of a blank/white
          box. These two switches are independent: "Real Photo Previews" decides whether an
          already-generated preview of that exact photo is shown when one exists (see the backfill
          below); "Shimmer Placeholder" decides what's shown otherwise — a real photo without a
          preview yet, or every photo if Real Photo Previews is off.
        </p>
      </div>

      {!blurPlaceholderForm ? (
        <p className="py-4 text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="mt-4 flex max-w-xl flex-col gap-4">
          <div className="flex items-center justify-between gap-4 rounded-lg border border-border/60 bg-card p-5">
            <div>
              <Label htmlFor="blur-real-preview-enabled">
                {blurPlaceholderForm.real_preview_enabled
                  ? 'Real Photo Previews — On (default)'
                  : 'Real Photo Previews — Off'}
              </Label>
              <p className="text-xs text-muted-foreground">
                {blurPlaceholderForm.real_preview_enabled
                  ? "Wherever a real preview of that exact photo has been generated, it's shown while the photo loads instead of the generic shimmer."
                  : "Real previews are still generated by the backfill below, but the storefront won't show them — every photo falls back to the shimmer setting below."}
              </p>
            </div>
            <Switch
              id="blur-real-preview-enabled"
              checked={blurPlaceholderForm.real_preview_enabled}
              disabled={savingBlurPlaceholder}
              onCheckedChange={onToggleBlurRealPreview}
            />
          </div>

          <div className="flex items-center justify-between gap-4 rounded-lg border border-border/60 bg-card p-5">
            <div>
              <Label htmlFor="blur-shimmer-enabled">
                {blurPlaceholderForm.shimmer_enabled
                  ? 'Shimmer Placeholder — On (default)'
                  : 'Shimmer Placeholder — Off'}
              </Label>
              <p className="text-xs text-muted-foreground">
                {blurPlaceholderForm.shimmer_enabled
                  ? 'Any photo without a real preview shown (not backfilled yet, or Real Photo Previews is off above) shows a soft animated shimmer while loading.'
                  : "Photos with no real preview shown show no placeholder while loading — the space stays a plain background colour until the image arrives, exactly like before this feature existed."}
              </p>
            </div>
            <Switch
              id="blur-shimmer-enabled"
              checked={blurPlaceholderForm.shimmer_enabled}
              disabled={savingBlurPlaceholder}
              onCheckedChange={onToggleBlurShimmer}
            />
          </div>
        </div>
      )}

      {/* Generate Real Photo Previews — optional backfill for real per-image
          blur previews (Part 1: lib/blur-preview-backfill.ts). The generic
          shimmer above already covers every image with no backfill needed;
          this only upgrades old photos to their own sharper-looking preview. */}
      <div className="mt-6 max-w-xl rounded-lg border border-border/60 bg-card p-5">
        <Label>Generate Real Photo Previews</Label>
        <p className="mt-1 text-xs text-muted-foreground">
          Optional. The shimmer above already covers every product photo with no backfill
          needed — this generates an actual tiny blurred preview of each specific photo instead,
          for images uploaded <em>before</em> this feature shipped. New uploads/imports already
          get one automatically. Safe to run regardless of either switch above, and safe
          to re-run any time.
        </p>

        {!blurBackfillProgress ? (
          <p className="mt-3 text-sm text-muted-foreground">Loading status…</p>
        ) : (
          <div className="mt-3 space-y-3">
            {blurBackfillProgress.total > 0 && (
              <div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{
                      width: `${Math.min(100, Math.round((blurBackfillProgress.processed / blurBackfillProgress.total) * 100))}%`,
                    }}
                  />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {blurBackfillProgress.processed} / {blurBackfillProgress.total} processed —{' '}
                  {blurBackfillProgress.generated} preview(s) generated
                  {blurBackfillProgress.alreadyDone > 0
                    ? `, ${blurBackfillProgress.alreadyDone} image(s) already had a preview`
                    : ''}
                  {blurBackfillProgress.failed > 0 ? `, ${blurBackfillProgress.failed} failed` : ''}.
                </p>
              </div>
            )}

            <p className="text-xs">
              Status:{' '}
              <span className="font-medium">
                {blurBackfillProgress.status === 'idle' && 'Not started'}
                {blurBackfillProgress.status === 'running' && 'Running — generating previews live…'}
                {blurBackfillProgress.status === 'done' && 'Complete'}
                {blurBackfillProgress.status === 'error' && 'Error'}
              </span>
            </p>

            {blurBackfillProgress.recentErrors.length > 0 && (
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer text-yellow-800">
                  {blurBackfillProgress.recentErrors.length} recent error(s) — click to view
                </summary>
                <ul className="mt-1 list-disc pl-4">
                  {blurBackfillProgress.recentErrors.map((e, i) => (
                    <li key={i}>
                      {e.url}: {e.error}
                    </li>
                  ))}
                </ul>
              </details>
            )}

            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                disabled={blurBackfillStarting || blurBackfillProgress.status === 'running'}
                onClick={onStartBlurBackfill}
              >
                {blurBackfillStarting || blurBackfillProgress.status === 'running' ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                {blurBackfillProgress.status === 'done' ? 'Re-run Backfill' : 'Start Backfill'}
              </Button>
              {blurBackfillProgress.status !== 'idle' && blurBackfillProgress.status !== 'running' && (
                <Button type="button" size="sm" variant="outline" onClick={onResetBlurBackfill}>
                  Reset Status
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Generate Responsive Image Sizes — backfill for pre-existing images */}
      <div className="mt-6 max-w-xl rounded-lg border border-border/60 bg-card p-5">
        <Label>Generate Responsive Image Sizes</Label>
        <p className="mt-1 text-xs text-muted-foreground">
          New image uploads/imports already get all 3 sizes automatically. This generates the
          smaller sizes for images uploaded <em>before</em> that shipped, so they benefit too.
          <strong> Original images are never modified or deleted</strong> — this only adds new,
          smaller files alongside them. Safe to run whether Responsive Images above is on or off,
          and safe to re-run any time. Also generates a smaller AVIF version of each size for
          browsers that support it — safe to re-run for existing images even if you&apos;ve run it
          before; only missing sizes/formats are generated, nothing is regenerated or overwritten.
        </p>

        {!resizeBackfillProgress ? (
          <p className="mt-3 text-sm text-muted-foreground">Loading status…</p>
        ) : (
          <div className="mt-3 space-y-3">
            {resizeBackfillProgress.total > 0 && (
              <div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{
                      width: `${Math.min(100, Math.round((resizeBackfillProgress.processed / resizeBackfillProgress.total) * 100))}%`,
                    }}
                  />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {resizeBackfillProgress.processed} / {resizeBackfillProgress.total} processed —{' '}
                  {resizeBackfillProgress.generated} size(s) generated
                  {resizeBackfillProgress.alreadyDone > 0
                    ? `, ${resizeBackfillProgress.alreadyDone} image(s) already had both sizes`
                    : ''}
                  {resizeBackfillProgress.failed > 0 ? `, ${resizeBackfillProgress.failed} failed` : ''}.
                </p>
              </div>
            )}

            <p className="text-xs">
              Status:{' '}
              <span className="font-medium">
                {resizeBackfillProgress.status === 'idle' && 'Not started'}
                {resizeBackfillProgress.status === 'running' && 'Running — generating sizes live…'}
                {resizeBackfillProgress.status === 'done' && 'Complete'}
                {resizeBackfillProgress.status === 'error' && 'Error'}
              </span>
            </p>

            {resizeBackfillProgress.recentErrors.length > 0 && (
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer text-yellow-800">
                  {resizeBackfillProgress.recentErrors.length} recent error(s) — click to view
                </summary>
                <ul className="mt-1 list-disc pl-4">
                  {resizeBackfillProgress.recentErrors.map((e, i) => (
                    <li key={i}>
                      {e.bucket}/{e.path}: {e.error}
                    </li>
                  ))}
                </ul>
              </details>
            )}

            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                disabled={resizeBackfillStarting || resizeBackfillProgress.status === 'running'}
                onClick={onStartResizeBackfill}
              >
                {resizeBackfillStarting || resizeBackfillProgress.status === 'running' ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                {resizeBackfillProgress.status === 'done' ? 'Re-run Backfill' : 'Start Backfill'}
              </Button>
              {resizeBackfillProgress.status !== 'idle' && resizeBackfillProgress.status !== 'running' && (
                <Button type="button" size="sm" variant="outline" onClick={onResetResizeBackfill}>
                  Reset Status
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="mt-8">
        <h2 className="font-serif text-2xl font-bold text-primary">Vendor Commission &amp; Settlement</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Your cut from every vendor's sale. The moment an order item is marked "Delivered", this
          formula runs once and locks in: <code className="rounded bg-muted px-1 py-0.5 text-xs">
          fee = flat fee + (item price × quantity × percent / 100)</code>. The vendor's payable
          amount is the rest. Changing these numbers only affects items delivered after you save —
          already-settled or already-delivered items keep their original locked-in fee.
        </p>
      </div>

      {!handlingFeeForm ? (
        <p className="py-4 text-sm text-muted-foreground">Loading…</p>
      ) : (
        <form
          onSubmit={onSubmitHandlingFee}
          className="mt-4 grid max-w-xl gap-4 rounded-lg border border-border/60 bg-card p-5"
        >
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="handling-fee-percent">Your commission (%)</Label>
              <Input
                id="handling-fee-percent"
                type="number"
                min={0}
                max={100}
                step="0.5"
                value={handlingFeeForm.handling_fee_percent}
                onChange={(e) =>
                  setHandlingFeeForm(
                    (f) => f && { ...f, handling_fee_percent: Number(e.target.value) }
                  )
                }
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="handling-fee-base">Flat fee per item (₹)</Label>
              <Input
                id="handling-fee-base"
                type="number"
                min={0}
                step="1"
                value={handlingFeeForm.handling_fee_base}
                onChange={(e) =>
                  setHandlingFeeForm(
                    (f) => f && { ...f, handling_fee_base: Number(e.target.value) }
                  )
                }
              />
              <p className="text-xs text-muted-foreground">Optional. Leave 0 if you only want a %.</p>
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="handling-fee-return-window">Vendor payout hold — return window (days)</Label>
            <Input
              id="handling-fee-return-window"
              type="number"
              min={0}
              step="1"
              value={handlingFeeForm.return_window_days}
              onChange={(e) =>
                setHandlingFeeForm(
                  (f) => f && { ...f, return_window_days: Number(e.target.value) }
                )
              }
            />
            <p className="text-xs text-muted-foreground">
              A delivered item is only included in the weekly vendor settlement once this many days
              have passed since delivery (so a return/refund can still happen before you've already
              paid the vendor out).
            </p>
          </div>

          <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
            Example: a ₹1,000 item with{' '}
            {handlingFeeForm.handling_fee_percent || 0}% + ₹{handlingFeeForm.handling_fee_base || 0}{' '}
            flat fee → you keep{' '}
            <span className="font-semibold text-foreground">
              ₹
              {Math.min(
                (handlingFeeForm.handling_fee_base || 0) +
                  (1000 * (handlingFeeForm.handling_fee_percent || 0)) / 100,
                1000
              ).toFixed(2)}
            </span>
            , vendor gets{' '}
            <span className="font-semibold text-foreground">
              ₹
              {(
                1000 -
                Math.min(
                  (handlingFeeForm.handling_fee_base || 0) +
                    (1000 * (handlingFeeForm.handling_fee_percent || 0)) / 100,
                  1000
                )
              ).toFixed(2)}
            </span>
            .
          </div>

          <Button type="submit" disabled={savingHandlingFee} className="mt-2 w-fit bg-primary">
            <Save className="mr-1.5 h-4 w-4" />{' '}
            {savingHandlingFee ? 'Saving…' : 'Save Commission Settings'}
          </Button>
        </form>
      )}

      <div className="mt-8">
        <h2 className="font-serif text-2xl font-bold text-primary">Profit Estimate (Admin-only)</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Powers the "Safe Profit" preview on the Add/Edit Product form only. Never shown to
          customers, never sent to Merchant Center/product feed, never changes checkout pricing.
        </p>
      </div>

      {!checkoutForm ? (
        <p className="py-4 text-sm text-muted-foreground">Loading…</p>
      ) : (
        <form
          onSubmit={onSubmitCheckout}
          className="mt-4 grid max-w-xl gap-4 rounded-lg border border-primary/30 bg-primary/5 p-5"
        >
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="cod-logistics-cost">Your actual COD courier cost (₹)</Label>
              <Input
                id="cod-logistics-cost"
                type="number"
                min={0}
                step="1"
                value={checkoutForm.cod_logistics_cost}
                onChange={(e) =>
                  setCheckoutForm(
                    (f) => f && { ...f, cod_logistics_cost: Number(e.target.value) }
                  )
                }
              />
              <p className="text-xs text-muted-foreground">
                What the courier actually charges you per COD order (forward freight + COD
                handling) — used for Safe Profit even though customer shipping above is ₹0.
              </p>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="prepaid-logistics-cost">Your actual prepaid courier cost (₹)</Label>
              <Input
                id="prepaid-logistics-cost"
                type="number"
                min={0}
                step="1"
                value={checkoutForm.prepaid_logistics_cost}
                onChange={(e) =>
                  setCheckoutForm(
                    (f) => f && { ...f, prepaid_logistics_cost: Number(e.target.value) }
                  )
                }
              />
              <p className="text-xs text-muted-foreground">
                Usually cheaper than COD — no cash handling fee.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="vendor-pickup-shipping-cost">Vendor pickup shipping cost (₹)</Label>
              <Input
                id="vendor-pickup-shipping-cost"
                type="number"
                min={0}
                step="1"
                value={checkoutForm.vendor_pickup_shipping_cost}
                onChange={(e) =>
                  setCheckoutForm(
                    (f) => f && { ...f, vendor_pickup_shipping_cost: Number(e.target.value) }
                  )
                }
              />
              <p className="text-xs text-muted-foreground">
                What it costs you to get stock FROM a vendor TO your warehouse (pickup courier).
                This is the "2nd shipping" leg vendors see added on top of their price on the
                vendor Add/Edit Product form — separate from the COD/prepaid courier cost above,
                which is warehouse → customer.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="gateway-fee">Payment gateway fee (%)</Label>
              <Input
                id="gateway-fee"
                type="number"
                min={0}
                max={100}
                step="0.01"
                value={checkoutForm.payment_gateway_fee_percent}
                onChange={(e) =>
                  setCheckoutForm(
                    (f) => f && { ...f, payment_gateway_fee_percent: Number(e.target.value) }
                  )
                }
              />
              <p className="text-xs text-muted-foreground">
                E.g. Razorpay's ~2.36% (2% + 18% GST). Applied only to the prepaid share of orders.
              </p>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="other-charges">Other charges per order (₹)</Label>
              <Input
                id="other-charges"
                type="number"
                min={0}
                step="1"
                value={checkoutForm.other_charges}
                onChange={(e) =>
                  setCheckoutForm(
                    (f) => f && { ...f, other_charges: Number(e.target.value) }
                  )
                }
              />
              <p className="text-xs text-muted-foreground">
                Any manual deduction — packaging, handling, etc.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="cod-percent">Approx. COD orders (%)</Label>
              <Input
                id="cod-percent"
                type="number"
                min={0}
                max={100}
                step="1"
                value={checkoutForm.cod_order_percent}
                onChange={(e) =>
                  setCheckoutForm(
                    (f) => f && { ...f, cod_order_percent: Number(e.target.value) }
                  )
                }
              />
              <p className="text-xs text-muted-foreground">
                Rest is assumed prepaid. E.g. 19 COD out of 25 orders = 76.
              </p>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="return-rate">Approx. return / RTO rate (%)</Label>
              <Input
                id="return-rate"
                type="number"
                min={0}
                max={100}
                step="1"
                value={checkoutForm.return_rate_percent}
                onChange={(e) =>
                  setCheckoutForm(
                    (f) => f && { ...f, return_rate_percent: Number(e.target.value) }
                  )
                }
              />
              <p className="text-xs text-muted-foreground">
                E.g. 5 returns out of 25 orders = 20. Returned orders lose both-way shipping.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-[1fr_1fr_1fr] gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="coupon-type">Your typical coupon type</Label>
              <Select
                value={checkoutForm.coupon_discount_type}
                onValueChange={(v: 'flat' | 'percentage') =>
                  setCheckoutForm((f) => f && { ...f, coupon_discount_type: v })
                }
              >
                <SelectTrigger id="coupon-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="flat">Flat ₹ off</SelectItem>
                  <SelectItem value="percentage">% off</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="coupon-value">
                {checkoutForm.coupon_discount_type === 'flat' ? 'Coupon amount (₹)' : 'Coupon amount (%)'}
              </Label>
              <Input
                id="coupon-value"
                type="number"
                min={0}
                step="1"
                value={checkoutForm.coupon_discount_value}
                onChange={(e) =>
                  setCheckoutForm(
                    (f) => f && { ...f, coupon_discount_value: Number(e.target.value) }
                  )
                }
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="coupon-usage">Used on (% of orders)</Label>
              <Input
                id="coupon-usage"
                type="number"
                min={0}
                max={100}
                step="1"
                value={checkoutForm.coupon_usage_percent}
                onChange={(e) =>
                  setCheckoutForm(
                    (f) => f && { ...f, coupon_usage_percent: Number(e.target.value) }
                  )
                }
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            E.g. a flat ₹50-off coupon used on 30% of orders blends to an average ₹15/order —
            reduces the effective price used in the Safe Profit math. Doesn't change your real
            coupons at checkout.
          </p>
          <div className="mt-2 border-t border-border/60 pt-4">
            <p className="text-sm font-medium">Suggested pricing tiers</p>
            <p className="text-xs text-muted-foreground">
              Markup % over cost price, used to quick-fill the Price field on the Add/Edit Product
              form once you enter a cost price.
            </p>
            <div className="mt-2 grid grid-cols-3 gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="entry-markup">Entry-level (%)</Label>
                <Input
                  id="entry-markup"
                  type="number"
                  min={0}
                  step="1"
                  value={checkoutForm.entry_markup_percent}
                  onChange={(e) =>
                    setCheckoutForm(
                      (f) => f && { ...f, entry_markup_percent: Number(e.target.value) }
                    )
                  }
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="mid-markup">Mid-range (%)</Label>
                <Input
                  id="mid-markup"
                  type="number"
                  min={0}
                  step="1"
                  value={checkoutForm.mid_markup_percent}
                  onChange={(e) =>
                    setCheckoutForm(
                      (f) => f && { ...f, mid_markup_percent: Number(e.target.value) }
                    )
                  }
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="premium-markup">Premium (%)</Label>
                <Input
                  id="premium-markup"
                  type="number"
                  min={0}
                  step="1"
                  value={checkoutForm.premium_markup_percent}
                  onChange={(e) =>
                    setCheckoutForm(
                      (f) => f && { ...f, premium_markup_percent: Number(e.target.value) }
                    )
                  }
                />
              </div>
            </div>
          </div>
          <Button type="submit" disabled={savingCheckout} className="mt-2 w-fit bg-primary">
            <Save className="mr-1.5 h-4 w-4" />{' '}
            {savingCheckout ? 'Saving…' : 'Save Profit Estimate Settings'}
          </Button>
        </form>
      )}


      <div className="mt-8">
        <h2 className="font-serif text-2xl font-bold text-primary">Delhivery Courier</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Auto-create shipments and show live tracking on order pages once an order ships.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          The API token is a secret and is read from the <code>DELHIVERY_API_TOKEN</code>{' '}
          environment variable on your server (Vercel → Settings → Environment Variables) — not
          from this form. Everything below is your pickup warehouse info, which is safe to store
          here.
        </p>
      </div>

      {!delhiveryForm ? (
        <p className="py-4 text-sm text-muted-foreground">Loading…</p>
      ) : (
        <form
          onSubmit={onSubmitDelhivery}
          className="mt-4 grid max-w-xl gap-4 rounded-lg border border-border/60 bg-card p-5"
        >
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={delhiveryForm.enabled}
              onChange={(e) =>
                setDelhiveryForm((f) => f && { ...f, enabled: e.target.checked })
              }
              className="h-4 w-4"
            />
            Enable Delhivery integration
          </label>

          <div className="grid gap-1.5">
            <Label htmlFor="dl-location-name">Pickup location name</Label>
            <Input
              id="dl-location-name"
              value={delhiveryForm.pickup_location_name}
              onChange={(e) =>
                setDelhiveryForm((f) => f && { ...f, pickup_location_name: e.target.value })
              }
              placeholder="Must exactly match the warehouse name in your Delhivery dashboard"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="dl-pincode">Pickup PIN code</Label>
              <Input
                id="dl-pincode"
                value={delhiveryForm.pickup_pincode}
                onChange={(e) =>
                  setDelhiveryForm((f) => f && { ...f, pickup_pincode: e.target.value })
                }
                inputMode="numeric"
                placeholder="400050"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="dl-phone">Pickup phone</Label>
              <Input
                id="dl-phone"
                value={delhiveryForm.pickup_phone}
                onChange={(e) =>
                  setDelhiveryForm((f) => f && { ...f, pickup_phone: e.target.value })
                }
                placeholder="+91 98765 43210"
              />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="dl-address">Pickup address</Label>
            <Textarea
              id="dl-address"
              rows={2}
              value={delhiveryForm.pickup_address}
              onChange={(e) =>
                setDelhiveryForm((f) => f && { ...f, pickup_address: e.target.value })
              }
              placeholder="Warehouse address"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="dl-city">City</Label>
              <Input
                id="dl-city"
                value={delhiveryForm.pickup_city}
                onChange={(e) =>
                  setDelhiveryForm((f) => f && { ...f, pickup_city: e.target.value })
                }
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="dl-state">State</Label>
              <Input
                id="dl-state"
                value={delhiveryForm.pickup_state}
                onChange={(e) =>
                  setDelhiveryForm((f) => f && { ...f, pickup_state: e.target.value })
                }
              />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="dl-gst">Seller GST TIN</Label>
            <Input
              id="dl-gst"
              value={delhiveryForm.seller_gst_tin}
              onChange={(e) =>
                setDelhiveryForm(
                  (f) => f && { ...f, seller_gst_tin: e.target.value.toUpperCase() }
                )
              }
              placeholder="27ABCDE1234F1Z5"
            />
          </div>

          <Button type="submit" disabled={savingDelhivery} className="mt-2 w-fit bg-primary">
            <Save className="mr-1.5 h-4 w-4" />{' '}
            {savingDelhivery ? 'Saving…' : 'Save Delhivery Settings'}
          </Button>
        </form>
      )}

      <div className="mt-8">
        <h2 className="font-serif text-2xl font-bold text-primary">AI Chat Assistant</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Powers the free-text "Ask me anything" box in the on-site chat widget (order tracking,
          sizing, delivery, returns questions). If replies stop working or feel slow, switching the
          model here usually fixes it — no redeploy needed.
        </p>
      </div>

      {!aiChatForm ? (
        <p className="py-4 text-sm text-muted-foreground">Loading…</p>
      ) : (
        <form
          onSubmit={onSubmitAiChat}
          className="mt-4 grid max-w-xl gap-4 rounded-lg border border-border/60 bg-card p-5"
        >
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={aiChatForm.enabled}
              onChange={(e) => setAiChatForm((f) => f && { ...f, enabled: e.target.checked })}
            />
            Enable free-text AI chat (quick-reply topic buttons always stay on regardless)
          </label>

          <div className="grid gap-1.5">
            <Label htmlFor="ai-primary-model">Primary model</Label>
            <select
              id="ai-primary-model"
              value={aiChatForm.primary_model}
              onChange={(e) => setAiChatForm((f) => f && { ...f, primary_model: e.target.value })}
              className="rounded border px-3 py-2 text-sm"
            >
              {AI_CHAT_MODEL_OPTIONS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="ai-fallback-model">Fallback model</Label>
            <select
              id="ai-fallback-model"
              value={aiChatForm.fallback_model}
              onChange={(e) => setAiChatForm((f) => f && { ...f, fallback_model: e.target.value })}
              className="rounded border px-3 py-2 text-sm"
            >
              {AI_CHAT_MODEL_OPTIONS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              Used automatically if the primary model errors, times out, or is rate-limited on your
              NVIDIA_API_KEY account. Even if both fail, order tracking questions still get a real
              answer — the widget's "Track my order" button reads live order/courier data directly,
              without needing the AI at all.
            </p>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={savingAiChat} className="w-fit bg-primary">
              <Save className="mr-1.5 h-4 w-4" /> {savingAiChat ? 'Saving…' : 'Save AI Chat Settings'}
            </Button>
            <Button type="button" variant="outline" disabled={testingAiChat} onClick={onTestAiChat}>
              {testingAiChat ? 'Testing…' : 'Test AI connection'}
            </Button>
          </div>

          {aiTestResult && (
            <div className="mt-2 grid gap-2 rounded-lg border border-border/60 bg-muted/40 p-4 text-sm">
              {aiTestResult.summary && (
                <p className="font-medium text-destructive">{aiTestResult.summary}</p>
              )}
              {aiTestResult.keyPresent && (
                <p className="text-xs text-muted-foreground">
                  Using key {aiTestResult.keyPreview} · AI chat enabled: {String(aiTestResult.aiChatEnabled)}
                </p>
              )}
              {(aiTestResult.results || []).map((r: any) => (
                <div
                  key={r.model}
                  className={`rounded border p-3 ${r.ok ? 'border-emerald-300 bg-emerald-50' : 'border-destructive/40 bg-destructive/5'}`}
                >
                  <p className="font-mono text-xs font-semibold">{r.model}</p>
                  {r.ok ? (
                    <p className="mt-1 text-xs text-emerald-800">
                      ✅ Working ({r.ms}ms) — model replied: &quot;{r.reply}&quot;
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-destructive">
                      ❌ HTTP {r.httpStatus || 'network error'} ({r.ms}ms) — {r.errorDetail}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </form>
      )}

      <div className="mt-8">
        <h2 className="font-serif text-2xl font-bold text-primary">Search by Photo — AI</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Controls the camera icon in the header search bar. When ON, an uploaded photo is read by
          the NVIDIA vision model (garment type, colour, pattern) for real visual matching — same
          NVIDIA_API_KEY as AI Chat above, no extra setup. When OFF (or if the AI call fails/rate-
          limits), it automatically falls back to a free, instant colour-similarity match — the
          feature keeps working either way.
        </p>
      </div>

      {!imageSearchAiForm ? (
        <p className="py-4 text-sm text-muted-foreground">Loading…</p>
      ) : (
        <form
          onSubmit={onSubmitImageSearchAi}
          className="mt-4 grid max-w-xl gap-4 rounded-lg border border-border/60 bg-card p-5"
        >
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={imageSearchAiForm.enabled}
              onChange={(e) => setImageSearchAiForm((f) => f && { ...f, enabled: e.target.checked })}
            />
            Enable AI-powered search by photo (uses NVIDIA_API_KEY; falls back to colour match if off)
          </label>

          <div className="mt-2 flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={savingImageSearchAi} className="w-fit bg-primary">
              <Save className="mr-1.5 h-4 w-4" />{' '}
              {savingImageSearchAi ? 'Saving…' : 'Save Image Search Settings'}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={testingImageSearchAi}
              onClick={onTestImageSearchAi}
            >
              {testingImageSearchAi ? 'Testing…' : 'Test AI connection'}
            </Button>
          </div>

          {imageSearchAiTestResult && (
            <div className="mt-2 grid gap-2 rounded-lg border border-border/60 bg-muted/40 p-4 text-sm">
              {imageSearchAiTestResult.summary && (
                <p className="font-medium text-destructive">{imageSearchAiTestResult.summary}</p>
              )}
              {imageSearchAiTestResult.keyPresent && (
                <p className="text-xs text-muted-foreground">
                  Using key {imageSearchAiTestResult.keyPreview} · Search by photo AI enabled:{' '}
                  {String(imageSearchAiTestResult.imageSearchAiEnabled)}
                </p>
              )}
              {(imageSearchAiTestResult.results || []).map((r: any) => (
                <div
                  key={r.model}
                  className={`rounded border p-3 ${r.ok ? 'border-emerald-300 bg-emerald-50' : 'border-destructive/40 bg-destructive/5'}`}
                >
                  <p className="font-mono text-xs font-semibold">{r.model}</p>
                  {r.ok ? (
                    <p className="mt-1 text-xs text-emerald-800">
                      ✅ Working ({r.ms}ms) — model replied: &quot;{r.reply}&quot;
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-destructive">
                      ❌ HTTP {r.httpStatus || 'network error'} ({r.ms}ms) — {r.errorDetail}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </form>
      )}

      <div className="mt-8">
        <h2 className="font-serif text-2xl font-bold text-primary">Email Notifications</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Powers order confirmation, shipping, return-status, and abandoned-cart recovery emails.
        </p>
      </div>

      {!emailForm ? (
        <p className="py-4 text-sm text-muted-foreground">Loading…</p>
      ) : (
        <form
          onSubmit={onSubmitEmail}
          className="mt-4 grid max-w-xl gap-4 rounded-lg border border-border/60 bg-card p-5"
        >
          <div className="grid gap-1.5">
            <Label htmlFor="email-provider">Provider</Label>
            <select
              id="email-provider"
              value={emailForm.provider}
              onChange={(e) =>
                setEmailForm((f) => f && { ...f, provider: e.target.value as EmailSettings['provider'] })
              }
              className="rounded border px-3 py-2 text-sm"
            >
              <option value="">Not configured</option>
              <option value="resend">Resend</option>
              <option value="zeptomail">Zoho ZeptoMail</option>
            </select>
          </div>

          {emailForm.provider === 'zeptomail' && (
            <div className="grid gap-1.5">
              <Label htmlFor="zeptomail-region">ZeptoMail account region</Label>
              <select
                id="zeptomail-region"
                value={emailForm.zeptomail_region}
                onChange={(e) =>
                  setEmailForm((f) => f && { ...f, zeptomail_region: e.target.value as 'in' | 'com' })
                }
                className="rounded border px-3 py-2 text-sm"
              >
                <option value="in">India (zeptomail.in)</option>
                <option value="com">Global (zeptomail.com)</option>
              </select>
              <p className="text-xs text-muted-foreground">
                Check your ZeptoMail dashboard URL — zoho.in accounts use the India API, zoho.com uses Global.
              </p>
            </div>
          )}

          <div className="grid gap-1.5">
            <Label htmlFor="email-api-key">
              {emailForm.provider === 'zeptomail' ? 'ZeptoMail API token (Send Mail token)' : 'Resend API key'}
            </Label>
            <Input
              id="email-api-key"
              type="password"
              value={emailForm.api_key}
              onChange={(e) => setEmailForm((f) => f && { ...f, api_key: e.target.value })}
              placeholder={emailForm.provider === 'zeptomail' ? 'Zoho-enczapikey PHtE6r1a...' : 're_xxxxxxxxxxxx'}
            />
            <p className="text-xs text-muted-foreground">
              {emailForm.provider === 'zeptomail'
                ? 'Zoho Mail Admin → ZeptoMail → Mail Agents → your agent → API tokens. Paste the whole token, including the "Zoho-enczapikey " prefix if shown.'
                : 'From resend.com/api-keys.'}
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="email-sender-name">From name</Label>
              <Input
                id="email-sender-name"
                value={emailForm.sender_name}
                onChange={(e) => setEmailForm((f) => f && { ...f, sender_name: e.target.value })}
                placeholder="AruhiHandlooms"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="email-sender-address">From email address</Label>
              <Input
                id="email-sender-address"
                type="email"
                value={emailForm.sender_email}
                onChange={(e) => setEmailForm((f) => f && { ...f, sender_email: e.target.value })}
                placeholder="orders@yourdomain.com"
              />
              <p className="text-xs text-muted-foreground">
                Must be on a domain you've verified with your provider (or Resend's sandbox address
                onboarding@resend.dev, which only delivers to your own signup email).
              </p>
            </div>
          </div>

          <Button type="submit" disabled={savingEmail} className="mt-2 w-fit bg-primary">
            <Save className="mr-1.5 h-4 w-4" /> {savingEmail ? 'Saving…' : 'Save Email Settings'}
          </Button>

          <div className="mt-2 flex flex-col gap-2 border-t border-border/60 pt-4 sm:flex-row sm:items-center">
            <Input
              value={testEmailTo}
              onChange={(e) => setTestEmailTo(e.target.value)}
              type="email"
              placeholder="you@example.com"
              className="sm:max-w-xs"
            />
            <Button type="button" variant="outline" disabled={sendingTest} onClick={onSendTestEmail}>
              {sendingTest ? 'Sending…' : 'Send test email'}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
