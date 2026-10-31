import { getServerSupabase } from './supabase-server';
import { purgeSiteLayoutCache } from './purge-site-cache';
import { fetchShippingSettings, type ShippingSettings } from './pincode-api';

// NOTE: this file is imported from BOTH client components (admin panels,
// WhatsApp/trust-badge widgets, live chat) and server-only code (the
// Google Merchant feed route, the legal pages route, the AI chat route).
// It used to import the `supabase` singleton from './supabase', which is
// marked 'use client' -- that's fine from a Client Component, but Next.js
// throws "Cannot access supabase.from on the server. You cannot dot into
// a client module from a server component." the moment a Server
// Component / Route Handler touches it (this is what broke the
// /api/merchant-feed build). `getServerSupabase()` uses the exact same
// anon-key client config with no 'use client' boundary, so it works
// identically from both the browser and the server.
const supabase = getServerSupabase();

// ---------------------------------------------------------------------
// Fulfillment timing: dispatch window, delivery windows by zone, return
// window, and cancellation window.
//
// This is the SINGLE SOURCE OF TRUTH for every "dispatched in X days" /
// "X-day returns" / "cancel within X hours" claim across the storefront
// (product page, footer badges, checkout trust badges, legal pages, the
// live chat widget, order-return eligibility, and the Google Merchant
// Center feed). Change it once in Admin > Marketing > Shipping & Returns
// Timing and every one of those surfaces stays in sync automatically —
// which is exactly what keeps the on-site claims matching what's
// declared to Google Merchant Center and avoids a shipping/returns
// misrepresentation flag.
// ---------------------------------------------------------------------

export interface FulfillmentSettings {
  dispatch_days_min: number;
  dispatch_days_max: number;
  delivery_metro_min: number;
  delivery_metro_max: number;
  delivery_other_min: number;
  delivery_other_max: number;
  delivery_remote_min: number;
  delivery_remote_max: number;
  return_window_days: number;
  cancellation_window_hours: number;
}

export const DEFAULT_FULFILLMENT_SETTINGS: FulfillmentSettings = {
  dispatch_days_min: 2,
  dispatch_days_max: 3,
  delivery_metro_min: 3,
  delivery_metro_max: 5,
  delivery_other_min: 5,
  delivery_other_max: 8,
  delivery_remote_min: 10,
  delivery_remote_max: 12,
  return_window_days: 7,
  cancellation_window_hours: 24,
};

export async function fetchFulfillmentSettings(): Promise<FulfillmentSettings> {
  const { data, error } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'fulfillment_settings')
    .maybeSingle();
  if (error || !data) return DEFAULT_FULFILLMENT_SETTINGS;
  return { ...DEFAULT_FULFILLMENT_SETTINGS, ...(data.value as Partial<FulfillmentSettings>) };
}

export async function saveFulfillmentSettings(settings: FulfillmentSettings) {
  const { error } = await supabase
    .from('settings')
    .upsert({ key: 'fulfillment_settings', value: settings }, { onConflict: 'key' });
  if (error) throw error;
}

function dayRange(min: number, max: number): string {
  return min === max ? `${min}` : `${min}-${max}`;
}

/** e.g. "2-3 business days" */
export function dispatchWindowText(f: FulfillmentSettings): string {
  return `${dayRange(f.dispatch_days_min, f.dispatch_days_max)} business days`;
}

/** e.g. "3-5 business days after dispatch" */
export function metroDeliveryText(f: FulfillmentSettings): string {
  return `${dayRange(f.delivery_metro_min, f.delivery_metro_max)} business days after dispatch`;
}

/** e.g. "5-8 business days after dispatch" */
export function otherDeliveryText(f: FulfillmentSettings): string {
  return `${dayRange(f.delivery_other_min, f.delivery_other_max)} business days after dispatch`;
}

/** e.g. "up to 10-12 business days" */
export function remoteDeliveryText(f: FulfillmentSettings): string {
  return `up to ${dayRange(f.delivery_remote_min, f.delivery_remote_max)} business days`;
}

/** e.g. "7-day" — for badges like "7-day Returns" */
export function returnWindowBadgeText(f: FulfillmentSettings): string {
  return `${f.return_window_days}-day`;
}

