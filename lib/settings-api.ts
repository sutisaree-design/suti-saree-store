import { supabase } from './supabase';
import { purgeSiteLayoutCache } from './purge-site-cache';

export interface StoreInfo {
  name: string;
  address: string;
  gstin: string;
  support_email: string;
  support_phone: string;
  whatsapp_number?: string;
}

const DEFAULT_STORE_INFO: StoreInfo = {
  name: 'AruhiHandlooms',
  address: '',
  gstin: '',
  support_email: '',
  support_phone: '',
  whatsapp_number: '',
};

export async function fetchStoreInfo(): Promise<StoreInfo> {
  const { data, error } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'store_info')
    .maybeSingle();
  if (error || !data) return DEFAULT_STORE_INFO;
  return { ...DEFAULT_STORE_INFO, ...(data.value as Partial<StoreInfo>) };
}

export async function saveStoreInfo(info: StoreInfo) {
  const { error } = await supabase
    .from('settings')
    .upsert({ key: 'store_info', value: info }, { onConflict: 'key' });
  if (error) throw error;
}

// ---------------------------------------------------------------------
// About Us page content — the story/values/process text on /about.
// Business identity fields (address, GSTIN, email, phone) stay in
// StoreInfo above and are reused on /about automatically; this only
// covers the narrative copy so admins can edit it without touching code.
// ---------------------------------------------------------------------
export interface AboutContentBlock {
  title: string;
  body: string;
}

export interface AboutContent {
  hero_heading: string;
  hero_subtext: string;
  story_paragraph_1: string;
  story_paragraph_2: string;
  values: AboutContentBlock[]; // exactly 4 — icons are fixed in code, matched by position
  process_steps: AboutContentBlock[]; // exactly 4 — icons/step numbers fixed in code
}

export const DEFAULT_ABOUT_CONTENT: AboutContent = {
  hero_heading:
    "Handwoven ethnic wear, sold the way it's made — by hand, and by name.",
  hero_subtext:
    'AruhiHandlooms sources sarees, lehengas and bridal wear directly from handloom weaving clusters across India, and sells them online with the same care they were woven with.',
  story_paragraph_1:
    "Handloom weaving is slow, skilled work, and it rarely gets sold that way online — pieces pass through several hands before reaching a customer, with little said about who actually wove them. AruhiHandlooms was built to shorten that distance: we work with weavers directly, list what's actually in stock, and stand behind every order with a real support team and real policies.",
  story_paragraph_2:
    "We're not a print-on-demand storefront or a drop-shipped catalogue. What you see listed is what our team has checked, photographed and can ship — and if something isn't right, our refund policy and support team are there to fix it.",
  values: [
    {
      title: 'Handwoven, not mass-produced',
      body: 'Every saree and set is woven on a loom by hand. Small irregularities in weave and color are marks of handwork, not defects.',
    },
    {
      title: 'Sourced directly from weavers',
      body: 'We work with weaving clusters across India instead of routing through multiple middlemen, so quality and pricing stay traceable.',
    },
    {
      title: 'Natural fibres first',
      body: 'Silk, cotton, mulmul and cotton-silk blends are chosen for how they wear and drape, not just how they photograph.',
    },
    {
      title: 'Accountable after the sale',
      body: 'Real order, shipping and refund policies apply to every purchase — see our support details below if anything needs sorting out.',
    },
  ],
  process_steps: [
    {
      title: 'Yarn & design',
      body: 'Yarn is selected and a weave design is set before a single thread goes on the loom.',
    },
    {
      title: 'Handloom weaving',
      body: 'Artisans weave each piece by hand, which is why timelines vary and no two pieces are perfectly identical.',
    },
    {
      title: 'Quality check',
      body: 'Every piece is checked for weave, finish and stitching before it is listed as ready to ship.',
    },
    {
      title: 'Packed & shipped',
      body: 'Orders are packed and handed to our courier partners with tracking shared on your account.',
    },
  ],
};

export function mergeAboutContent(value: Partial<AboutContent> | null | undefined): AboutContent {
  const v = value || {};
  return {
    ...DEFAULT_ABOUT_CONTENT,
    ...v,
    values:
      Array.isArray(v.values) && v.values.length === 4
        ? v.values
        : DEFAULT_ABOUT_CONTENT.values,
    process_steps:
      Array.isArray(v.process_steps) && v.process_steps.length === 4
        ? v.process_steps
        : DEFAULT_ABOUT_CONTENT.process_steps,
  };
}

export async function fetchAboutContent(): Promise<AboutContent> {
  const { data, error } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'about_content')
    .maybeSingle();
  if (error || !data) return DEFAULT_ABOUT_CONTENT;
  return mergeAboutContent(data.value as Partial<AboutContent>);
}

export async function saveAboutContent(content: AboutContent) {
  const { error } = await supabase
    .from('settings')
    .upsert({ key: 'about_content', value: content }, { onConflict: 'key' });
  if (error) throw error;
}

// ---------------------------------------------------------------------
// Partner pages content — the 4 public vendor/reseller SEO landing pages
// (/vendor-registration, /vendor-login, /reseller-registration,
// /reseller-login). These exist outside the login-protected /vendor and
// /account paths specifically so Google can index them; the text is
// editable here so admins don't need a code change to update copy.
// ---------------------------------------------------------------------
export interface PartnerPageStep {
  title: string;
  body: string;
}

export interface PartnerPageFaq {
  q: string;
  a: string;
}

export interface PartnerLandingContent {
  hero_heading: string;
  hero_subtext: string;
  cta_label: string;
}

export interface PartnerRegistrationContent extends PartnerLandingContent {
  steps: PartnerPageStep[]; // exactly 4 — icons fixed in code, matched by position
  faqs: PartnerPageFaq[]; // exactly 3
}

