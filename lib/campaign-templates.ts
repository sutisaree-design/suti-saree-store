import { formatINR, discountPct } from './format';

// The send-campaign route swaps this for a real, per-recipient tracking
// pixel (<img src=".../api/track/open/<id>" .../>) right before sending,
// so "open" is tracked per customer, per send.
export const TRACKING_PIXEL_PLACEHOLDER = '__TRACKING_PIXEL__';

// The send-campaign route swaps this for a real, per-recipient unsubscribe
// link (/api/unsubscribe/<send id>) right before sending -- same per-send
// uuid the tracking pixel reuses, so the link is unique per recipient and
// clicking it can only ever opt out that one person.
export const UNSUBSCRIBE_LINK_PLACEHOLDER = '__UNSUBSCRIBE_LINK__';

// ---------------------------------------------------------------------
// Source-store placeholders: every template now bakes these tokens into
// its html at BUILD time (when we don't yet know which specific customer
// each copy is going to), and the actual sender -- automation.ts's
// sendQueuedEmail for drip/scheduled sends, send-campaign/route.ts for
// immediate manual sends -- swaps them for that one recipient's real
// wording right before dispatch, via resolveSourceStorePlaceholders()
// below. This makes a single built html store-agnostic and safe to reuse
// across a mixed-store recipient list, instead of having to build one
// html per distinct source store up front.
// ---------------------------------------------------------------------
export const SOURCE_STORE_FOOTER_CLAUSE_PLACEHOLDER = '__SOURCE_STORE_FOOTER_CLAUSE__';
export const SOURCE_STORE_INTRO_CLAUSE_PLACEHOLDER = '__SOURCE_STORE_INTRO_CLAUSE__';
export const SOURCE_STORE_NOT_CLAUSE_PLACEHOLDER = '__SOURCE_STORE_NOT_CLAUSE__';

// Turns a saved store URL (e.g. "https://mishaboutique.com") into a clean
// display name for disclosure lines ("you previously purchased from
// mishaboutique.com"). Falls back to the raw string if it isn't a valid
// URL for some reason.
export function storeDisplayName(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

// Swaps every source-store placeholder in `html` for the real wording for
// ONE specific recipient. `sourceStoreName` should already be the final
// display name to use (the caller is responsible for falling back from a
// customer's own source_store_url to the global settings name to nothing,
// in that order -- see storeDisplayName above).
export function resolveSourceStorePlaceholders(html: string, sourceStoreName?: string | null): string {
  const name = sourceStoreName?.trim() || undefined;
  const footerClause = name
    ? `you previously purchased from <strong>${name}</strong>`
    : 'you previously purchased from one of our partner stores';
  const introClause = name
    ? `you previously shopped at <strong>${name}</strong>`
    : 'you previously shopped with one of our partner stores';
  const notClause = name ? ` — not ${name}` : '';
  return html
    .split(SOURCE_STORE_FOOTER_CLAUSE_PLACEHOLDER)
    .join(footerClause)
    .split(SOURCE_STORE_INTRO_CLAUSE_PLACEHOLDER)
    .join(introClause)
    .split(SOURCE_STORE_NOT_CLAUSE_PLACEHOLDER)
    .join(notClause);
}

// Rewrites every real http(s) link in a built campaign email (product
// cards, category circles, "Take A Look" CTA, ...) to go through
// /api/track/click/<send id> first, so we know that *this* recipient
// actually clicked into the site -- this is what promotes someone from
// "cold" (never opened/clicked) to "warm" (clicked) in the admin's
// cold/warm/hot audience view. Must run AFTER the tracking-pixel
// placeholder is swapped (its <img src> is untouched, this only touches
// href="http...") and BEFORE the unsubscribe placeholder is swapped (the
// placeholder text isn't a real http url yet, so it's naturally skipped —
// unsubscribing should never be logged as an engaged click).
export function wrapCampaignLinksForClickTracking(html: string, sendId: string, siteUrl: string): string {
  if (!siteUrl) return html;
  return html.replace(/href="(https?:\/\/[^"]+)"/g, (match, url: string) => {
    if (url.includes('/api/track/click/') || url.includes('/api/unsubscribe/')) return match;
    const target = `${siteUrl}/api/track/click/${sendId}?u=${encodeURIComponent(url)}`;
    return `href="${target}"`;
  });
}