/** e.g. "7 days" — for sentences like "returns within 7 days" */
export function returnWindowText(f: FulfillmentSettings): string {
  return `${f.return_window_days} days`;
}

/** e.g. "12 hours" */
export function cancellationWindowText(f: FulfillmentSettings): string {
  return `${f.cancellation_window_hours} hours`;
}

/** Short one-line summary used on the product page's Shipping & Returns tab. */
export function shippingReturnsSummary(f: FulfillmentSettings, freeShippingThreshold?: number): string {
  const freeShip = freeShippingThreshold
    ? `Free shipping on all orders above Rs ${freeShippingThreshold.toLocaleString('en-IN')}. `
    : '';
  return `${freeShip}Dispatched within ${dispatchWindowText(f)}. ${returnWindowBadgeText(f)} easy returns on unworn items with original packaging.`;
}

// Tokens an admin can drop anywhere inside a Legal Page's text so that
// page always reflects the current numbers from Admin > Marketing >
// Shipping & Returns Timing (plus the shipping fee / free-shipping
// threshold from Admin > Settings > GST & Shipping), instead of typing
// numbers in as plain text that silently go stale the next time those
// settings change. The `shipping` param is optional so existing callers
// that only have FulfillmentSettings keep working unchanged; without it,
// {{shipping_fee}}/{{free_shipping_threshold}} are simply left as-is.
export function applyFulfillmentTokens(
  text: string,
  f: FulfillmentSettings,
  shipping?: Pick<ShippingSettings, 'flat_rate' | 'free_shipping_threshold'>,
): string {
  if (!text) return text;
  let result = text
    .replace(/\{\{\s*dispatch_days\s*\}\}/g, dayRange(f.dispatch_days_min, f.dispatch_days_max))
    .replace(/\{\{\s*metro_days\s*\}\}/g, dayRange(f.delivery_metro_min, f.delivery_metro_max))
    .replace(/\{\{\s*other_days\s*\}\}/g, dayRange(f.delivery_other_min, f.delivery_other_max))
    .replace(/\{\{\s*remote_days\s*\}\}/g, dayRange(f.delivery_remote_min, f.delivery_remote_max))
    .replace(/\{\{\s*return_days\s*\}\}/g, String(f.return_window_days))
    .replace(/\{\{\s*cancellation_hours\s*\}\}/g, String(f.cancellation_window_hours));
  if (shipping) {
    // When the store is configured for free shipping on every order (no
    // minimum order value — threshold 0), the literal "free shipping on
    // orders above Rs 0 / a Rs 0 charge on orders below" phrasing is
    // technically accurate but reads like a broken placeholder to
    // customers. Swap in a clean, unconditional sentence instead, before
    // resolving the raw {{shipping_fee}} / {{free_shipping_threshold}}
    // numbers, so the resolved page never shows "Rs 0" for this line.
    if (shipping.free_shipping_threshold <= 0) {
      result = result.replace(
        /Free shipping on all orders above \{\{\s*free_shipping_threshold\s*\}\}\.\s*A flat shipping charge of \{\{\s*shipping_fee\s*\}\}\s*applies on orders below that amount\./g,
        'We currently offer free shipping on all orders, with no minimum order value.',
      );
    }
    result = result
      .replace(/\{\{\s*shipping_fee\s*\}\}/g, `Rs ${shipping.flat_rate.toLocaleString('en-IN')}`)
      .replace(
        /\{\{\s*free_shipping_threshold\s*\}\}/g,
        `Rs ${shipping.free_shipping_threshold.toLocaleString('en-IN')}`,
      );
  }
  return result;
}

