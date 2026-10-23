'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import { CartProvider, CategoriesProvider, PaymentDiscountProvider } from '@/lib/cart-context';
import type { PaymentDiscountSettings, SiteBanner as SiteBannerSettings } from '@/lib/settings-api';
import type { GrowthSettings } from '@/lib/growth-api';
import { AuthProvider } from '@/lib/auth-context';
import { Toaster } from 'sonner';
import CartDrawer from './cart-drawer';
import Header from './header';
import FeatureStrip from './feature-strip';
import Footer from './footer';
import MobileBottomNav from './mobile-bottom-nav';
import SiteBanner from './site-banner';
import WhatsAppButton from './whatsapp-button';
// These two used to be dynamic(..., { ssr: false }), so they only appeared
// after hydration and pushed the page down. They are tiny, and now get
// their data from the server as props, so they render in the first HTML.
import UrgencyBanner from './growth/urgency-banner';
import SaleCountdownBar from './growth/sale-countdown-bar';

// These were all previously imported statically, which meant their JS
// shipped in the initial bundle for EVERY page load and had to be
// parsed/hydrated before the page became interactive — even though none
// of them are needed for the first paint or the first tap/click. None of
// them render anything a search-engine crawler needs either (chat widget,
// popups, toasts), so lazy-loading them costs nothing on SEO and buys back
// real time-to-interactive, especially on slower mobile devices.
const LiveChatWidget = dynamic(() => import('./live-chat-widget'), { ssr: false });
const ActivityTracker = dynamic(() => import('./activity-tracker'), { ssr: false });
const AffiliateTracker = dynamic(() => import('./affiliate-tracker'), { ssr: false });
const AttributionTracker = dynamic(() => import('./attribution-tracker'), { ssr: false });
const ExitIntentModal = dynamic(() => import('./growth/exit-intent-modal'), { ssr: false });
const SocialProofToast = dynamic(() => import('./growth/social-proof-toast'), { ssr: false });

export default function Providers({
  children,
  initialPaymentDiscount,
  initialSiteBanner,
  initialGrowth,
  initialFreeShippingThreshold,
}: {
  children: React.ReactNode;
  /** Server-fetched so the payment-discount badge is correct in the very
   *  first paint — see app/layout.tsx. Optional only so the type still
   *  works for any other place Providers might be mounted without it. */
  initialPaymentDiscount?: PaymentDiscountSettings;
  /** Server-read banner / growth / free-shipping values so the bars below
   *  are in the first HTML and never pop in later (see
   *  lib/storefront-settings-server.ts). All optional: if missing, each
   *  component falls back to its old client-side fetch. */
  initialSiteBanner?: SiteBannerSettings;
  initialGrowth?: GrowthSettings;
  initialFreeShippingThreshold?: number;
}) {
  const pathname = usePathname();
  const isHome = pathname === '/';
  const isAdminRoute = pathname?.startsWith('/admin');
  const hideChatWidget =
    pathname === '/login' ||
    pathname === '/signup' ||
    pathname === '/forgot-password' ||
    pathname === '/reset-password' ||
    pathname.startsWith('/cart') ||
    pathname.startsWith('/checkout');

  // Admin panel renders its own full layout (AdminShell: sidebar, sticky
  // header, main content area). Wrapping it in the storefront chrome below
  // (Header/FeatureStrip/SiteBanner/Footer) stacked two full-height layouts
  // on top of each other -- pushing AdminShell's content down and making
  // pages look cut off / "half shown", especially on short mobile viewports.
  // Admin still needs the context providers (cart/auth/categories) since
  // some admin panels reuse storefront hooks, so only the visual chrome is
  // skipped here, not the providers themselves.
  if (isAdminRoute) {
    return (
      <AuthProvider>
        <CategoriesProvider>
          <PaymentDiscountProvider initialValue={initialPaymentDiscount}>
            <CartProvider>
              {children}
              <Toaster position="top-center" richColors closeButton offset="68px" />
            </CartProvider>
          </PaymentDiscountProvider>
        </CategoriesProvider>
      </AuthProvider>
    );
  }

  return (
    <AuthProvider>
      <CategoriesProvider>
        <PaymentDiscountProvider initialValue={initialPaymentDiscount}>
          <CartProvider>
            <ActivityTracker />
            <AffiliateTracker />
            <AttributionTracker />
            <div className="flex min-h-screen flex-col bg-background">
              <UrgencyBanner initialSettings={initialGrowth} />
              <SaleCountdownBar initialSettings={initialGrowth} />
              <Header />
              <FeatureStrip initialGrowth={initialGrowth} initialThreshold={initialFreeShippingThreshold} />
              <SiteBanner initialBanner={initialSiteBanner} />
              <main className={`flex-1 ${isHome ? 'pb-16 md:pb-0' : ''}`}>{children}</main>
              <Footer />
              <CartDrawer />
              <WhatsAppButton />
              {!hideChatWidget && <LiveChatWidget />}
              <ExitIntentModal />
              <SocialProofToast />
              {isHome && <MobileBottomNav />}
            </div>
            <Toaster position="top-center" richColors closeButton offset="68px" />
          </CartProvider>
        </PaymentDiscountProvider>
      </CategoriesProvider>
    </AuthProvider>
  );
}