const BRAND_COLOR = '#7c3a1d';
const SITE_NAME = 'AruhiHandlooms';

export interface CampaignProduct {
  id?: string;
  name: string;
  slug: string;
  price: number;
  mrp?: number | null;
  image: string | null;
  url: string;
  category_name?: string | null;
}

export interface CampaignCategory {
  name: string;
  slug: string;
  image: string | null;
  url: string;
}

// Minimal shape needed to render a coupon in a campaign email — matches
// the fields on lib/coupons-api.ts's Coupon type, kept separate so this
// file doesn't have to import the browser supabase client that
// coupons-api.ts pulls in.
export interface CampaignCoupon {
  code: string;
  discount_type: 'percentage' | 'flat';
  discount_value: number;
  min_order_value: number;
}

// Shared "which coupon wins when more than one qualifies" ranking:
// percentage coupons are preferred (they read as a bigger, more
// attention-grabbing offer) over flat ones, then the highest value within
// the same type. Used everywhere "the one best live offer" needs picking
// -- the homepage banner (lib/coupons-api.ts), and here for the campaign
// email banner -- so it always means the same thing.
export function pickBestCampaignCoupon<T extends Pick<CampaignCoupon, 'discount_type' | 'discount_value'>>(
  coupons: T[]
): T | null {
  if (coupons.length === 0) return null;
  const sorted = [...coupons].sort((a, b) => {
    if (a.discount_type !== b.discount_type) {
      return a.discount_type === 'percentage' ? -1 : 1;
    }
    return b.discount_value - a.discount_value;
  });
  return sorted[0];
}

export type CampaignTemplateId = 'festive' | 'new-arrivals' | 'minimal' | 'introduction';

export const CAMPAIGN_TEMPLATES: { id: CampaignTemplateId; label: string; description: string }[] = [
  {
    id: 'introduction',
    label: 'Welcome Introduction',
    description: 'First-contact email for imported contacts — names the store they bought from, introduces us, clear opt-out',
  },
  {
    id: 'festive',
    label: 'Festive Sale',
    description: 'Bold banner + discount badge — best for offers/sale campaigns',
  },
  {
    id: 'new-arrivals',
    label: 'New Arrivals',
    description: 'Clean grid spotlighting fresh products — best for "just launched"',
  },
  {
    id: 'minimal',
    label: 'Minimal & Elegant',
    description: 'Quiet, editorial layout — best for storytelling / brand intro',
  },
];

// Store-agnostic at build time -- embeds the SOURCE_STORE_FOOTER_CLAUSE
// placeholder instead of a baked-in name, so the same built html can be
// resolved differently per recipient right before sending (see
// resolveSourceStorePlaceholders above).
function unsubscribeFooter() {
  return `
    <tr>
      <td style="padding: 20px 24px; text-align: center; font-size: 11px; color: #9a8f87; background:#fffaf5;">
        You're receiving this email because ${SOURCE_STORE_FOOTER_CLAUSE_PLACEHOLDER}.
        <br/>
        <a href="${UNSUBSCRIBE_LINK_PLACEHOLDER}" style="color:#9a8f87; text-decoration:underline;">
          Not interested? Click here and we'll never email you again.
        </a>
        ${TRACKING_PIXEL_PLACEHOLDER}
      </td>
    </tr>`;
}

// Matches the site's actual logo styling (components/header.tsx): "Aruhi" in
// gold/amber, "Handlooms" in maroon, serif, on a light background — not a
// solid brown banner with plain white caps text, which didn't match the
// real site at all.
const LOGO_GOLD = '#e3a840';
const LOGO_MAROON = '#7b1832';

function header() {
  return `
    <tr>
      <td style="background:#fffaf5; padding: 22px 24px; text-align: center; border-bottom: 1px solid #eee2d8;">
        <span style="font-family: Georgia, 'Times New Roman', serif; font-size: 26px; font-weight: bold; letter-spacing: 0.01em;">
          <span style="color:${LOGO_GOLD};">Aruhi</span><span style="color:${LOGO_MAROON};">Handlooms</span>
        </span>
      </td>
    </tr>`;
}