// Ready-to-paste templates — the admin panel's "Insert template" button on
// the Shipping Policy / Refund Policy fields drops this text in, already
// wired up with the tokens above, so future timing changes flow through
// without anyone touching this text again.
export const SHIPPING_POLICY_TEMPLATE = `Where We Ship From
All orders are packed and dispatched from our facility in Naihati, West Bengal, India.

Our Courier Partners
We ship using trusted logistics partners such as Delhivery and Shiprocket (and other reputed courier partners as needed), chosen based on serviceability to your pincode.

Order Processing
Orders are processed and dispatched within {{dispatch_days}} business days of order confirmation, excluding Sundays and public holidays. During sale periods, processing may take slightly longer.

Prepaid, Partial Pay and Cash on Delivery (COD) Orders
Prepaid orders (UPI, cards, netbanking) are confirmed instantly on successful payment and are packed and dispatched ahead of Cash on Delivery orders in our processing queue.

COD orders are confirmed when you tap the one-tap confirmation link we send by email/WhatsApp (or when our team confirms with you by phone/WhatsApp). Confirmed COD orders are dispatched after prepaid and Partial Pay orders, so they may take slightly longer to reach you. We may hold an unconfirmed COD order until it is confirmed.

Partial Pay Orders
Where Partial Pay is offered at checkout, you pay a part of the order total online as an advance (the exact amount is shown at checkout before you pay) and the remaining balance in cash or UPI to our delivery partner when the order arrives. A Partial Pay order is confirmed as soon as the advance is received, and it is packed and dispatched along with prepaid orders, ahead of Cash on Delivery orders. Please keep the balance amount ready at the time of delivery. If delivery is refused or the balance is not paid at the door, the order is returned to us and the advance is treated as described in our Refund & Cancellation Policy.

Where an online-payment discount applies, it is shown at checkout before you pay and applies to full online payment only (not to Partial Pay or COD). Product prices and delivery charges are otherwise the same for every payment method, and the delivery timelines below apply from the date of dispatch for all of them.

Delivery Timelines
Metro cities: {{metro_days}} business days after dispatch
Other cities/towns: {{other_days}} business days after dispatch
Remote/rural areas: may take up to {{remote_days}} business days

These are estimated timelines and may vary depending on courier partner delays, weather conditions, or other unforeseen circumstances.

Shipping Charges
Free shipping on all orders above {{free_shipping_threshold}}. A flat shipping charge of {{shipping_fee}} applies on orders below that amount.

Order Tracking
Once your order is dispatched, you will receive a tracking link via email/WhatsApp/SMS to track your shipment in real time.

Delivery Attempts
Our courier partners typically make up to 2-3 delivery attempts. If delivery is unsuccessful, the order may be returned to us, and you will be contacted to arrange re-delivery (additional shipping charges may apply).

Damaged or Incorrect Items
If you receive a damaged, defective, or incorrect item, please contact us within 48 hours of delivery with photos/video of the product and packaging, and we will arrange a replacement or refund as per our Refund & Cancellation Policy.

International Shipping
We currently ship only within India and do not offer international shipping at this time.`;

export const REFUND_POLICY_TEMPLATE = `Order Cancellation
You may cancel your order within {{cancellation_hours}} hours of placing it, provided it has not already been shipped. To cancel, contact us immediately with your order number.

Returns and Exchanges
We accept returns/exchanges within {{return_days}} days of delivery, provided the item is:

Unworn, unwashed, and unused
In its original packaging with all tags intact
Not a sale/clearance item (unless defective)

Certain items such as blouses that have been stitched or altered as per customer requirements are not eligible for return.

How to Initiate a Return
Contact us with your order number and reason for return. Once approved, we will arrange a free reverse pickup (where serviceable) at no extra cost to you. In areas where reverse pickup is not serviceable, we will share the return address with you and reimburse reasonable return shipping charges once the return is verified.

Refunds
Once we receive and inspect the returned item, refunds will be processed within 5-7 business days to your original payment method. For Cash on Delivery orders, refunds will be issued via bank transfer or store credit, as per your preference.

Damaged or Defective Items
If you receive a damaged, defective, or wrong item, please reach out within 48 hours of delivery with clear photos/video, and we will offer a free replacement or full refund, whichever you prefer.

Partial Pay Orders and Advance Payment
For orders placed using Partial Pay, only the advance is collected online before delivery; the balance is paid on delivery. When the advance is refundable depends on what happens to the order:

1. Cancelled by you before delivery: you may cancel within {{cancellation_hours}} hours of placing the order and before it has shipped, and you will not be asked to pay the balance. The advance is non-refundable in this case, as it covers payment-gateway charges, order processing and handling costs.

2. Refused or undelivered: if the order is refused at the time of delivery, is not accepted by you, or is returned to us because the balance was not paid, the advance is non-refundable, as it covers the outbound and return courier and handling costs we have already incurred.

3. Returned after delivery: if you accept delivery and then return an eligible item as per the Returns and Exchanges section above, you are refunded the amount you actually paid for it. The part paid online (the advance) goes back to your original payment method within 5-7 business days after we receive and inspect the item, and the part you paid in cash or UPI on delivery is refunded via bank transfer or store credit, as per your preference.

4. Cancelled by us: if we cancel your order (for example due to stock unavailability or a pricing error), or you receive a damaged, defective or wrong item, the advance is refunded in full to your original payment method within 5-7 business days.

In exceptional cases we may, at our discretion, refund the advance even where it is otherwise non-refundable.`;