export interface PartnerPagesContent {
  vendor_registration: PartnerRegistrationContent;
  vendor_login: PartnerLandingContent;
  reseller_registration: PartnerRegistrationContent;
  reseller_login: PartnerLandingContent;
}

export const DEFAULT_PARTNER_PAGES_CONTENT: PartnerPagesContent = {
  vendor_registration: {
    hero_heading: 'Vendor Registration',
    hero_subtext:
      'Supply handwoven sarees, lehengas, and ethnic wear to AruhiHandlooms. Register as a vendor, get verified, and let us handle photography, listing, and shipping for every order.',
    cta_label: 'Start Vendor Registration',
    steps: [
      { title: 'Apply online', body: 'Fill in your business details, PAN, and pickup address in a short form — takes under 5 minutes.' },
      { title: 'Get verified', body: 'Our team reviews your application and KYC details, usually within a few business days.' },
      { title: 'We handle logistics', body: 'Once approved, we photograph, list, and ship every order to the customer — you just supply stock.' },
      { title: 'Get paid', body: 'Track orders and settlements from your vendor dashboard after every fulfilled order.' },
    ],
    faqs: [
      { q: 'How do I register as a vendor on AruhiHandlooms?', a: 'Click "Start Vendor Registration", log in or create a free account, and submit the vendor application form with your business name, PAN, and pickup address.' },
      { q: 'Is there a fee for vendor registration?', a: 'No. Vendor registration and onboarding are free. You only need valid PAN details, and GST if applicable.' },
      { q: 'How do I log in after I become a vendor?', a: 'Approved vendors log in with the same account used to apply, via the vendor login page, and are taken straight to their vendor dashboard.' },
    ],
  },
  vendor_login: {
    hero_heading: 'Vendor Login',
    hero_subtext:
      "Vendors log in with the same account used to apply. Once logged in, you'll be taken straight to your vendor dashboard to manage products, orders, and earnings.",
    cta_label: 'Log In to Vendor Dashboard',
  },
  reseller_registration: {
    hero_heading: 'Reseller Registration',
    hero_subtext:
      'Start reselling and earn on every order. Set your own markup and sell our handloom collection under your name — zero inventory required.',
    cta_label: 'Start Reseller Registration',
    steps: [
      { title: 'Create a free account', body: 'Sign up or log in with your existing AruhiHandlooms account — no separate reseller signup needed.' },
      { title: 'Join the reseller program', body: 'One click from your account to join — no application review, no waiting period.' },
      { title: 'Share products, zero inventory', body: 'Share our handloom catalog with your customers. We handle stock, packing, and shipping.' },
      { title: 'Set your markup, earn per order', body: 'Choose your own markup on top of our price and earn on every order placed through you.' },
    ],
    faqs: [
      { q: 'How do I register as a reseller on AruhiHandlooms?', a: 'Log in or create a free AruhiHandlooms account, then join the reseller program from your account page in a single click — there is no separate application form.' },
      { q: 'Is reseller registration free?', a: 'Yes, joining the reseller program is free and there is no inventory to buy upfront.' },
      { q: 'How much can I earn as a reseller?', a: 'You set your own markup amount on top of the base price. You earn that markup on every order placed through your reseller link.' },
    ],
  },
  reseller_login: {
    hero_heading: 'Reseller Login',
    hero_subtext:
      "Resellers log in with their regular AruhiHandlooms account. Once logged in, you'll be taken straight to your reseller dashboard to track orders and earnings.",
    cta_label: 'Log In to Reseller Dashboard',
  },
};

function mergeLanding(
  value: Partial<PartnerLandingContent> | null | undefined,
  fallback: PartnerLandingContent
): PartnerLandingContent {
  return { ...fallback, ...(value || {}) };
}

function mergeRegistration(
  value: Partial<PartnerRegistrationContent> | null | undefined,
  fallback: PartnerRegistrationContent
): PartnerRegistrationContent {
  const v = value || {};
  return {
    ...fallback,
    ...v,
    steps: Array.isArray(v.steps) && v.steps.length === 4 ? v.steps : fallback.steps,
    faqs: Array.isArray(v.faqs) && v.faqs.length === 3 ? v.faqs : fallback.faqs,
  };
}

export function mergePartnerPagesContent(
  value: Partial<PartnerPagesContent> | null | undefined
): PartnerPagesContent {
  const v = value || {};
  return {
    vendor_registration: mergeRegistration(v.vendor_registration, DEFAULT_PARTNER_PAGES_CONTENT.vendor_registration),
    vendor_login: mergeLanding(v.vendor_login, DEFAULT_PARTNER_PAGES_CONTENT.vendor_login),
    reseller_registration: mergeRegistration(v.reseller_registration, DEFAULT_PARTNER_PAGES_CONTENT.reseller_registration),
    reseller_login: mergeLanding(v.reseller_login, DEFAULT_PARTNER_PAGES_CONTENT.reseller_login),
  };
}

export async function fetchPartnerPagesContent(): Promise<PartnerPagesContent> {
  const { data, error } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'partner_pages_content')
    .maybeSingle();
  if (error || !data) return DEFAULT_PARTNER_PAGES_CONTENT;
  return mergePartnerPagesContent(data.value as Partial<PartnerPagesContent>);
}

export async function savePartnerPagesContent(content: PartnerPagesContent) {
  const { error } = await supabase
    .from('settings')
    .upsert({ key: 'partner_pages_content', value: content }, { onConflict: 'key' });
  if (error) throw error;
}

