/**
 * First-party "where did this order come from" tracking.
 *
 * What it does
 *  - On a visitor's landing page load, looks at the URL's campaign params
 *    (utm_*, gclid/gbraid/wbraid, fbclid, msclkid) and `document.referrer`
 *    and works out a human label: "Google Ads", "Google Organic", "ChatGPT",
 *    "Instagram", "Meta Ads", "Direct", ...
 *  - Remembers the FIRST touch and the LAST non-direct touch in localStorage
 *    for 30 days (same idea as the affiliate-code capture in affiliate-api.ts).
 *  - At checkout, the order id + this summary is sent to our own server
 *    (POST /api/orders/[id]/attribution) and stored on the order, so the admin
 *    can see it in Admin > Orders.
 *
 * Privacy / Google-policy notes (keep these true if you edit this file)
 *  - Everything stays first-party: nothing here is sent to Google, Meta or any
 *    other third party. We only READ the click-id params; the raw click ids are
 *    never stored.
 *  - No IP address, no raw user-agent string, no query string (only the path of
 *    the landing page) and no personal data are saved. Device info is just a
 *    coarse category (Mobile/Tablet/Desktop + OS + browser name) -- this is not
 *    fingerprinting.
 *  - Add a line about this to the Privacy Policy (see the note in the PR/chat).
 */

export type AttributionTouch = {
  /** Human label shown in admin, e.g. "Google Ads", "ChatGPT", "Instagram". */
  channel: string;
  /** Lower-case source, e.g. "google", "chatgpt", "facebook", "direct". */
  source: string;
  /** cpc | organic | social | ai | email | referral | paid_social | none ... */
  medium: string;
  campaign?: string;
  referrer_host?: string;
  /** Pathname only -- never the query string. */
  landing_path: string;
  /** ISO timestamp of the touch. */
  at: string;
};

export type AttributionDevice = {
  type: 'Mobile' | 'Tablet' | 'Desktop';
  os: string;
  browser: string;
};

export type OrderAttribution = {
  first: AttributionTouch;
  last: AttributionTouch;
  device: AttributionDevice;
};

type StoredAttribution = { first: AttributionTouch; last: AttributionTouch };

const STORAGE_KEY = 'aruhi_attribution_v1';
const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days, same as affiliate codes

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

const PAID_MEDIUM =
  /^(cpc|ppc|cpm|cpv|paid|paid[-_ ]?search|paid[-_ ]?social|display|shopping|pmax|performance[-_ ]?max|demand[-_ ]?gen|ads?)$/i;

function hostMatches(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}
function hostIn(host: string, domains: string[]): boolean {
  return !!host && domains.some((d) => hostMatches(host, d));
}

const AI_ASSISTANTS: { name: string; hosts: string[]; utm: string[] }[] = [
  { name: 'ChatGPT', hosts: ['chatgpt.com', 'chat.openai.com', 'openai.com'], utm: ['chatgpt.com', 'chatgpt', 'openai'] },
  { name: 'Perplexity', hosts: ['perplexity.ai'], utm: ['perplexity', 'perplexity.ai'] },
  { name: 'Gemini', hosts: ['gemini.google.com', 'bard.google.com'], utm: ['gemini', 'bard'] },
  { name: 'Copilot', hosts: ['copilot.microsoft.com', 'copilot.com'], utm: ['copilot'] },
  { name: 'Claude', hosts: ['claude.ai'], utm: ['claude', 'claude.ai'] },
  { name: 'Grok', hosts: ['grok.com'], utm: ['grok'] },
  { name: 'DeepSeek', hosts: ['deepseek.com'], utm: ['deepseek'] },
];

const SEARCH_ENGINES: { name: string; test: (host: string) => boolean }[] = [
  { name: 'Google', test: (h) => /(^|\.)google\.[a-z.]+$/.test(h) },
  { name: 'Bing', test: (h) => hostMatches(h, 'bing.com') },
  { name: 'DuckDuckGo', test: (h) => hostMatches(h, 'duckduckgo.com') },
  { name: 'Yahoo', test: (h) => hostMatches(h, 'yahoo.com') && !h.startsWith('mail.') },
  { name: 'Ecosia', test: (h) => hostMatches(h, 'ecosia.org') },
  { name: 'Brave Search', test: (h) => h === 'search.brave.com' },
  { name: 'Yandex', test: (h) => /(^|\.)yandex\./.test(h) },
  { name: 'Baidu', test: (h) => hostMatches(h, 'baidu.com') },
];