// Sutisaree-specific ready-to-paste templates for Privacy Policy and
// Terms & Conditions. These don't currently carry {{fulfillment}} tokens
// (nothing in the source text maps to a Fulfillment Settings number), but
// they're still run through applyFulfillmentTokens() on display like the
// other two, so any tokens added here later resolve automatically without
// further code changes.
export const PRIVACY_POLICY_TEMPLATE = `Sutisaree ("we", "us", "our") operates the website sutisaree.com. This Privacy Policy explains how we collect, use, store and protect your personal information when you visit our website or make a purchase.

Information We Collect
We collect information you provide directly to us, including your name, email address, phone number, shipping and billing address, and payment details when you place an order, create an account, or contact us. We also automatically collect certain information such as your IP address, browser type, and browsing behaviour on our site through cookies and analytics tools.

If you take part in optional programs on our site, we also collect information needed to run them: your loyalty points balance and history if you join our loyalty program; your unique referral code and the status of people you refer if you use our referral program; the recipient's name and email address if you purchase a gift card for someone else; your business name and reseller/wholesale account details if you join our reseller or wholesale programs; and the name, rating, comment, and any photos you submit if you write a product review (which may be displayed publicly on the relevant product page).

How You Found Us and Your Device
When you place an order, we save basic, non-identifying information on our own servers about how you reached our website (for example Google, Instagram, WhatsApp, an email link or an advertisement), the campaign name if there is one, the first page you landed on, and a general device category (such as Mobile or Desktop, Android or iOS, and your browser). We use this only to understand which channels bring us customers and to improve our website. The source and device information saved with your order is limited to these general categories and does not include your IP address, your full browser details, or full web addresses with their tracking parameters.

How We Use Your Information
We use your information to:
Process and fulfil your orders, including shipping and delivery
Communicate with you about your orders (including confirming Cash on Delivery orders by email, WhatsApp, or SMS), account, or customer service requests
Send you promotional emails or WhatsApp messages, only if you have opted in
Operate optional programs you choose to join, such as loyalty points, referrals, gift cards, coupons, and reseller/wholesale accounts, and to calculate and apply any related rewards or discounts
Display product reviews and ratings you choose to submit
Improve our website, products, and customer experience
Detect and prevent fraud, including misuse of discounts, referral codes, or gift cards

Payment Information
All payments are processed through secure, PCI-DSS compliant payment gateways (including Razorpay). We do not store your full card details on our servers. This includes advance payments made under our Partial Pay option. Where we offer an additional discount for paying online in full instead of Cash on Delivery, this is applied at checkout only and does not involve collecting any extra personal information beyond your chosen payment method.

Sharing of Information
We do not sell your personal information. We may share your information with trusted third parties who help us operate our business, including payment processors, shipping and logistics partners (such as Delhivery), and email/SMS service providers, solely for the purpose of fulfilling your order and communicating with you.

Google Customer Reviews
After you place an order, Google may ask whether you would like to receive a survey about it. If you agree, we share your order number, email address, delivery country and estimated delivery date with Google so that it can send you a review request. Google's use of this information is governed by Google's own Privacy Policy.

Cookies
Our website uses cookies to remember your cart, preferences, and to understand how visitors use our site. You can disable cookies through your browser settings, though some features of the site may not work correctly as a result.

Data Security
We take reasonable technical and organisational measures to protect your personal information from unauthorised access, alteration, or disclosure.

Your Rights
You may request access to, correction of, or deletion of your personal data by contacting us at contact@sutisaree.com. You may also unsubscribe from marketing communications at any time.

Children's Privacy
Our website is not directed at children under 18. We do not knowingly collect personal information from children.

Changes to This Policy
We may update this Privacy Policy from time to time. Any changes will be posted on this page with an updated "Last updated" date.

Contact Us
If you have any questions about this Privacy Policy, please contact us at:
Email: contact@sutisaree.com
Phone: +91 98045 91992
Address: Bora, Mamudpur, Naihati, North 24 Parganas, West Bengal - 743166`;