// ---------------------------------------------------------------------
// Social media links — shown as icons in the storefront footer.
// Any field left blank is simply hidden on the footer, so admins don't
// have to fill in every platform.
// ---------------------------------------------------------------------
export interface SocialLinks {
  instagram: string;
  facebook: string;
  youtube: string;
  twitter: string;
  linkedin: string;
  whatsapp: string; // full wa.me link or number, e.g. https://wa.me/918001234567
}

const DEFAULT_SOCIAL_LINKS: SocialLinks = {
  instagram: '',
  facebook: '',
  youtube: '',
  twitter: '',
  linkedin: '',
  whatsapp: '',
};

export async function fetchSocialLinks(): Promise<SocialLinks> {
  const { data, error } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'social_links')
    .maybeSingle();
  if (error || !data) return DEFAULT_SOCIAL_LINKS;
  return { ...DEFAULT_SOCIAL_LINKS, ...(data.value as Partial<SocialLinks>) };
}

export async function saveSocialLinks(links: SocialLinks) {
  const { error } = await supabase
    .from('settings')
    .upsert({ key: 'social_links', value: links }, { onConflict: 'key' });
  if (error) throw error;
}

// ---------------------------------------------------------------------
// Online payment discount — an extra % off applied at checkout when the
// customer pays online (via the payment gateway) instead of COD. Shown as
// a consistent incentive card on the product page, the cart drawer, and
// the full cart page, and actually applied to the order total in
// checkout once "Pay online" is selected.
//
// The `label` should describe the payment methods that actually qualify
// (e.g. "UPI / Cards / Netbanking" or just "UPI" if that's the only
// qualifying method) rather than naming the payment gateway/processor
// itself — naming the processor implies it is the one offering the
// discount, which it isn't, and risks misrepresentation.
//
// Deliberately NOT submitted to Google Merchant Center as a structured
// "Promotion" or baked into the product feed / JSON-LD price: Merchant
// Center's Promotions policy treats discounts restricted to a specific
// payment method as an "overly restrictive" promotion outside Brazil, and
// the [price] attribute must always reflect the standard (non-conditional)
// price. This stays a checkout-time, on-site incentive only — the feed
// price and structured data keep showing the normal price.
// ---------------------------------------------------------------------
export interface PaymentDiscountSettings {
  enabled: boolean;
  /** Extra discount percentage applied to the order subtotal when paying online (0-100). */
  percent: number;
  /** Short customer-facing label, e.g. "online payment" — used in "Get X% off on {label}". */
  label: string;
}

export const DEFAULT_PAYMENT_DISCOUNT_SETTINGS: PaymentDiscountSettings = {
  enabled: false,
  percent: 5,
  label: 'online payment',
};

export async function fetchPaymentDiscountSettings(): Promise<PaymentDiscountSettings> {
  const { data, error } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'payment_discount')
    .maybeSingle();
  if (error || !data) return DEFAULT_PAYMENT_DISCOUNT_SETTINGS;
  return { ...DEFAULT_PAYMENT_DISCOUNT_SETTINGS, ...(data.value as Partial<PaymentDiscountSettings>) };
}

export async function savePaymentDiscountSettings(settings: PaymentDiscountSettings) {
  const { error } = await supabase
    .from('settings')
    .upsert({ key: 'payment_discount', value: settings }, { onConflict: 'key' });
  if (error) throw error;
  await purgeSiteLayoutCache();
}

// ---------------------------------------------------------------------
// Refund automation — controls whether a customer self-cancelling a
// paid-online order gets an automatic Razorpay refund (see
// app/api/orders/[id]/cancel/route.ts), or whether it's left for the
// admin to process by hand from the Razorpay dashboard/orders panel.
// ---------------------------------------------------------------------
export interface RefundAutomationSettings {
  auto_refund_enabled: boolean;
}

export const DEFAULT_REFUND_AUTOMATION_SETTINGS: RefundAutomationSettings = {
  auto_refund_enabled: true,
};

export async function fetchRefundAutomationSettings(): Promise<RefundAutomationSettings> {
  const { data, error } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'refund_automation')
    .maybeSingle();
  if (error || !data) return DEFAULT_REFUND_AUTOMATION_SETTINGS;
  return { ...DEFAULT_REFUND_AUTOMATION_SETTINGS, ...(data.value as Partial<RefundAutomationSettings>) };
}

export async function saveRefundAutomationSettings(settings: RefundAutomationSettings) {
  const { error } = await supabase
    .from('settings')
    .upsert({ key: 'refund_automation', value: settings }, { onConflict: 'key' });
  if (error) throw error;
}

// ---------------------------------------------------------------------
// Media delivery mode — controls whether the /media/[...path] proxy
// (see lib/media-url.ts + app/media/[...path]/route.ts) actually streams
// files through Vercel, or just 302-redirects the browser/crawler
// straight to the underlying Supabase Storage URL.
//
// Every page/feed still LINKS to aruhihandlooms.com/media/... either way
// -- nothing about URL generation changes -- only what the proxy route
// does with that request changes. This means the toggle takes effect
// instantly, site-wide, with no rebuild and no other code touched.
//
// "Redirect" mode exists specifically so that if Vercel's Fast Data
// Transfer / Fast Origin Transfer quota is close to running out near the
// end of a billing cycle, this can be flipped off from the admin panel:
// the browser/crawler gets redirected to the raw Supabase URL and fetches
// the actual image/video bytes directly, so Vercel stops paying that
// bandwidth cost for media. The tradeoff is that the storage host
// becomes visible again (in the browser network tab, and to crawlers
// that record the final redirected URL) until it's switched back on.
// ---------------------------------------------------------------------
export interface MediaDeliverySettings {
  /** true = proxy streams the file through Vercel under our own domain
   *  (default; keeps aruhihandlooms.com in front of every media URL).
   *  false = proxy 302-redirects straight to Supabase Storage instead,
   *  to save Vercel bandwidth quota. */
  proxy_enabled: boolean;
}

