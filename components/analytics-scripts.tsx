'use client';

import { useEffect, useState } from 'react';
import Script from 'next/script';
import { usePathname } from 'next/navigation';

interface AnalyticsScriptsProps {
  gaId: string;
  gtmId: string;
  googleAdsId: string;
  pixelId: string;
}

// Pages where tracking must start immediately (conversion pages).
const LOAD_NOW_PREFIXES = ['/checkout', '/order-confirmation'];

// If the visitor does nothing at all, still load tracking after this
// many ms (after the page's own load event) so bounce sessions are counted.
const FALLBACK_DELAY_MS = 6000;

const INTERACTION_EVENTS = ['pointerdown', 'touchstart', 'keydown', 'scroll', 'mousemove'] as const;

/**
 * Loads GTM / GA4 (gtag.js) / Meta Pixel — but never on /admin/** routes.
 *
 * PERFORMANCE (Task 3): the heavy third-party files (gtm.js, gtag.js,
 * fbevents.js) used to download + execute right after hydration, which
 * is what inflated Total Blocking Time. They are now loaded on the FIRST
 * of: user interaction (tap / scroll / key / mouse), or FALLBACK_DELAY_MS
 * after page load. Conversion pages (/checkout, /order-confirmation)
 * load them immediately.
 *
 * Nothing is lost: a tiny inline stub defines window.dataLayer and
 * window.gtag right away, so any event fired before gtag.js arrives
 * (add_to_cart, purchase, ...) is queued in dataLayer and processed as
 * soon as gtag.js loads. lib/gtag-track.ts keeps working unchanged.
 *
 * Admin gating is unchanged (see original note: keeps GA4 pageviews from
 * admin panel pages out of analytics).
 */
export default function AnalyticsScripts({
  gaId,
  gtmId,
  googleAdsId,
  pixelId,
}: AnalyticsScriptsProps) {
  const pathname = usePathname();
  const isAdminRoute = pathname?.startsWith('/admin');
  const loadNow = LOAD_NOW_PREFIXES.some((p) => pathname?.startsWith(p));
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (isAdminRoute || ready) return;
    if (loadNow) {
      setReady(true);
      return;
    }

    let done = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const cleanup = () => {
      INTERACTION_EVENTS.forEach((e) => window.removeEventListener(e, trigger));
      window.removeEventListener('load', startTimer);
      if (timer) clearTimeout(timer);
    };
    const trigger = () => {
      if (done) return;
      done = true;
      cleanup();
      setReady(true);
    };
    const startTimer = () => {
      if (done) return;
      timer = setTimeout(trigger, FALLBACK_DELAY_MS);
    };

    INTERACTION_EVENTS.forEach((e) =>
      window.addEventListener(e, trigger, { passive: true, once: true })
    );
    if (document.readyState === 'complete') startTimer();
    else window.addEventListener('load', startTimer, { once: true });

    return cleanup;
  }, [isAdminRoute, loadNow, ready]);

  if (isAdminRoute) return null;

  return (
    <>
      {/* Tiny queue stub: runs immediately so early events are never lost.
          Real gtag.js / gtm.js / fbevents.js load later (below). */}
      {(gtmId || gaId) && (
        <Script id="gtag-queue-stub" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            ${!gtmId ? 'window.gtag = window.gtag || function(){dataLayer.push(arguments);};' : ''}
          `}
        </Script>
      )}

      {/* Google Tag Manager — manages GA4 + Google Ads + other tags from
          the GTM dashboard. Container ID in Admin > Marketing > Analytics. */}
      {ready && gtmId && (
        <Script id="gtm-init" strategy="afterInteractive">
          {`
            (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
            new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
            j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
            'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
            })(window,document,'script','dataLayer','${gtmId}');
          `}
        </Script>
      )}

      {/* GA4 + Google Ads gtag.js — used when GTM is NOT configured. */}
      {!gtmId && gaId && (
        <>
          <Script id="ga4-init" strategy="afterInteractive">
            {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              window.gtag = window.gtag || gtag;
              gtag('js', new Date());
              gtag('config', '${gaId}');
              ${googleAdsId ? `gtag('config', '${googleAdsId}');` : ''}
            `}
          </Script>
          {ready && (
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`}
              strategy="afterInteractive"
            />
          )}
        </>
      )}

      {ready && pixelId && (
        <Script id="meta-pixel-init" strategy="afterInteractive">
          {`
            !function(f,b,e,v,n,t,s)
            {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
            n.callMethod.apply(n,arguments):n.queue.push(arguments)};
            if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
            n.queue=[];t=b.createElement(e);t.async=!0;
            t.src=v;s=b.getElementsByTagName(e)[0];
            s.parentNode.insertBefore(t,s)}(window, document,'script',
            'https://connect.facebook.net/en_US/fbevents.js');
            fbq('init', '${pixelId}');
            fbq('track', 'PageView');
          `}
        </Script>
      )}

      {/* GTM noscript fallback — required by Google */}
      {gtmId && (
        <noscript>
          <iframe
            src={`https://www.googletagmanager.com/ns.html?id=${gtmId}`}
            height="0"
            width="0"
            style={{ display: 'none', visibility: 'hidden' }}
          />
        </noscript>
      )}

      {pixelId && (
        <noscript>
          <img
            height="1"
            width="1"
            style={{ display: 'none' }}
            src={`https://www.facebook.com/tr?id=${pixelId}&ev=PageView&noscript=1`}
            alt=""
          />
        </noscript>
      )}
    </>
  );
}