export const TERMS_CONDITIONS_TEMPLATE = `Welcome to Sutisaree (sutisaree.com). By accessing or using our website, you agree to be bound by the following Terms & Conditions. Please read them carefully before making a purchase.

General
These terms apply to all visitors, users, and customers of sutisaree.com. By placing an order, you confirm that you are at least 18 years old or are using the site under the supervision of a parent/guardian.

Products
We make every effort to display our products, including colours and fabric details, as accurately as possible. However, slight variations in colour may occur due to photography, lighting, and screen settings, as our sarees and ethnic wear are handwoven/handcrafted and may have natural variations.

Pricing and Payment
All prices listed on the website are in Indian Rupees (INR) and are inclusive of applicable taxes unless stated otherwise. We accept payments through the payment methods listed at checkout. We reserve the right to change prices at any time without prior notice, though this will not affect orders already confirmed.

Partial Pay
Where offered at checkout, Partial Pay lets you pay an advance online (the amount is shown before you pay) and the remaining balance in cash or UPI on delivery. The order is confirmed when the advance is received and is dispatched along with prepaid orders, ahead of Cash on Delivery orders. If you refuse delivery, are unreachable, or do not pay the balance at the door, the order is returned to us and the advance is retained to cover courier and handling costs, as described in our Refund & Cancellation Policy. If you cancel the order yourself before delivery, or refuse delivery, the advance is non-refundable (and the balance is not charged). The advance is refunded if we cancel the order, if you receive a damaged, defective or wrong item, or if you return an eligible item after delivery, as described in our Refund & Cancellation Policy. The online-payment discount does not apply to Partial Pay orders.

Order Confirmation
A prepaid order, or a Partial Pay order, is confirmed once your online payment (in full, or the advance) is successful and you receive an order confirmation email/message from us. A Cash on Delivery (COD) order is confirmed when you confirm it using the link we send by email/WhatsApp, or when our team confirms it with you by phone/WhatsApp; we may hold dispatch of a COD order until it is confirmed and may cancel it if we are unable to confirm it with you within a reasonable time. We reserve the right to cancel any order due to stock unavailability, pricing errors, or suspected fraudulent activity, in which case any amount you have paid will be refunded in full.

Discounts, Coupons and Online Payment Discount
From time to time we may offer coupon codes, checkout add-on offers, or an additional discount for choosing to pay online in full instead of Cash on Delivery. Any such discount is shown to you at checkout before you complete your order and applies only to that order; it is not a permanent price reduction, cannot be combined with other offers unless stated, has no cash value, and may be changed, withdrawn, or restricted (including by order value, product, or payment method) at our discretion without prior notice.

Promotional Offers (e.g. "Buy 2 Get 1 Free")
From time to time we may run bundle offers such as "Buy 2 Get 1 Free," "Buy 3 Get 1 Free," or similar. Unless stated otherwise on the offer banner, the lowest-priced eligible item in your qualifying combination is the one provided free of cost; the offer applies only to the products/categories specified in the promotion and is valid only for the period displayed on the site. Such offers cannot be combined with other coupon codes or discounts unless explicitly stated, are subject to stock availability, and may be modified, withdrawn, or restricted at our discretion without prior notice, though this will not affect orders already confirmed. If any item from a qualifying bundle is returned, the refund will be recalculated based on the actual price paid for the remaining items (i.e. the discount/free-item benefit tied to the returned item will be adjusted accordingly).

Loyalty Points Program
If enabled, our loyalty program lets you earn points on qualifying purchases, which can be redeemed for a discount on future orders once you reach the minimum redemption threshold shown on the site. Points have no cash value, are non-transferable, cannot be sold or exchanged, may be reversed if the related order is cancelled or returned, and may expire or be adjusted as described in the program details on the site. We reserve the right to modify, suspend, or discontinue the loyalty program at any time.

Referral Program
If enabled, our referral program lets existing customers invite others to shop with us in exchange for reward points for both the referrer and the referred customer, as described on the site at the time of referral. Referral rewards are credited only once the referred customer's qualifying order is completed and are subject to the same non-cash, non-transferable terms as loyalty points. We reserve the right to withhold or reverse rewards, and to suspend accounts, in cases of suspected abuse, self-referral, or fraud, and may modify or discontinue the program at any time.

Gift Cards
Gift cards purchased on our site are valid for the period shown at the time of purchase from the date of issue, are redeemable only for purchases on sutisaree.com, cannot be redeemed for cash (in whole or in part) except where required by law, and are non-refundable once issued. You are responsible for keeping your gift card code secure; we are not liable for gift cards lost, stolen, or redeemed without authorisation due to a code being shared or compromised. Unused balances after expiry may be forfeited, subject to applicable law.

Reseller and Wholesale Program
We may allow eligible customers to join our reseller or wholesale program to purchase products at a different price for resale, subject to the terms shown at the time of joining. Participants in this program act on their own behalf and are independently responsible for their own pricing, marketing, and representations to their end-customers; Sutisaree is not a party to and is not liable for arrangements between a reseller/wholesale participant and their customers. We reserve the right to approve, suspend, or terminate any reseller or wholesale account at our discretion.

Product Reviews
When you submit a product review, you confirm the content is your own genuine opinion and that you have not been paid or incentivised to post it unless we have explicitly disclosed otherwise. We may moderate, edit for length, or decline to publish reviews that are abusive, irrelevant, contain personal information about others, or otherwise violate these Terms, and may remove any review at our discretion.

Intellectual Property
All content on this website, including images, logos, and text, is the property of Sutisaree and may not be reproduced or used without our written permission.

Limitation of Liability
Sutisaree shall not be liable for any indirect, incidental, or consequential damages arising from the use of our website or products, to the extent permitted by law.

Governing Law
These Terms & Conditions are governed by the laws of India. Any disputes shall be subject to the jurisdiction of the courts in North 24 Parganas, West Bengal, India.

Changes to Terms
We may revise these Terms & Conditions at any time. Continued use of the website after changes are posted constitutes acceptance of the revised terms.

Contact Us
For any questions regarding these Terms & Conditions, contact us at:
Email: contact@sutisaree.com
Phone: +91 98045 91992`;

