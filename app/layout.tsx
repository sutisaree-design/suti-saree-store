import './globals.css';
import type { Metadata } from 'next';
import { Inter, Playfair_Display } from 'next/font/google';
import Script from 'next/script';
import Providers from '@/components/providers';
import AnalyticsScripts from '@/components/analytics-scripts';
import BlurPlaceholderSync from '@/components/blur-placeholder-sync';
import GoogleCustomerReviewsBadge from '@/components/analytics/google-customer-reviews-badge';
import { getServerSupabase } from '@/lib/supabase-server';
import { getStorefrontChromeSettings } from '@/lib/storefront-settings-server';
import { SeoSettings, AnalyticsSettings } from '@/lib/marketing-api';
import { PaymentDiscountSettings, DEFAULT_PAYMENT_DISCOUNT_SETTINGS } from '@/lib/settings-api';
import { getResponsiveImagesEnabledServer, syncResponsiveImagesServerGlobal } from '@/lib/responsive-images-flag';
import { getBlurPlaceholderSettingsServer, syncBlurPlaceholderServerGlobal } from '@/lib/blur-placeholder-flag';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

const playfair = Playfair_Display({
  subsets: ['latin'],
  variable: '--font-serif',
  display: 'swap',
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.aruhihandlooms.com';

// NOTE: force-dynamic used to live here to keep SEO/analytics settings
// fresh after an admin save. The problem: dynamic = 'force-dynamic' on the
// ROOT layout overrides every child route's own `revalidate` setting too
// (see app/page.tsx, app/shop/page.tsx, app/product/[slug]/page.tsx, which
// all set `export const revalidate = 60`), forcing the ENTIRE site to
// re-run its Supabase queries and re-render on every single request
// instead of serving a cached page. That's real, avoidable latency on
// every page load, site-wide.
//
// `revalidate` below gives the same "admin changes go live quickly"
// behaviour (within 5 minutes) without disabling caching for the whole
// site. If instant propagation after an admin save is required, replace
// this with an on-demand `revalidatePath('/', 'layout')` call from the
// settings-save API route instead of blanket force-dynamic.
// Vercel ISR-writes fix: 300 -> 1800. Next.js uses the LOWEST `revalidate`
// across layout + page, so this 300 was silently capping app/page.tsx and
// app/category/[slug]/page.tsx (both set to 1800) down to 5 minutes, and
// making every other page without its own value regenerate every 5 minutes.
export const revalidate = 1800;

const DEFAULT_SEO: SeoSettings = {
  site_title: 'AruhiHandlooms — Handwoven Indian Ethnic Wear & Sarees',
  meta_description:
    'Discover handpicked sarees, lehengas and ethnic wear from master weavers across India. Timeless craftsmanship, modern convenience.',
  keywords:
    'saree, ethnic wear, Indian boutique, handwoven sarees, lehenga, silk saree, banarasi, kanjivaram, bridal saree',
  og_image: '',
  google_site_verification: '',
  favicon_url: '',
};

// Reads Admin > Marketing > SEO settings (falls back to sensible defaults
// if nothing has been saved yet, or if Supabase is briefly unreachable).
async function getSeoSettings(): Promise<SeoSettings> {
  try {
    const supabase = getServerSupabase();
    const { data } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'seo_settings')
      .maybeSingle();
    return { ...DEFAULT_SEO, ...((data?.value as Partial<SeoSettings>) || {}) };
  } catch {
    return DEFAULT_SEO;
  }
}

const DEFAULT_ANALYTICS: AnalyticsSettings = {
  ga_enabled: false,
  ga_measurement_id: '',
  gtm_enabled: false,
  gtm_container_id: '',
  google_ads_id: '',
  meta_pixel_enabled: false,
  meta_pixel_id: '',
  trustpilot_enabled: false,
  trustpilot_integration_key: '',
  gcr_badge_enabled: true,
  gcr_optin_enabled: true,
};

// Reads Admin > Marketing > Analytics settings (Google Analytics + Meta
// Pixel). Scripts are only injected when enabled and an ID is present.
async function getAnalyticsSettings(): Promise<AnalyticsSettings> {
  try {
    const supabase = getServerSupabase();
    const { data } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'analytics_settings')
      .maybeSingle();
    return { ...DEFAULT_ANALYTICS, ...((data?.value as Partial<AnalyticsSettings>) || {}) };
  } catch {
    return DEFAULT_ANALYTICS;
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const seo = await getSeoSettings();
  const keywords = seo.keywords
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean);

  return {
    metadataBase: new URL(SITE_URL),
    title: {
      default: seo.site_title,
      template: '%s | AruhiHandlooms',
    },
    description: seo.meta_description,
    keywords,
    // Powers "Install app" on the admin panel (app/manifest.ts, scoped to
    // /admin) -- standalone display, no browser address bar, instead of
    // the plain "Add to Home Screen" bookmark shortcut.
    manifest: '/manifest.webmanifest',
    themeColor: '#721D32',
    appleWebApp: {
      // iOS ignores the web manifest for "Add to Home Screen" and needs
      // these meta tags instead to get the same standalone (no Safari
      // chrome) behaviour there.
      capable: true,
      statusBarStyle: 'default',
      title: 'Aruhi Admin',
    },
    alternates: {
      canonical: '/',
    },
    openGraph: {
      title: seo.site_title,
      description: seo.meta_description,
      siteName: 'AruhiHandlooms',
      type: 'website',
      url: SITE_URL,
      images: seo.og_image ? [{ url: seo.og_image }] : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title: seo.site_title,
      description: seo.meta_description,
      images: seo.og_image ? [seo.og_image] : undefined,
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        'max-image-preview': 'large',
      },
    },
    verification: seo.google_site_verification
      ? { google: seo.google_site_verification }
      : undefined,
  };
}