export const DEFAULT_MEDIA_DELIVERY_SETTINGS: MediaDeliverySettings = {
  proxy_enabled: true,
};

export async function fetchMediaDeliverySettings(): Promise<MediaDeliverySettings> {
  const { data, error } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'media_delivery')
    .maybeSingle();
  if (error || !data) return DEFAULT_MEDIA_DELIVERY_SETTINGS;
  return { ...DEFAULT_MEDIA_DELIVERY_SETTINGS, ...(data.value as Partial<MediaDeliverySettings>) };
}

// Goes through /api/admin/media-delivery (server-side) instead of writing
// to the `settings` table directly like other admin settings do, because
// this one also needs to purge Cloudflare's edge cache for /media/* the
// moment it's saved (see that route's comment for why) -- otherwise
// already-cached images at Cloudflare's edge would keep ignoring the new
// value until their 1-year cache naturally expires.
export async function saveMediaDeliverySettings(settings: MediaDeliverySettings) {
  const res = await fetch('/api/admin/media-delivery', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(json?.error || 'Failed to save media delivery settings');
  }
  return json as {
    saved: true;
    proxy_enabled: boolean;
    cloudflare_purge: { attempted: boolean; ok: boolean; error?: string };
  };
}

// ---------------------------------------------------------------------
// Responsive Images — Admin > Settings toggle.
//
// OFF (default): every image resolves to its original URL — identical
//   to how the site behaved before this feature existed. Zero risk.
// ON: the custom image loader starts requesting -sm (480px, mobile) /
//   -md (900px, desktop) variants for smaller widths, cutting the bytes
//   sent per image on product cards/listings significantly. Safe to
//   flip at any time, backfilled or not — see
//   app/media/[...path]/route.ts for why a missing variant can never
//   show a broken image.
//
// Goes through /api/admin/responsive-images (server-side, requires
// admin) rather than writing to the `settings` table directly from the
// browser, same reasoning as every other admin-gated setting here.
// ---------------------------------------------------------------------
export interface ResponsiveImagesSettings {
  enabled: boolean;
}

export const DEFAULT_RESPONSIVE_IMAGES_SETTINGS: ResponsiveImagesSettings = {
  enabled: false,
};

export async function fetchResponsiveImagesSettings(): Promise<ResponsiveImagesSettings> {
  const { data, error } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'responsive_images')
    .maybeSingle();
  if (error || !data) return DEFAULT_RESPONSIVE_IMAGES_SETTINGS;
  return { ...DEFAULT_RESPONSIVE_IMAGES_SETTINGS, ...(data.value as Partial<ResponsiveImagesSettings>) };
}

export async function saveResponsiveImagesSettings(settings: ResponsiveImagesSettings) {
  const res = await fetch('/api/admin/responsive-images', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(json?.error || 'Failed to save responsive images setting');
  }
  return json as { saved: true; enabled: boolean };
}

// ---------------------------------------------------------------------
// AVIF Format Negotiation — Admin > Settings kill-switch.
//
// ON (default once this feature ships): app/media/[...path]/route.ts
//   serves a smaller AVIF version of a .webp image to browsers whose
//   Accept header advertises AVIF support (~20-30% smaller than the
//   WebP sibling at equal visual quality). Bots/feed-fetchers (Googlebot,
//   Google Merchant Center, Pinterest, etc.) are ALWAYS excluded from
//   negotiation regardless of this toggle -- they only ever see WebP.
// OFF: negotiation is skipped entirely for every request, human or bot
//   -- every image resolves to plain WebP, byte-for-byte identical to
//   how the site behaved before AVIF negotiation existed. Nothing about
//   the DB/canonical URLs, already-generated AVIF files, or the
//   responsive-size backfill changes when this is off; it only stops
//   this one route from ever picking the AVIF file. This is the switch
//   to flip immediately if a product image gets flagged/disapproved
//   anywhere (Google Merchant Center, Pinterest, etc.) that might be
//   AVIF-related -- flipping it off reverts serving behavior instantly.
//
// Goes through /api/admin/avif-negotiation (server-side) and purges
// Cloudflare's edge cache on save, same reasoning as Media Delivery --
// this route's responses are cached for a year, so the toggle needs an
// explicit purge to take effect immediately instead of only for
// not-yet-cached images.
// ---------------------------------------------------------------------
export interface AvifNegotiationSettings {
  enabled: boolean;
}

export const DEFAULT_AVIF_NEGOTIATION_SETTINGS: AvifNegotiationSettings = {
  enabled: true,
};

export async function fetchAvifNegotiationSettings(): Promise<AvifNegotiationSettings> {
  const { data, error } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'avif_negotiation')
    .maybeSingle();
  if (error || !data) return DEFAULT_AVIF_NEGOTIATION_SETTINGS;
  return { ...DEFAULT_AVIF_NEGOTIATION_SETTINGS, ...(data.value as Partial<AvifNegotiationSettings>) };
}

export async function saveAvifNegotiationSettings(settings: AvifNegotiationSettings) {
  const res = await fetch('/api/admin/avif-negotiation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(json?.error || 'Failed to save AVIF negotiation setting');
  }
  return json as {
    saved: true;
    enabled: boolean;
    cloudflare_purge: { attempted: boolean; ok: boolean; error?: string };
  };
}