// ---------------------------------------------------------------------
// Legal pages (Privacy Policy, Terms, Shipping Policy, Refund Policy)
// Stored as one settings row (key = 'legal_pages') so the admin can edit
// all four from one panel without a schema migration.
// ---------------------------------------------------------------------

export type LegalSlug = 'privacy-policy' | 'terms-conditions' | 'shipping-policy' | 'refund-policy';

export interface LegalPages {
  'privacy-policy': string;
  'terms-conditions': string;
  'shipping-policy': string;
  'refund-policy': string;
}

export const LEGAL_PAGE_TITLES: Record<LegalSlug, string> = {
  'privacy-policy': 'Privacy Policy',
  'terms-conditions': 'Terms & Conditions',
  'shipping-policy': 'Shipping Policy',
  'refund-policy': 'Refund & Cancellation Policy',
};

const DEFAULT_LEGAL_PAGES: LegalPages = {
  'privacy-policy': PRIVACY_POLICY_TEMPLATE,
  'terms-conditions': TERMS_CONDITIONS_TEMPLATE,
  'shipping-policy': SHIPPING_POLICY_TEMPLATE,
  'refund-policy': REFUND_POLICY_TEMPLATE,
};

export async function fetchLegalPages(): Promise<LegalPages> {
  const { data, error } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'legal_pages')
    .maybeSingle();
  if (error || !data) return DEFAULT_LEGAL_PAGES;
  return { ...DEFAULT_LEGAL_PAGES, ...(data.value as Partial<LegalPages>) };
}

export async function saveLegalPages(pages: LegalPages) {
  const { error } = await supabase
    .from('settings')
    .upsert({ key: 'legal_pages', value: pages }, { onConflict: 'key' });
  if (error) throw error;
}