// Reads Admin > Payments > "extra % off on online payment" incentive
// server-side so the checkout/product-page badge ("Upto ₹X off on prepaid
// orders") is already correct in the very first HTML sent to the browser —
// no client-side round trip to wait on. That round trip is what made the
// badge look "delayed" on mobile: same fetch, but mobile's higher network
// latency made the gap before it appeared much more noticeable than on a
// fast desktop connection.
async function getPaymentDiscountSettings(): Promise<PaymentDiscountSettings> {
  try {
    const supabase = getServerSupabase();
    const { data } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'payment_discount')
      .maybeSingle();
    return { ...DEFAULT_PAYMENT_DISCOUNT_SETTINGS, ...((data?.value as Partial<PaymentDiscountSettings>) || {}) };
  } catch {
    return DEFAULT_PAYMENT_DISCOUNT_SETTINGS;
  }
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const analytics = await getAnalyticsSettings();
  const initialPaymentDiscount = await getPaymentDiscountSettings();
  // Banner / countdown / strips: read once on the server so they are in the
  // first HTML instead of popping in after hydration (layout shift).
  const chrome = await getStorefrontChromeSettings();
  // Responsive Images admin toggle (Admin > Settings). Read once per
  // request, then made available to lib/cloudflare-image-loader.js both
  // on the server (Node global, set below, before children render) and
  // in the browser (inline script in <head>, executed before hydration).
  // Fails safe to `false` (= original URL, unchanged) on any error.
  const responsiveImagesEnabled = await getResponsiveImagesEnabledServer();
  syncResponsiveImagesServerGlobal(responsiveImagesEnabled);
  // Blur Placeholder admin toggle (Admin > Settings) — same pattern as
  // Responsive Images above: read once per request, then made available
  // to lib/image-placeholder.ts both on the server (Node global, set
  // here before children render) and in the browser (inline script in
  // <head> below, executed before hydration). Fails safe to `true`
  // (shimmer shown) on any error — see lib/blur-placeholder-flag.ts.
  const blurPlaceholderSettings = await getBlurPlaceholderSettingsServer();
  syncBlurPlaceholderServerGlobal(blurPlaceholderSettings);
  const gaId = analytics.ga_enabled ? analytics.ga_measurement_id.trim() : '';
  const gtmId = analytics.gtm_enabled ? analytics.gtm_container_id.trim() : '';
  const googleAdsId = analytics.google_ads_id.trim();
  const pixelId = analytics.meta_pixel_enabled ? analytics.meta_pixel_id.trim() : '';
  const trustpilotKey = analytics.trustpilot_enabled ? analytics.trustpilot_integration_key.trim() : '';

  return (
    <html lang="en" className={`${inter.variable} ${playfair.variable}`}>
      <head>
        {/* Responsive Images feature flag — must run before any <Image>
           hydrates on the client, so lib/cloudflare-image-loader.js sees
           the same value the server just rendered with. Defaults to
           `false` (original URLs, unchanged) if the setting is off or
           couldn't be read. */}
        <Script id="responsive-images-flag" strategy="beforeInteractive">
          {`window.__RESPONSIVE_IMAGES_ENABLED__ = ${responsiveImagesEnabled};`}
        </Script>

        {/* Blur Placeholder feature flags — must run before any <Image>
           hydrates on the client, so lib/image-placeholder.ts sees the
           same values the server just rendered with. Two independent
           toggles (shimmer vs real per-image preview); both default to
           `true` if the setting couldn't be read. */}
        <Script id="blur-placeholder-flag" strategy="beforeInteractive">
          {`window.__BLUR_SHIMMER_ENABLED__ = ${blurPlaceholderSettings.shimmer_enabled}; window.__BLUR_REAL_PREVIEW_ENABLED__ = ${blurPlaceholderSettings.real_preview_enabled};`}
        </Script>

        {/* Trustpilot base script — registers window.tp() so
           <TrustpilotInvitation> (order confirmation page) can create
           review-invitation emails after a purchase. Key + on/off toggle
           live in Admin > Marketing > Analytics. */}
        {trustpilotKey && (
          <Script id="trustpilot-init" strategy="afterInteractive">
            {`
              (function(w,d,s,r,n){w.TrustpilotObject=n;w[n]=w[n]||function(){(w[n].q=w[n].q||[]).push(arguments)};
              a=d.createElement(s);a.async=1;a.src=r;a.type='text/java'+s;f=d.getElementsByTagName(s)[0];
              f.parentNode.insertBefore(a,f)})(window,document,'script','https://invitejs.trustpilot.com/tp.min.js','tp');
              tp('register', '${trustpilotKey}');
            `}
          </Script>
        )}

        {/* GTM / GA4 / Meta Pixel — gated so they never fire on /admin
            routes. See components/analytics-scripts.tsx. */}
        <AnalyticsScripts gaId={gaId} gtmId={gtmId} googleAdsId={googleAdsId} pixelId={pixelId} />
      </head>
      <body className="font-sans antialiased">
        {/* Keeps window.__BLUR_SHIMMER_ENABLED__ / __BLUR_REAL_PREVIEW_ENABLED__
           fresh across client-side navigation — see
           components/blur-placeholder-sync.tsx for why the
           beforeInteractive script above isn't enough on its own.
           Renders nothing. */}
        <BlurPlaceholderSync />
        {/* Google Customer Reviews badge (store rating). See
           components/analytics/google-customer-reviews-badge.tsx. */}
        <GoogleCustomerReviewsBadge enabled={analytics.gcr_badge_enabled} />
        <Providers
          initialPaymentDiscount={initialPaymentDiscount}
          initialSiteBanner={chrome.siteBanner}
          initialGrowth={chrome.growth}
          initialFreeShippingThreshold={chrome.freeShippingThreshold}
        >
          {children}
        </Providers>
      </body>
    </html>
  );
}