// ---------------------------------------------------------------------
// Blur Placeholder — Admin > Settings. Two independent toggles.
//
// shimmer_enabled (default true): product gallery photos show a soft
//   animated shimmer while loading instead of a blank/white box, used
//   whenever no real per-image preview is shown for that photo. Generic
//   placeholder (not a per-photo preview), so it needs no backfill —
//   flipping this on applies to every existing image immediately, old
//   or new.
// real_preview_enabled (default true): whenever a real per-image blur
//   preview has been generated (see "Generate Real Photo Previews"
//   backfill), show that instead of the shimmer. Turning this off
//   doesn't stop generation, only display — every photo then falls back
//   to whatever shimmer_enabled decides.
// Both off: no placeholder — exactly like before this feature existed.
//
// Goes through /api/admin/blur-placeholder (server-side, requires
// admin), same reasoning as every other admin-gated setting here.
// ---------------------------------------------------------------------
export interface BlurPlaceholderSettings {
  shimmer_enabled: boolean;
  real_preview_enabled: boolean;
}

export const DEFAULT_BLUR_PLACEHOLDER_SETTINGS: BlurPlaceholderSettings = {
  shimmer_enabled: true,
  real_preview_enabled: true,
};

export async function fetchBlurPlaceholderSettings(): Promise<BlurPlaceholderSettings> {
  const res = await fetch('/api/admin/blur-placeholder', { cache: 'no-store' });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json) return DEFAULT_BLUR_PLACEHOLDER_SETTINGS;
  return { ...DEFAULT_BLUR_PLACEHOLDER_SETTINGS, ...(json as Partial<BlurPlaceholderSettings>) };
}

export async function saveBlurPlaceholderSettings(settings: BlurPlaceholderSettings) {
  const res = await fetch('/api/admin/blur-placeholder', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(json?.error || 'Failed to save blur placeholder setting');
  }
  return json as { saved: true; shimmer_enabled: boolean; real_preview_enabled: boolean };
}

// ---------------------------------------------------------------------
// Order notifications — alerts YOU (the store owner), not the customer,
// the moment a new order comes in. Independent of `support_email` in
// StoreInfo because that address is shown publicly (footer/contact/about
// pages) — this lets you use a different, private inbox for order alerts
// if you want, or just leave `email` blank to reuse support_email.
// ---------------------------------------------------------------------
export interface OrderNotificationSettings {
  enabled: boolean;
  email: string; // if blank, order-confirm falls back to StoreInfo.support_email
}

export const DEFAULT_ORDER_NOTIFICATION_SETTINGS: OrderNotificationSettings = {
  enabled: true,
  email: '',
};

export async function fetchOrderNotificationSettings(): Promise<OrderNotificationSettings> {
  const { data, error } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'order_notifications')
    .maybeSingle();
  if (error || !data) return DEFAULT_ORDER_NOTIFICATION_SETTINGS;
  return { ...DEFAULT_ORDER_NOTIFICATION_SETTINGS, ...(data.value as Partial<OrderNotificationSettings>) };
}

export async function saveOrderNotificationSettings(settings: OrderNotificationSettings) {
  const { error } = await supabase
    .from('settings')
    .upsert({ key: 'order_notifications', value: settings }, { onConflict: 'key' });
  if (error) throw error;
}

// ---------------------------------------------------------------------
// Return automation — single master toggle for the whole return flow:
// 'automatic' auto-schedules the Delhivery reverse pickup as soon as an
// admin approves a return, and auto-fires the Razorpay refund once
// Delhivery shows the item back at the warehouse. 'manual' leaves both
// steps to be triggered by hand from Admin -> Returns.
// ---------------------------------------------------------------------
export interface ReturnAutomationSettings {
  mode: 'automatic' | 'manual';
}

export const DEFAULT_RETURN_AUTOMATION_SETTINGS: ReturnAutomationSettings = {
  mode: 'automatic',
};

export async function fetchReturnAutomationSettings(): Promise<ReturnAutomationSettings> {
  const { data, error } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'return_automation')
    .maybeSingle();
  if (error || !data) return DEFAULT_RETURN_AUTOMATION_SETTINGS;
  const value = (data.value as Partial<ReturnAutomationSettings>) || {};
  return {
    ...DEFAULT_RETURN_AUTOMATION_SETTINGS,
    ...value,
    mode: value.mode === 'manual' ? 'manual' : 'automatic',
  };
}

export async function saveReturnAutomationSettings(settings: ReturnAutomationSettings) {
  const { error } = await supabase
    .from('settings')
    .upsert({ key: 'return_automation', value: settings }, { onConflict: 'key' });
  if (error) throw error;
}

export interface SiteBanner {
  image_url: string;
  link_url?: string;
  // Per-page visibility toggles. Both default to false so an existing
  // banner doesn't suddenly reappear storewide the moment this field
  // ships — admin has to explicitly turn each one on.
  show_on_home?: boolean;
  show_on_product?: boolean;
}

const DEFAULT_SITE_BANNER: SiteBanner = {
  image_url: '',
  link_url: '',
  show_on_home: false,
  show_on_product: false,
};

export async function fetchSiteBanner(): Promise<SiteBanner> {
  const { data, error } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'site_banner')
    .maybeSingle();
  if (error || !data) return DEFAULT_SITE_BANNER;
  return { ...DEFAULT_SITE_BANNER, ...(data.value as Partial<SiteBanner>) };
}

export async function saveSiteBanner(banner: SiteBanner) {
  const { error } = await supabase
    .from('settings')
    .upsert({ key: 'site_banner', value: banner }, { onConflict: 'key' });
  if (error) throw error;
  await purgeSiteLayoutCache();
}