// Same as fetchLegalPages(), but with {{tokens}} already replaced by the
// live Fulfillment Settings numbers. Use this for anything that DISPLAYS
// legal-page text to a shopper (the public /legal/[slug] pages, the live
// chat widget, the AI chat assistant). Do NOT use this for the admin
// editor — it needs the raw, unresolved text so saving it back doesn't
// bake today's numbers in and destroy the tokens.
export async function fetchLegalPagesResolved(): Promise<LegalPages> {
  const [pages, fulfillment, shipping] = await Promise.all([
    fetchLegalPages(),
    fetchFulfillmentSettings(),
    fetchShippingSettings(),
  ]);
  return {
    'privacy-policy': applyFulfillmentTokens(pages['privacy-policy'], fulfillment, shipping),
    'terms-conditions': applyFulfillmentTokens(pages['terms-conditions'], fulfillment, shipping),
    'shipping-policy': applyFulfillmentTokens(pages['shipping-policy'], fulfillment, shipping),
    'refund-policy': applyFulfillmentTokens(pages['refund-policy'], fulfillment, shipping),
  };
}

// ---------------------------------------------------------------------
// Marketing settings: WhatsApp chat widget + Google Merchant feed toggle
// ---------------------------------------------------------------------

export interface MarketingSettings {
  whatsapp_enabled: boolean;
  whatsapp_chat_widget_enabled: boolean; // separate toggle: WhatsApp bar inside the on-site chat popup
  whatsapp_number: string; // digits only, with country code e.g. 919876543210
  whatsapp_message: string;
  merchant_feed_enabled: boolean;
  merchant_feed_brand: string;
  newsletter_enabled: boolean;
}

const DEFAULT_MARKETING_SETTINGS: MarketingSettings = {
  whatsapp_enabled: false,
  whatsapp_chat_widget_enabled: false,
  whatsapp_number: '',
  whatsapp_message: 'Hi! I have a question about your products.',
  merchant_feed_enabled: true,
  merchant_feed_brand: 'Sutisaree',
  newsletter_enabled: true,
};

export async function fetchMarketingSettings(): Promise<MarketingSettings> {
  const { data, error } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'marketing_settings')
    .maybeSingle();
  if (error || !data) return DEFAULT_MARKETING_SETTINGS;
  return { ...DEFAULT_MARKETING_SETTINGS, ...(data.value as Partial<MarketingSettings>) };
}

export async function saveMarketingSettings(settings: MarketingSettings) {
  const { error } = await supabase
    .from('settings')
    .upsert({ key: 'marketing_settings', value: settings }, { onConflict: 'key' });
  if (error) throw error;
}

// ---------------------------------------------------------------------
// Newsletter subscribers
// ---------------------------------------------------------------------

export interface NewsletterSubscriber {
  id: string;
  email: string;
  source: string | null;
  created_at: string;
}

export async function subscribeToNewsletter(email: string, source = 'footer') {
  const trimmed = email.trim().toLowerCase();
  const { error } = await supabase
    .from('newsletter_subscribers')
    .insert({ email: trimmed, source });
  if (error) {
    // Postgres unique_violation — treat "already subscribed" as success.
    if ((error as { code?: string }).code === '23505') return;
    throw error;
  }
}

export async function fetchNewsletterSubscribers(): Promise<NewsletterSubscriber[]> {
  // SECURITY: moved server-side — see app/api/admin/newsletter/route.ts.
  const res = await fetch('/api/admin/newsletter');
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Failed to load subscribers');
  return json.subscribers as NewsletterSubscriber[];
}

export async function deleteNewsletterSubscriber(id: string) {
  // SECURITY: moved server-side — see app/api/admin/newsletter/[id]/route.ts.
  const res = await fetch(`/api/admin/newsletter/${id}`, { method: 'DELETE' });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Failed to delete subscriber');
}

// ---------------------------------------------------------------------
// Site-wide SEO settings (homepage / default meta tags)
// Individual product pages already generate their own meta tags from the
// product data itself, so this only covers the site-level defaults used
// as a fallback and on the homepage.
// ---------------------------------------------------------------------

export interface SeoSettings {
  site_title: string;
  meta_description: string;
  keywords: string; // comma-separated, split into an array before use
  og_image: string;
  google_site_verification: string;
  favicon_url: string;
}