const SOCIAL: { name: string; hosts: string[]; utm: string[] }[] = [
  { name: 'YouTube', hosts: ['youtube.com', 'youtu.be'], utm: ['youtube', 'yt'] },
  { name: 'Pinterest', hosts: ['pinterest.com', 'pinterest.co.in', 'pinterest.co.uk', 'pinterest.ca', 'pin.it'], utm: ['pinterest'] },
  { name: 'X (Twitter)', hosts: ['t.co', 'twitter.com', 'x.com'], utm: ['twitter', 'x'] },
  { name: 'LinkedIn', hosts: ['linkedin.com', 'lnkd.in'], utm: ['linkedin'] },
  { name: 'Reddit', hosts: ['reddit.com', 'redd.it'], utm: ['reddit'] },
  { name: 'Threads', hosts: ['threads.net'], utm: ['threads'] },
  { name: 'Snapchat', hosts: ['snapchat.com'], utm: ['snapchat'] },
  { name: 'Telegram', hosts: ['t.me', 'telegram.org', 'telegram.me'], utm: ['telegram'] },
];

const WHATSAPP_HOSTS = ['wa.me', 'whatsapp.com'];
const EMAIL_HOSTS = ['mail.google.com', 'outlook.live.com', 'outlook.office.com', 'mail.yahoo.com'];
const EMAIL_UTM = ['email', 'newsletter', 'mailchimp', 'klaviyo', 'brevo', 'sendinblue', 'sendgrid', 'omnisend'];

// Referrers that are NOT a real traffic source: payment pages bouncing the
// shopper back, login pages, our own backend. Seeing one of these must never
// replace the real source the shopper originally came from.
const IGNORED_REFERRER_HOSTS = [
  'razorpay.com',
  'paytm.com',
  'phonepe.com',
  'pay.google.com',
  'accounts.google.com',
  'supabase.co',
  'cashfree.com',
  'payu.in',
];

const META_UTM = ['facebook', 'fb', 'instagram', 'ig', 'meta', 'facebook.com', 'instagram.com', 'an'];

