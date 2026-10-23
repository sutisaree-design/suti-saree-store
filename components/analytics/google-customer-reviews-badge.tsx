'use client';

import { useEffect } from 'react';
import Script from 'next/script';
import { usePathname } from 'next/navigation';
import { GCR_MERCHANT_ID } from '@/lib/google-customer-reviews';

// Pages that should never show the badge (back-office + payment flow).
const HIDDEN_PREFIXES = ['/admin', '/vendor', '/checkout'];

// Element Google's widget creates once start() has run. It lives in <body>
// and is NOT removed by React, so on client-side navigation it stays on
// screen even after this component stops rendering. We hide it by class
// (rather than touching its inline styles) on the pages listed above.
const WRAPPER_ID = 'google-merchantwidget-iframe-wrapper';
const HIDE_CLASS = 'gcr-badge-hidden';
const STYLE_ID = 'gcr-badge-hide-style';

function setWrapperHidden(hidden: boolean) {
  document.getElementById(WRAPPER_ID)?.classList.toggle(HIDE_CLASS, hidden);
}

/**
 * Google Customer Reviews badge (store widget) -- the small floating Google
 * widget that shows the store rating / quality. Mounted once in app/layout.tsx.
 *
 * Position: bottom-right (WhatsApp / live-chat buttons sit bottom-left).
 * On mobile it is lifted to clear the sticky "Add to Bag / Buy" bar on the
 * product page and the bottom nav (see mobileBottomMargin below).
 *
 * Switch it on/off from Admin > Marketing > Analytics (takes effect once the
 * layout re-renders, up to ~30 min, same as the other analytics toggles).
 * NEXT_PUBLIC_GCR_BADGE=off also forces it off.
 */
export default function GoogleCustomerReviewsBadge({ enabled = true }: { enabled?: boolean }) {
  const pathname = usePathname() || '';
  // Admin > Marketing > Analytics toggle (passed from app/layout.tsx), plus
  // the NEXT_PUBLIC_GCR_BADGE=off env flag as a hard kill-switch.
  const disabled = !enabled || process.env.NEXT_PUBLIC_GCR_BADGE === 'off';
  const hidden = HIDDEN_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  useEffect(() => {
    if (!document.getElementById(STYLE_ID)) {
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = `.${HIDE_CLASS}{display:none !important;}`;
      document.head.appendChild(style);
    }

    setWrapperHidden(hidden);
    if (!hidden) return;

    // The script may still be loading when the visitor lands on a hidden
    // page via client-side navigation; if the widget appears a moment later,
    // hide it as soon as it shows up.
    const observer = new MutationObserver(() => {
      if (document.getElementById(WRAPPER_ID)) setWrapperHidden(true);
    });
    observer.observe(document.body, { childList: true });
    return () => observer.disconnect();
  }, [hidden]);

  if (disabled || hidden) return null;

  return (
    <Script
      id="merchantWidgetScript"
      src="https://www.gstatic.com/shopping/merchant/merchantwidget.js"
      strategy="lazyOnload"
      onLoad={() => {
        const w = window as any;
        if (w.__gcrBadgeStarted || !w.merchantwidget?.start) return;
        w.__gcrBadgeStarted = true; // start() once per page load
        w.merchantwidget.start({
          merchant_id: GCR_MERCHANT_ID,
          position: 'RIGHT_BOTTOM',
          region: 'IN',
          // Mobile: keep clear of the sticky cart bar / bottom nav (px).
          mobileBottomMargin: 80,
        });
      }}
    />
  );
}