// Static, non-animated version of the homepage's PromoSlider "Become a
// Partner" banner (components/home/promo-slider.tsx). A real JS carousel
// can't run inside an email client, so this renders just its reseller
// slide as one fixed banner — same copy, same maroon background, same
// pill CTA and trust-badge strip underneath — instead of trying (and
// failing) to reproduce the swipe/autoplay behaviour.
function resellerPromoBanner(ctaBaseUrl: string) {
  return `
    <tr>
      <td style="padding: 0 16px 4px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${LOGO_MAROON}; border-radius:12px;">
          <tr>
            <td style="padding: 22px 22px 18px;">
              <p style="margin:0 0 6px; font-size:10px; font-weight:bold; letter-spacing:0.2em; text-transform:uppercase; color:rgba(255,255,255,0.75);">Become A Partner</p>
              <p style="margin:0 0 6px; font-size:19px; font-weight:bold; color:#fff; font-family: Georgia, 'Times New Roman', serif;">Start Reselling, Earn Every Order</p>
              <p style="margin:0 0 14px; font-size:13px; color:rgba(255,255,255,0.85); line-height:1.5;">Set your own markup and sell our handloom collection under your name — zero inventory required.</p>
              <a href="${ctaBaseUrl}/account/reseller" style="display:inline-block; background:rgba(255,255,255,0.18); border:1px solid rgba(255,255,255,0.4); color:#fff; padding:9px 18px; text-decoration:none; border-radius:20px; font-size:12px; font-weight:bold;">Start Reselling →</a>
            </td>
          </tr>
        </table>
        <p style="margin: 10px 0 0; text-align:center; font-size:11px; color:#9a8f87;">
          100% Secure &amp; Verified &nbsp;·&nbsp; Points Never Expire Unused &nbsp;·&nbsp; Trusted by Real Customers
        </p>
      </td>
    </tr>`;
}

// Ticket-style coupon banner — dashed border + gold accents, mirrors the
// site's own coupon chip (components/product/coupon-list.tsx) so it reads
// as the same brand element instead of a generic "sale" graphic. Renders
// nothing when there's no eligible coupon (opts.coupon is null/undefined),
// so campaigns built while no coupon is live/flagged "Show on Product
// Page" look exactly as before -- this is purely additive.
function couponBanner(coupon: CampaignCoupon | null | undefined, ctaUrl: string) {
  if (!coupon) return '';
  const discountLabel = coupon.discount_type === 'percentage' ? `${coupon.discount_value}% OFF` : `${formatINR(coupon.discount_value)} OFF`;
  const minOrderLine =
    coupon.min_order_value > 0 ? `On orders above ${formatINR(coupon.min_order_value)}` : 'No minimum order value';
  return `
    <tr>
      <td style="padding: 0 16px 4px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fdf8f2; border:1.5px dashed ${LOGO_GOLD}; border-radius:12px;">
          <tr>
            <td style="padding: 16px 18px; text-align:center;">
              <p style="margin:0 0 6px; font-size:10px; font-weight:bold; letter-spacing:0.18em; text-transform:uppercase; color:${BRAND_COLOR};">Special Discount For You</p>
              <p style="margin:0 0 10px; font-size:22px; font-weight:bold; color:${LOGO_MAROON}; font-family: Georgia, 'Times New Roman', serif;">${discountLabel}</p>
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 10px;">
                <tr>
                  <td style="border:1.5px dashed ${BRAND_COLOR}; border-radius:6px; padding:8px 18px; font-family: 'Courier New', monospace; font-size:16px; font-weight:bold; letter-spacing:0.1em; color:${BRAND_COLOR};">${coupon.code}</td>
                </tr>
              </table>
              <p style="margin:0 0 14px; font-size:12px; color:#6b5f57;">${minOrderLine}</p>
              <a href="${ctaUrl}" style="display:inline-block; background:${BRAND_COLOR}; color:#fff; padding:10px 26px; text-decoration:none; border-radius:20px; font-size:13px; font-weight:bold;">Shop Now &amp; Save →</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>`;
}