// ---------------------------------------------------------------------
// Social auto-publish (Facebook Page + Instagram) — Admin > Marketing >
// Social Auto-Post. When enabled, every product that goes live — vendor-
// submitted (after AI processing) or admin-added directly — is
// automatically posted. The actual Graph API calls happen server-only in
// lib/social-publish-api.ts (which stays out of the client bundle); this
// is deliberately a plain local type/default, not imported from there,
// so this settings form can stay a normal client-side module.
// ---------------------------------------------------------------------
export interface SocialPublishSettings {
  facebook_enabled: boolean;
  instagram_enabled: boolean;
  access_token: string;
  facebook_page_id: string;
  instagram_business_account_id: string;
  // Threads uses a completely separate Meta app/OAuth (graph.threads.net) —
  // its own access token and its own user id, not the Page token above.
  threads_enabled: boolean;
  threads_access_token: string;
  threads_user_id: string;
  caption_template: string;
}

const DEFAULT_SOCIAL_PUBLISH_SETTINGS: SocialPublishSettings = {
  facebook_enabled: false,
  instagram_enabled: false,
  access_token: '',
  facebook_page_id: '',
  instagram_business_account_id: '',
  threads_enabled: false,
  threads_access_token: '',
  threads_user_id: '',
  caption_template: '✨ New Arrival: {name}\n\n{description}\n\nPrice: ₹{price}\nShop now: {url}',
};

// fetchSocialPublishSettings()/saveSocialPublishSettings() were removed
// from here — this key holds live Facebook/Instagram/Threads access
// tokens and must never be read/written with the public anon key.
// Use app/api/admin/settings/social-publish (admin-token protected,
// service-role client) instead.

export type EmailProvider = 'resend' | 'zeptomail' | '';

export interface EmailSettings {
  provider: EmailProvider;
  api_key: string;
  sender_email: string;
  sender_name: string;
  // ZeptoMail is hosted regionally — India (.in) vs global (.com) accounts
  // use different API base URLs. Ignored by Resend.
  zeptomail_region: 'in' | 'com';
}

const DEFAULT_EMAIL_SETTINGS: EmailSettings = {
  provider: '',
  api_key: '',
  sender_email: '',
  sender_name: 'AruhiHandlooms',
  zeptomail_region: 'in',
};

// fetchEmailSettings()/saveEmailSettings() were removed from here —
// this key holds a live email-provider API key and must never be
// read/written with the public anon key. Use
// app/api/admin/settings/email (admin-token protected, service-role
// client) instead.

// Models this project has confirmed working against the free NVIDIA
// NIM API key that also powers Admin > Products > "Generate with AI".
// Swap here any time NVIDIA enables/retires a model on your account —
// no redeploy needed.
export const AI_CHAT_MODEL_OPTIONS = [
  { value: 'meta/llama-3.3-70b-instruct', label: 'Llama 3.3 70B Instruct (recommended)' },
  { value: 'meta/llama-3.1-70b-instruct', label: 'Llama 3.1 70B Instruct' },
  { value: 'meta/llama-3.2-90b-vision-instruct', label: 'Llama 3.2 90B Vision Instruct' },
  { value: 'mistralai/mixtral-8x22b-instruct-v0.1', label: 'Mixtral 8x22B Instruct' },
  { value: 'qwen/qwen2.5-7b-instruct', label: 'Qwen 2.5 7B Instruct (fastest)' },
] as const;

export interface AiChatSettings {
  enabled: boolean;
  primary_model: string;
  fallback_model: string;
}

// NOTE: as of 2026-09-03, NVIDIA is retiring free-tier NIM models fast
// enough that pinning specific model names here just goes stale again
// within days (confirmed dead in one week: the entire Llama 3.x lineup,
// Llama 4 Maverick, Nemotron-Super-49B, Mixtral-8x7b). app/api/chat/ai/
// route.ts now asks NVIDIA's live /v1/models endpoint at request time
// instead of relying on a hardcoded name. Left blank here so a store
// that never customized Admin > Settings > AI Chat Assistant doesn't
// accidentally pin a model that's already dead -- admins can still type
// a specific model in that panel to force it, but it's optional.
export const DEFAULT_AI_CHAT_SETTINGS: AiChatSettings = {
  enabled: true,
  primary_model: '',
  fallback_model: '',
};

export async function fetchAiChatSettings(): Promise<AiChatSettings> {
  const { data, error } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'ai_chat')
    .maybeSingle();
  if (error || !data) return DEFAULT_AI_CHAT_SETTINGS;
  return { ...DEFAULT_AI_CHAT_SETTINGS, ...(data.value as Partial<AiChatSettings>) };
}

export async function saveAiChatSettings(settings: AiChatSettings) {
  const { error } = await supabase
    .from('settings')
    .upsert({ key: 'ai_chat', value: settings }, { onConflict: 'key' });
  if (error) throw error;
}

// ---------------------------------------------------------------------
// Phase 4A — vendor handling-fee formula + settlement config.
// fee = handling_fee_base + (sale_price * handling_fee_percent / 100),
// applied by the DB trigger calculate_order_item_settlement_fee()
// (supabase/migrations/20260808000000_phase4a_settlement_schema.sql)
// the moment an order_item's stage becomes 'delivered'. This
// fetch/save pair is provided now so Phase 4B's admin settings screen
// just needs to build a form around it — no new plumbing.
// ---------------------------------------------------------------------
export interface HandlingFeeSettings {
  handling_fee_base: number;
  handling_fee_percent: number;
  return_window_days: number;
}

const DEFAULT_HANDLING_FEE_SETTINGS: HandlingFeeSettings = {
  handling_fee_base: 0,
  handling_fee_percent: 10,
  return_window_days: 7,
};

export async function fetchHandlingFeeSettings(): Promise<HandlingFeeSettings> {
  const { data, error } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'vendor_settlement_settings')
    .maybeSingle();
  if (error || !data) return DEFAULT_HANDLING_FEE_SETTINGS;
  return { ...DEFAULT_HANDLING_FEE_SETTINGS, ...(data.value as Partial<HandlingFeeSettings>) };
}