const DEFAULT_SEO_SETTINGS: SeoSettings = {
  site_title: 'Sutisaree — Handwoven Indian Ethnic Wear & Sarees',
  meta_description:
    'Discover handpicked sarees, lehengas and ethnic wear from master weavers across India. Timeless craftsmanship, modern convenience.',
  keywords: 'saree, ethnic wear, Indian boutique, handwoven sarees, lehenga, silk saree, banarasi, kanjivaram, bridal saree',
  og_image: '',
  google_site_verification: '',
  favicon_url: '',
};

export async function fetchSeoSettings(): Promise<SeoSettings> {
  const { data, error } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'seo_settings')
    .maybeSingle();
  if (error || !data) return DEFAULT_SEO_SETTINGS;
  return { ...DEFAULT_SEO_SETTINGS, ...(data.value as Partial<SeoSettings>) };
}

export async function saveSeoSettings(settings: SeoSettings) {
  const { error } = await supabase
    .from('settings')
    .upsert({ key: 'seo_settings', value: settings }, { onConflict: 'key' });
  if (error) throw error;
  await purgeSiteLayoutCache();
}

// ---------------------------------------------------------------------
// Analytics: Google Analytics (GA4) + Meta (Facebook) Pixel
// ---------------------------------------------------------------------

export interface AnalyticsSettings {
  gtm_enabled: boolean;
  gtm_container_id: string; // e.g. GTM-XXXXXXX
  google_ads_id: string; // e.g. AW-XXXXXXXXX
  ga_enabled: boolean;
  ga_measurement_id: string; // e.g. G-XXXXXXXXXX
  meta_pixel_enabled: boolean;
  meta_pixel_id: string; // numeric Pixel ID
  trustpilot_enabled: boolean;
  trustpilot_integration_key: string; // Trustpilot > Integrations > Ecommerce > JavaScript Integration
  gcr_badge_enabled: boolean; // Google Customer Reviews badge (store widget) on the storefront
  gcr_optin_enabled: boolean; // Google Customer Reviews survey popup on the order-confirmation page
  // --- Admin > Integrations (Google Ads conversions / Enhanced Conversions / Meta events) ---
  // Conversion LABEL = the part after the slash in  AW-123456789/AbCdEfGh  (Google Ads > Goals > Conversions > Tag setup).
  google_ads_purchase_label: string; // fires on every paid order (the one that matters)
  google_ads_add_to_cart_label: string; // optional secondary conversion
  google_ads_begin_checkout_label: string; // optional secondary conversion
  enhanced_conversions_enabled: boolean; // send hashed email/phone/address with the Ads purchase conversion
  meta_events_enabled: boolean; // Meta Pixel standard events: ViewContent, AddToCart, InitiateCheckout, Purchase
}

const DEFAULT_ANALYTICS_SETTINGS: AnalyticsSettings = {
  ga_enabled: false,
  ga_measurement_id: '',
  gtm_enabled: false,
  gtm_container_id: '',
  google_ads_id: '',
  meta_pixel_enabled: false,
  meta_pixel_id: '',
  trustpilot_enabled: false,
  trustpilot_integration_key: '',
  // Both on by default so nothing changes until an admin switches them off.
  gcr_badge_enabled: true,
  gcr_optin_enabled: true,
  google_ads_purchase_label: '',
  google_ads_add_to_cart_label: '',
  google_ads_begin_checkout_label: '',
  // On by default: harmless until an Ads ID + purchase label exist, and it is what makes conversions match better.
  enhanced_conversions_enabled: true,
  meta_events_enabled: true,
};

export const DEFAULT_ANALYTICS = DEFAULT_ANALYTICS_SETTINGS;

export async function fetchAnalyticsSettings(): Promise<AnalyticsSettings> {
  const { data, error } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'analytics_settings')
    .maybeSingle();
  if (error || !data) return DEFAULT_ANALYTICS_SETTINGS;
  return { ...DEFAULT_ANALYTICS_SETTINGS, ...(data.value as Partial<AnalyticsSettings>) };
}

export async function saveAnalyticsSettings(settings: AnalyticsSettings) {
  const { error } = await supabase
    .from('settings')
    .upsert({ key: 'analytics_settings', value: settings }, { onConflict: 'key' });
  if (error) throw error;
  await purgeSiteLayoutCache();
}