// Mirrors the homepage's "Shop by Category" row — round thumbnails, name
// below, each one a real, clickable link straight to that category page.
// Email clients render <table> layouts far more reliably than flexbox, so
// this is built the same way the product grid is: a table of fixed-width
// cells, wrapped so it naturally goes to a new line every 4 categories.
function categorySection(categories: CampaignCategory[]) {
  if (!categories.length) return '';
  const shown = categories;

  // 4 categories per row (mirrors the homepage's 4-per-row mobile grid).
  const rows: string[] = [];
  for (let i = 0; i < shown.length; i += 4) {
    const rowCells = shown.slice(i, i + 4).map(
      (c) => `
      <td width="25%" style="padding: 6px 4px; text-align:center; vertical-align:top;">
        <a href="${c.url}" style="text-decoration:none; color:#2b2320;">
          ${
            c.image
              ? `<img src="${c.image}" width="64" height="64" alt="${c.name}" style="width:64px; height:64px; border-radius:50%; object-fit:cover; display:block; margin:0 auto; border:1px solid #eee2d8;" />`
              : `<div style="width:64px; height:64px; border-radius:50%; background:#f1e9e1; margin:0 auto;"></div>`
          }
          <p style="margin:6px 0 0; font-size:11px; font-weight:600; line-height:1.3;">${c.name}</p>
        </a>
      </td>`
    );
    const pad = 4 - rowCells.length;
    rows.push(`<tr>${rowCells.join('')}${'<td width="25%"></td>'.repeat(pad)}</tr>`);
  }

  return `
    <tr>
      <td style="padding: 6px 16px 4px;">
        <p style="margin:0 0 10px; text-align:center; font-size:11px; letter-spacing:0.15em; text-transform:uppercase; color:${BRAND_COLOR}; font-weight:bold;">Shop by Category</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows.join('')}</table>
      </td>
    </tr>`;
}

function productCard(p: CampaignProduct) {
  const pct = discountPct(p.price, p.mrp);
  const imgTag = p.image
    ? `<img src="${p.image}" width="240" alt="${p.name}" style="width:100%; max-width:240px; height:auto; display:block; border-radius: 6px 6px 0 0;" />`
    : `<div style="width:100%; height:180px; background:#f1e9e1; border-radius: 6px 6px 0 0;"></div>`;
  return `
    <td width="50%" style="padding: 8px; vertical-align: top;">
      <a href="${p.url}" style="text-decoration:none; color:#2b2320;">
        <div style="border:1px solid #eee2d8; border-radius:6px; overflow:hidden; background:#fff;">
          ${imgTag}
          <div style="padding: 10px 12px;">
            <p style="margin:0 0 4px; font-size: 13px; font-weight: 600; line-height:1.35; height: 34px; overflow:hidden;">${p.name}</p>
            <p style="margin:0; font-size: 13px;">
              <span style="font-weight:bold; color:${BRAND_COLOR};">${formatINR(p.price)}</span>
              ${p.mrp && pct > 0 ? `<span style="text-decoration:line-through; color:#9a8f87; margin-left:6px; font-size:12px;">${formatINR(p.mrp)}</span> <span style="color:#1f8a4c; font-size:12px;">(${pct}% off)</span>` : ''}
            </p>
            <p style="margin: 8px 0 0; font-size: 12px; color:${BRAND_COLOR}; font-weight:600;">Shop This →</p>
          </div>
        </div>
      </a>
    </td>`;
}