export async function saveHandlingFeeSettings(settings: HandlingFeeSettings) {
  const { error } = await supabase
    .from('settings')
    .upsert({ key: 'vendor_settlement_settings', value: settings }, { onConflict: 'key' });
  if (error) throw error;
}

/** Mirrors the DB trigger's math client-side, e.g. for an admin preview before saving new fee settings. */
export function calculateHandlingFee(salePrice: number, settings: HandlingFeeSettings): number {
  const fee = settings.handling_fee_base + (salePrice * settings.handling_fee_percent) / 100;
  return Math.min(Math.round(fee * 100) / 100, salePrice);
}

/**
 * Server-only variant (used inside API routes where we don't have a
 * browser session). Importing the client `supabase` singleton from a
 * route handler works fine at runtime, but this keeps the pattern
 * consistent with delhivery-api.ts / other server-side settings reads
 * and avoids depending on a 'use client' module from server code.
 */
export async function fetchAiChatSettingsServer(): Promise<AiChatSettings> {
  const { getServerSupabase } = await import('./supabase-server');
  const serverSupabase = getServerSupabase();
  const { data, error } = await serverSupabase
    .from('settings')
    .select('value')
    .eq('key', 'ai_chat')
    .maybeSingle();
  if (error || !data) return DEFAULT_AI_CHAT_SETTINGS;
  return { ...DEFAULT_AI_CHAT_SETTINGS, ...(data.value as Partial<AiChatSettings>) };
}

// ---------------------------------------------------------------------
// "Search by photo" AI toggle — controls whether the camera-icon search
// in the header uses the real NVIDIA vision model (app/api/image-search)
// to understand what's actually in the shopper's photo (garment type,
// colour, pattern), or falls back to the free, always-available
// client-side colour-fingerprint match in lib/image-search.ts. Same
// NVIDIA_API_KEY as AI Chat / admin listing generation — no extra key
// needed if that's already configured. Admins can flip this off instantly
// (e.g. if the free NVIDIA tier is rate-limited) without a redeploy;
// the feature keeps working either way, just with the simpler matching.
// ---------------------------------------------------------------------
export interface ImageSearchAiSettings {
  enabled: boolean;
}

export const DEFAULT_IMAGE_SEARCH_AI_SETTINGS: ImageSearchAiSettings = {
  enabled: false,
};

export async function fetchImageSearchAiSettings(): Promise<ImageSearchAiSettings> {
  const { data, error } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'image_search_ai')
    .maybeSingle();
  if (error || !data) return DEFAULT_IMAGE_SEARCH_AI_SETTINGS;
  return { ...DEFAULT_IMAGE_SEARCH_AI_SETTINGS, ...(data.value as Partial<ImageSearchAiSettings>) };
}

export async function saveImageSearchAiSettings(settings: ImageSearchAiSettings) {
  const { error } = await supabase
    .from('settings')
    .upsert({ key: 'image_search_ai', value: settings }, { onConflict: 'key' });
  if (error) throw error;
}

/** Server-only variant, same rationale as fetchAiChatSettingsServer above. */
export async function fetchImageSearchAiSettingsServer(): Promise<ImageSearchAiSettings> {
  const { getServerSupabase } = await import('./supabase-server');
  const serverSupabase = getServerSupabase();
  const { data, error } = await serverSupabase
    .from('settings')
    .select('value')
    .eq('key', 'image_search_ai')
    .maybeSingle();
  if (error || !data) return DEFAULT_IMAGE_SEARCH_AI_SETTINGS;
  return { ...DEFAULT_IMAGE_SEARCH_AI_SETTINGS, ...(data.value as Partial<ImageSearchAiSettings>) };
}

// ---------------------------------------------------------------------
// Catalog video autoplay — a single master toggle (Admin > Settings)
// that decides the DEFAULT state of the shopper-facing "Video" switch
// shown next to Filters/Sort on /shop and category pages (see
// app/shop/shop-content.tsx). The per-product `autoplay_video_in_catalog`
// flag (Admin > Products) still decides WHICH products are even eligible
// to show a video at all -- this setting only decides whether that
// preview starts ON or OFF by default for shoppers, who can still flip
// their own session's toggle either way regardless of this default.
// ---------------------------------------------------------------------
export interface CatalogVideoSettings {
  default_enabled: boolean;
}

export const DEFAULT_CATALOG_VIDEO_SETTINGS: CatalogVideoSettings = {
  default_enabled: true,
};

export async function fetchCatalogVideoSettings(): Promise<CatalogVideoSettings> {
  const { data, error } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'catalog_video_autoplay')
    .maybeSingle();
  if (error || !data) return DEFAULT_CATALOG_VIDEO_SETTINGS;
  return { ...DEFAULT_CATALOG_VIDEO_SETTINGS, ...(data.value as Partial<CatalogVideoSettings>) };
}

export async function saveCatalogVideoSettings(settings: CatalogVideoSettings) {
  const { error } = await supabase
    .from('settings')
    .upsert({ key: 'catalog_video_autoplay', value: settings }, { onConflict: 'key' });
  if (error) throw error;
}

// ---------------------------------------------------------------------
// Catalog listing size (Admin > Settings) — controls how many product
// cards load per page/batch on /shop and category pages, and how many
// colour cards a single multi-colour product is allowed to explode into
// in those grids (see lib/expand-product-variants.ts). Both exist purely
// to keep first-load speed in check: showing every colour of every
// product as its own card can multiply the grid's card count several
// times over, so admins who see load times creeping up can pull either
// number down without a code change.
// ---------------------------------------------------------------------
export interface CatalogListingSettings {
  /** Cards shown initially and added per "Load more" click on /shop and
   *  category pages. */
  page_size: number;
  /** Ceiling on how many colour cards one product can contribute to a
   *  listing grid — e.g. 4 means a product with 7 colours only shows its
   *  first 4 as separate cards. 0 disables the explode-into-cards
   *  behaviour entirely, showing one card per product like before. */
  max_variant_cards_per_product: number;
}