function titleCase(s: string): string {
  return s
    .split(/[\s_\-.]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function hostOf(url: string): string {
  if (!url) return '';
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

function inAppBrand(ua: string): 'Instagram' | 'Facebook' | 'Pinterest' | 'Snapchat' | null {
  if (/Instagram/i.test(ua)) return 'Instagram';
  if (/FBAN|FBAV|FB_IAB|FBIOS/i.test(ua)) return 'Facebook';
  if (/Pinterest/i.test(ua)) return 'Pinterest';
  if (/Snapchat/i.test(ua)) return 'Snapchat';
  return null;
}

export interface ClassifyInput {
  params: URLSearchParams;
  referrer: string;
  ownHost: string;
  ua: string;
  pathname: string;
  now?: Date;
}

/**
 * Returns the traffic touch for this page load, or `null` when this load is
 * NOT a new touch (internal navigation, payment-gateway bounce-back, ...).
 */
export function classifyTouch(input: ClassifyInput): AttributionTouch | null {
  const { params, ua, pathname } = input;
  const at = (input.now ?? new Date()).toISOString();
  const own = input.ownHost.toLowerCase().replace(/^www\./, '');
  const refHost = hostOf(input.referrer);

  const utmSource = (params.get('utm_source') || '').trim().toLowerCase();
  const utmMedium = (params.get('utm_medium') || '').trim().toLowerCase();
  const utmCampaign = (params.get('utm_campaign') || '').trim().slice(0, 120);
  const googleClick = params.has('gclid') || params.has('gbraid') || params.has('wbraid');
  const fbclid = params.has('fbclid');
  const msclkid = params.has('msclkid');
  const hasCampaignSignal = !!(utmSource || utmMedium || googleClick || fbclid || msclkid);

  const internal = !!refHost && (refHost === own || hostMatches(refHost, own) || hostMatches(own, refHost));
  if (internal && !hasCampaignSignal) return null;
  if (hostIn(refHost, IGNORED_REFERRER_HOSTS) && !hasCampaignSignal) return null;

  const ref = internal || hostIn(refHost, IGNORED_REFERRER_HOSTS) ? '' : refHost;
  const paid = PAID_MEDIUM.test(utmMedium);

  const make = (channel: string, source: string, medium: string): AttributionTouch => ({
    channel,
    source,
    medium,
    campaign: utmCampaign || undefined,
    referrer_host: ref || undefined,
    landing_path: pathname.slice(0, 200) || '/',
    at,
  });

  // 1. AI assistants (checked first: gemini.google.com must not count as "Google")
  for (const ai of AI_ASSISTANTS) {
    if (ai.utm.includes(utmSource) || hostIn(ref, ai.hosts)) {
      return make(ai.name, ai.name.toLowerCase(), 'ai');
    }
  }

  // 2. Google Ads (auto-tagged click ids, or UTM-tagged paid Google)
  if (googleClick || (utmSource.includes('google') && paid)) {
    return make('Google Ads', 'google', 'cpc');
  }

  // 3. Bing / Microsoft Ads
  if (msclkid || (utmSource.includes('bing') && paid)) {
    return make('Bing Ads', 'bing', 'cpc');
  }

  // 4. Meta (Facebook / Instagram)
  let metaBrand: 'Instagram' | 'Facebook' | null = null;
  if (utmSource === 'instagram' || utmSource === 'ig' || utmSource === 'instagram.com' || hostIn(ref, ['instagram.com'])) {
    metaBrand = 'Instagram';
  } else if (
    META_UTM.includes(utmSource) ||
    hostIn(ref, ['facebook.com', 'fb.com', 'fb.me', 'messenger.com'])
  ) {
    metaBrand = 'Facebook';
  }
  if (!metaBrand && fbclid) {
    const app = inAppBrand(ua);
    metaBrand = app === 'Instagram' || app === 'Facebook' ? app : null;
  }
  if (metaBrand || fbclid) {
    if (paid) return make('Meta Ads', (metaBrand ?? 'meta').toLowerCase(), 'paid_social');
    return make(metaBrand ?? 'Facebook / Instagram', (metaBrand ?? 'meta').toLowerCase(), 'social');
  }

  // 5. Email
  if (utmMedium === 'email' || EMAIL_UTM.includes(utmSource) || hostIn(ref, EMAIL_HOSTS)) {
    return make('Email', utmSource || 'email', 'email');
  }

  // 6. WhatsApp
  if (utmSource.includes('whatsapp') || hostIn(ref, WHATSAPP_HOSTS)) {
    return make('WhatsApp', 'whatsapp', 'social');
  }

  // 7. Other social platforms
  for (const s of SOCIAL) {
    if (s.utm.includes(utmSource) || hostIn(ref, s.hosts)) {
      return make(paid ? `${s.name} Ads` : s.name, s.name.toLowerCase(), paid ? 'paid_social' : 'social');
    }
  }

  // 8. Search engines (organic unless tagged as paid)
  for (const se of SEARCH_ENGINES) {
    const utmMatch = utmSource && se.name.toLowerCase().replace(/\s/g, '') === utmSource.replace(/\s/g, '');
    if (utmMatch || (ref && se.test(ref))) {
      return make(paid ? `${se.name} Ads` : `${se.name} Organic`, se.name.toLowerCase(), paid ? 'cpc' : 'organic');
    }
  }

  // 9. Any other tagged campaign
  if (utmSource) {
    return make(paid ? `${titleCase(utmSource)} (paid)` : titleCase(utmSource), utmSource, utmMedium || 'campaign');
  }

  // 10. Some other website linked to us
  if (ref) {
    return make('Referral', ref, 'referral');
  }

  // 11. No referrer, but opened inside Instagram/Facebook/Pinterest app browser
  const app = inAppBrand(ua);
  if (app) {
    return make(app, app.toLowerCase(), 'social');
  }

  return make('Direct', 'direct', 'none');
}

// ---------------------------------------------------------------------------
// Device
// ---------------------------------------------------------------------------

export function detectDevice(
  ua: string = typeof navigator !== 'undefined' ? navigator.userAgent : '',
  maxTouchPoints: number = typeof navigator !== 'undefined' ? navigator.maxTouchPoints || 0 : 0,
  platform: string = typeof navigator !== 'undefined' ? navigator.platform || '' : ''
): AttributionDevice {
  // iPadOS 13+ pretends to be a Mac; a touch screen gives it away.
  const isIPad = /iPad/.test(ua) || (/Mac/.test(platform) && maxTouchPoints > 1 && !/iPhone/.test(ua));
  const isIPhone = /iPhone|iPod/.test(ua);
  const isAndroid = /Android/i.test(ua);

  let os = 'Other';
  if (isIPad || isIPhone) os = 'iOS';
  else if (isAndroid) os = 'Android';
  else if (/Windows/i.test(ua)) os = 'Windows';
  else if (/CrOS/.test(ua)) os = 'ChromeOS';
  else if (/Mac OS X|Macintosh/.test(ua)) os = 'macOS';
  else if (/Linux/i.test(ua)) os = 'Linux';

  let type: AttributionDevice['type'] = 'Desktop';
  if (isIPad || /Tablet/i.test(ua) || (isAndroid && !/Mobile/i.test(ua))) type = 'Tablet';
  else if (isIPhone || /Mobi/i.test(ua) || (isAndroid && /Mobile/i.test(ua))) type = 'Mobile';

  let browser = 'Other';
  const app = inAppBrand(ua);
  if (app) browser = `${app} app`;
  else if (/EdgA?\/|Edg\//.test(ua)) browser = 'Edge';
  else if (/SamsungBrowser/i.test(ua)) browser = 'Samsung Internet';
  else if (/OPR\/|Opera/i.test(ua)) browser = 'Opera';
  else if (/Firefox|FxiOS/i.test(ua)) browser = 'Firefox';
  else if (/Chrome|CriOS/i.test(ua)) browser = 'Chrome';
  else if (/Safari/i.test(ua)) browser = 'Safari';

  return { type, os, browser };
}

// ---------------------------------------------------------------------------
// Storage (first touch + last non-direct touch, 30-day expiry)
// ---------------------------------------------------------------------------

function readStored(): StoredAttribution | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredAttribution;
    if (!parsed?.first || !parsed?.last) return null;
    if (Date.now() - new Date(parsed.last.at).getTime() > TTL_MS) {
      window.localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeStored(value: StoredAttribution) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Storage blocked (private mode etc.) -- attribution just won't persist.
  }
}

/**
 * Call once per full page load (see components/attribution-tracker.tsx).
 * `document.referrer` only describes the initial page load, so this must NOT
 * be re-run on client-side route changes.
 */
export function captureAttribution(): void {
  if (typeof window === 'undefined') return;
  try {
    const { pathname, search, hostname } = window.location;
    // Staff browsing the admin / vendor areas is not customer traffic.
    if (pathname.startsWith('/admin') || pathname.startsWith('/vendor')) return;

    const touch = classifyTouch({
      params: new URLSearchParams(search),
      referrer: document.referrer || '',
      ownHost: hostname,
      ua: navigator.userAgent || '',
      pathname,
    });

    const stored = readStored();
    if (!stored) {
      // Very first visit (or the 30 days ran out): this touch is both first and last.
      const t =
        touch ??
        ({
          channel: 'Direct',
          source: 'direct',
          medium: 'none',
          landing_path: pathname.slice(0, 200) || '/',
          at: new Date().toISOString(),
        } as AttributionTouch);
      writeStored({ first: t, last: t });
      return;
    }

    if (!touch) return; // internal navigation / payment bounce-back
    if (touch.channel === 'Direct') return; // keep the last NON-direct source
    const l = stored.last;
    if (l.channel === touch.channel && l.source === touch.source && (l.campaign || '') === (touch.campaign || '')) {
      return; // same source again, nothing new to record
    }
    writeStored({ first: stored.first, last: touch });
  } catch {
    // Attribution must never break the storefront.
  }
}

/** What gets attached to an order at checkout. Always returns something. */
export function getAttributionForOrder(): OrderAttribution {
  const device = detectDevice();
  const stored = typeof window !== 'undefined' ? readStored() : null;
  if (stored) return { first: stored.first, last: stored.last, device };
  const t: AttributionTouch = {
    channel: 'Direct',
    source: 'direct',
    medium: 'none',
    landing_path: '/',
    at: new Date().toISOString(),
  };
  return { first: t, last: t, device };
}

/**
 * Fire-and-forget: tells our server which source/device this order came from.
 * Never throws, never blocks checkout -- if it fails the order is simply
 * stored without a source.
 */
export function saveOrderAttribution(orderId: string): void {
  if (typeof window === 'undefined' || !orderId) return;
  try {
    void fetch(`/api/orders/${encodeURIComponent(orderId)}/attribution`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ attribution: getAttributionForOrder() }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // ignore
  }
}