function productGrid(products: CampaignProduct[]) {
  const rows: string[] = [];
  for (let i = 0; i < products.length; i += 2) {
    const pair = products.slice(i, i + 2);
    rows.push(`
      <tr>
        ${pair.map(productCard).join('')}
        ${pair.length === 1 ? '<td width="50%" style="padding:8px;"></td>' : ''}
      </tr>`);
  }
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows.join('')}</table>`;
}

function wrapDocument(bodyRows: string) {
  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  </head>
  <body style="margin:0; padding:0; background:#f4efe9;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4efe9;">
      <tr>
        <td align="center" style="padding: 24px 12px;">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px; max-width:100%; background:#fffaf5; font-family: Georgia, 'Times New Roman', serif; color:#2b2320;">
            ${bodyRows}
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function festiveTemplate(opts: {
  headline: string;
  subheadline?: string;
  discountBadge?: string;
  heroImage?: string | null;
  products: CampaignProduct[];
  categories: CampaignCategory[];
  ctaUrl: string;
  coupon?: CampaignCoupon | null;
  siteUrl: string;
}) {
  const hero = opts.heroImage
    ? `<img src="${opts.heroImage}" width="600" alt="" style="width:100%; max-width:600px; display:block;" />`
    : '';
  return wrapDocument(`
    ${header()}
    <tr>
      <td style="padding:0;">
        ${hero}
        <div style="padding: 28px 24px 8px; text-align:center;">
          ${opts.discountBadge ? `<span style="display:inline-block; background:#fdece0; color:${BRAND_COLOR}; font-weight:bold; font-size:13px; letter-spacing:0.05em; padding:6px 14px; border-radius: 20px; margin-bottom:14px;">${opts.discountBadge}</span>` : ''}
          <h1 style="margin: 0 0 8px; font-size: 26px; color:${BRAND_COLOR};">${opts.headline}</h1>
          ${opts.subheadline ? `<p style="margin:0 0 18px; font-size:14px; color:#6b5f57;">${opts.subheadline}</p>` : ''}
          <a href="${opts.ctaUrl}" style="display:inline-block; background:${BRAND_COLOR}; color:#fff; padding:12px 32px; text-decoration:none; border-radius:4px; font-size:14px; font-weight:bold; margin-bottom: 20px;">Shop Now</a>
        </div>
      </td>
    </tr>
    ${couponBanner(opts.coupon, opts.ctaUrl)}
    ${resellerPromoBanner(opts.siteUrl)}
    ${categorySection(opts.categories)}
    <tr>
      <td style="padding: 8px 16px 20px;">
        ${productGrid(opts.products)}
      </td>
    </tr>
    ${unsubscribeFooter()}
  `);
}

function newArrivalsTemplate(opts: {
  headline: string;
  subheadline?: string;
  products: CampaignProduct[];
  categories: CampaignCategory[];
  ctaUrl: string;
  coupon?: CampaignCoupon | null;
  siteUrl: string;
}) {
  return wrapDocument(`
    ${header()}
    <tr>
      <td style="padding: 28px 24px 8px; text-align:center;">
        <p style="margin:0 0 6px; font-size:12px; letter-spacing:0.15em; text-transform:uppercase; color:${BRAND_COLOR};">Just In</p>
        <h1 style="margin: 0 0 8px; font-size: 24px; color:#2b2320;">${opts.headline}</h1>
        ${opts.subheadline ? `<p style="margin:0 0 18px; font-size:14px; color:#6b5f57;">${opts.subheadline}</p>` : ''}
      </td>
    </tr>
    ${couponBanner(opts.coupon, opts.ctaUrl)}
    ${resellerPromoBanner(opts.siteUrl)}
    ${categorySection(opts.categories)}
    <tr>
      <td style="padding: 8px 16px 12px;">
        ${productGrid(opts.products)}
      </td>
    </tr>
    <tr>
      <td style="padding: 8px 24px 24px; text-align:center;">
        <a href="${opts.ctaUrl}" style="display:inline-block; background:${BRAND_COLOR}; color:#fff; padding:12px 32px; text-decoration:none; border-radius:4px; font-size:14px; font-weight:bold;">View Full Collection</a>
      </td>
    </tr>
    ${unsubscribeFooter()}
  `);
}

function minimalTemplate(opts: {
  headline: string;
  subheadline?: string;
  products: CampaignProduct[];
  categories: CampaignCategory[];
  ctaUrl: string;
  coupon?: CampaignCoupon | null;
  siteUrl: string;
}) {
  return wrapDocument(`
    ${header()}
    <tr>
      <td style="padding: 36px 32px 12px; text-align:center;">
        <h1 style="margin: 0 0 10px; font-size: 22px; font-weight:normal; color:#2b2320;">${opts.headline}</h1>
        ${opts.subheadline ? `<p style="margin:0 0 22px; font-size:14px; color:#6b5f57; line-height:1.6;">${opts.subheadline}</p>` : ''}
      </td>
    </tr>
    ${couponBanner(opts.coupon, opts.ctaUrl)}
    ${resellerPromoBanner(opts.siteUrl)}
    ${categorySection(opts.categories)}
    <tr>
      <td style="padding: 0 16px 8px;">
        ${productGrid(opts.products)}
      </td>
    </tr>
    <tr>
      <td style="padding: 16px 24px 28px; text-align:center;">
        <a href="${opts.ctaUrl}" style="display:inline-block; border:1px solid ${BRAND_COLOR}; color:${BRAND_COLOR}; padding:11px 30px; text-decoration:none; border-radius:4px; font-size:13px; letter-spacing:0.05em;">Explore ${SITE_NAME}</a>
      </td>
    </tr>
    ${unsubscribeFooter()}
  `);
}

// First-contact email for someone imported from another store's WooCommerce
// orders who has never interacted with us before. Its whole job is honest
// re-introduction, not selling: name the store they actually bought from,
// say plainly who we are and why we're emailing, then a real, prominent
// opt-out -- separate from (and above) the small print in the footer --
// so "not interested" is at least as easy to find as "shop now".
function introductionTemplate(opts: {
  headline: string;
  subheadline?: string;
  products: CampaignProduct[];
  categories: CampaignCategory[];
  ctaUrl: string;
  coupon?: CampaignCoupon | null;
}) {
  return wrapDocument(`
    ${header()}
    <tr>
      <td style="padding: 32px 28px 4px; text-align:center;">
        <h1 style="margin: 0 0 12px; font-size: 22px; font-weight:normal; color:#2b2320;">${opts.headline}</h1>
        <p style="margin:0 0 18px; font-size:14px; color:#6b5f57; line-height:1.7;">
          We're reaching out because ${SOURCE_STORE_INTRO_CLAUSE_PLACEHOLDER}. ${SITE_NAME} is a separate,
          new store${SOURCE_STORE_NOT_CLAUSE_PLACEHOLDER} — and this is the only email
          you'll get introducing us.
          ${opts.subheadline ? opts.subheadline : ''}
        </p>
      </td>
    </tr>
    <tr>
      <td style="padding: 0 24px 24px; text-align:center;">
        <a href="${opts.ctaUrl}" style="display:inline-block; background:${BRAND_COLOR}; color:#fff; padding:12px 32px; text-decoration:none; border-radius:4px; font-size:14px; font-weight:bold; margin-right:10px;">Take A Look</a>
        <a href="${UNSUBSCRIBE_LINK_PLACEHOLDER}" style="display:inline-block; border:1px solid #9a8f87; color:#6b5f57; padding:11px 24px; text-decoration:none; border-radius:4px; font-size:13px;">Not Interested</a>
      </td>
    </tr>
    ${couponBanner(opts.coupon, opts.ctaUrl)}
    ${categorySection(opts.categories)}
    <tr>
      <td style="padding: 8px 16px 20px;">
        ${productGrid(opts.products)}
      </td>
    </tr>
    ${unsubscribeFooter()}
  `);
}

export function buildPremiumCampaignHtml(opts: {
  templateId: CampaignTemplateId;
  headline: string;
  subheadline?: string;
  discountBadge?: string;
  products: CampaignProduct[];
  categories?: CampaignCategory[];
  heroImage?: string | null;
  // Fetched fresh each time an email is built (see fetchTopCampaignCoupon
  // in woocommerce-automation.ts, and the panel's applyTemplate) -- so a
  // template always reflects whichever coupon is CURRENTLY active and
  // flagged "Show on Product Page" in Admin > Coupons, with zero code
  // changes needed when that changes. null/undefined = no eligible coupon
  // right now, banner simply doesn't render.
  coupon?: CampaignCoupon | null;
}): string {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || '';
  const ctaUrl = `${siteUrl}/shop`;
  const categories = opts.categories ?? [];

  switch (opts.templateId) {
    case 'introduction':
      // No reseller promo banner here on purpose — this email's whole job
      // is an honest, low-pressure re-introduction with a clear opt-out;
      // an upsell banner would undercut that.
      return introductionTemplate({ ...opts, categories, ctaUrl });
    case 'festive':
      return festiveTemplate({ ...opts, categories, ctaUrl, siteUrl });
    case 'new-arrivals':
      return newArrivalsTemplate({ ...opts, categories, ctaUrl, siteUrl });
    case 'minimal':
    default:
      return minimalTemplate({ ...opts, categories, ctaUrl, siteUrl });
  }
}