export const DEFAULT_CATALOG_LISTING_SETTINGS: CatalogListingSettings = {
  page_size: 24,
  // 20 = the same ceiling the admin "Catalog Listing Size" input caps out
  // at (see components/admin/settings-panel.tsx), i.e. effectively "show
  // every colour" for any real product -- no saree/kurti in this catalog
  // comes in more than a handful of colours. Used to default to 4, which
  // silently hid most of a multi-colour product's variations from the
  // catalog grid until an admin discovered and raised this setting.
  max_variant_cards_per_product: 20,
};

export async function fetchCatalogListingSettings(): Promise<CatalogListingSettings> {
  const { data, error } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'catalog_listing_size')
    .maybeSingle();
  if (error || !data) return DEFAULT_CATALOG_LISTING_SETTINGS;
  return { ...DEFAULT_CATALOG_LISTING_SETTINGS, ...(data.value as Partial<CatalogListingSettings>) };
}

export async function saveCatalogListingSettings(settings: CatalogListingSettings) {
  const { error } = await supabase
    .from('settings')
    .upsert({ key: 'catalog_listing_size', value: settings }, { onConflict: 'key' });
  if (error) throw error;
}

// ---------------------------------------------------------------------
// Media Storage Backend — controls which backend the /media/ proxy tries
// FIRST when serving files (Supabase or R2). Both backends always receive
// new uploads (dual-write), so this toggle only affects serve order, not
// where files are stored.
//
// Saved via /api/admin/media-storage-backend (server-side) so it can also
// purge the Cloudflare edge cache when flipped — same pattern as
// saveMediaDeliverySettings() / media-delivery route.
// ---------------------------------------------------------------------
export interface MediaStorageBackendSettings {
  /** Which backend the /media/ proxy tries FIRST.
   *  The other backend is tried automatically if the first 404s or errors.
   *  'supabase' (default) is always safe; 'r2' requires R2 env vars. */
  backend: 'supabase' | 'r2';
}

export const DEFAULT_MEDIA_STORAGE_BACKEND_SETTINGS: MediaStorageBackendSettings = {
  backend: 'supabase',
};

export async function fetchMediaStorageBackendSettings(): Promise<MediaStorageBackendSettings> {
  const { data, error } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'media_storage_backend')
    .maybeSingle();
  if (error || !data) return DEFAULT_MEDIA_STORAGE_BACKEND_SETTINGS;
  return { ...DEFAULT_MEDIA_STORAGE_BACKEND_SETTINGS, ...(data.value as Partial<MediaStorageBackendSettings>) };
}

export async function saveMediaStorageBackendSettings(settings: MediaStorageBackendSettings) {
  const res = await fetch('/api/admin/media-storage-backend', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(json?.error || 'Failed to save media storage backend settings');
  }
  return json as {
    saved: true;
    backend: 'supabase' | 'r2';
    cloudflare_purge: { attempted: boolean; ok: boolean; error?: string };
  };
}

// ---------------------------------------------------------------------
// Shop price-range quick filters — the horizontally scrollable "Under
// ₹499 / ₹499-₹699 / ..." chip bar shown on the Shop page. Admin-managed
// (Admin > Catalog > Price Filters) so the buckets can be added, edited,
// reordered or removed without a code change/deploy.
// ---------------------------------------------------------------------
export interface PriceRangeBucket {
  id: string;
  label: string;
  min: number;
  max: number;
}

export const DEFAULT_PRICE_RANGE_FILTERS: PriceRangeBucket[] = [
  { id: 'pr-1', label: 'Under ₹499', min: 100, max: 499 },
  { id: 'pr-2', label: '₹499 - ₹699', min: 499, max: 699 },
  { id: 'pr-3', label: '₹699 - ₹899', min: 699, max: 899 },
  { id: 'pr-4', label: '₹899 - ₹1000', min: 899, max: 1000 },
  { id: 'pr-5', label: '₹1000 - ₹5000', min: 1000, max: 5000 },
];

export async function fetchPriceRangeFilters(): Promise<PriceRangeBucket[]> {
  const { data, error } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'price_range_filters')
    .maybeSingle();
  if (error || !data) return DEFAULT_PRICE_RANGE_FILTERS;
  const ranges = (data.value as { ranges?: PriceRangeBucket[] } | null)?.ranges;
  if (!Array.isArray(ranges) || ranges.length === 0) return DEFAULT_PRICE_RANGE_FILTERS;
  return ranges;
}

export async function savePriceRangeFilters(ranges: PriceRangeBucket[]) {
  const { error } = await supabase
    .from('settings')
    .upsert({ key: 'price_range_filters', value: { ranges } }, { onConflict: 'key' });
  if (error) throw error;
}

/**
 * Narrows the admin-managed bucket list down to only the buckets that have
 * at least one matching product in `products` -- so "Shop by Price" never
 * shows a band like "₹899 - ₹1000" on a category (or filtered view) that
 * has nothing in it. Pass whatever product set is currently on screen
 * (e.g. category-filtered, or /shop's other active filters applied) --
 * this only checks price, it doesn't re-apply any other filter itself.
 */
export function getAvailablePriceBuckets<T extends { price: number }>(
  buckets: PriceRangeBucket[],
  products: T[]
): PriceRangeBucket[] {
  return buckets.filter((bucket) =>
    products.some((p) => p.price >= bucket.min && p.price <= bucket.max)
  );
}
