"use client";

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import AdminShell, { type AdminSection } from '@/components/admin/admin-shell';
import ProductsPanel from '@/components/admin/products-panel';
import OrdersWithLegacy from '@/components/admin/orders-with-legacy';
import CategoriesPanel from '@/components/admin/categories-panel';
import PriceRangeFiltersPanel from '@/components/admin/price-range-filters-panel';
import CollectionsPanel from '@/components/admin/collections-panel';
import BlogPanel from '@/components/admin/blog-panel';
import ReviewsPanel from '@/components/admin/reviews-panel';
import CouponsPanel from '@/components/admin/coupons-panel';
import PromotionsPanel from '@/components/admin/promotions-panel';
import HomepageTilesPanel from '@/components/admin/homepage-tiles-panel';
import DiscoverProductsPanel from '@/components/admin/discover-products-panel';
import HeroBannersPanel from '@/components/admin/hero-banners-panel';
import SettingsPanel from '@/components/admin/settings-panel';
import GstReportPanel from '@/components/admin/gst-report-panel';
import ReturnsPanel from '@/components/admin/returns-panel';
import SupportTicketsPanel from '@/components/admin/support-tickets-panel';
import ContactMessagesPanel from '@/components/admin/contact-messages-panel';
import AbandonedCartsPanel from '@/components/admin/abandoned-carts-panel';
import MarketingPanel from '@/components/admin/marketing-panel';
import PartnerPagesPanel from '@/components/admin/partner-pages-panel';
import StockNotificationsPanel from '@/components/admin/stock-notifications-panel';
import AnalyticsPanel from '@/components/admin/analytics-panel';
import CustomersPanel from '@/components/admin/customers-panel';
import WooCommerceImportPanel from '@/components/admin/woocommerce-import-panel';
import WholesalePanel from '@/components/admin/wholesale-panel';
import LoyaltyPanel from '@/components/admin/loyalty-panel';
import ReviewRewardsPanel from '@/components/admin/review-rewards-panel';
import ReferralsPanel from '@/components/admin/referrals-panel';
import ResellersPanel from '@/components/admin/resellers-panel';
import CacheWarmPanel from '@/components/admin/cache-warm-panel';
import AffiliatesPanel from '@/components/admin/affiliates-panel';
import GiftCardsPanel from '@/components/admin/giftcards-panel';
import VendorsPanel from '@/components/admin/vendors-panel';
import FulfillmentPanel from '@/components/admin/fulfillment-panel';
import VendorSettlementsPanel from '@/components/admin/vendor-settlements-panel';
import VendorOpsPanel from '@/components/admin/vendor-ops-panel';
import VendorReportsPanel from '@/components/admin/vendor-reports-panel';
import ProductSourcesPanel from '@/components/admin/product-sources-panel';

const PANELS: Record<AdminSection, React.ComponentType> = {
  analytics: AnalyticsPanel,
  products: ProductsPanel,
  categories: CategoriesPanel,
  'price-filters': PriceRangeFiltersPanel,
  collections: CollectionsPanel,
  blog: BlogPanel,
  reviews: ReviewsPanel,
  orders: OrdersWithLegacy,
  customers: CustomersPanel,
  'woocommerce-import': WooCommerceImportPanel,
  returns: ReturnsPanel,
  'support-tickets': SupportTicketsPanel,
  'contact-messages': ContactMessagesPanel,
  'abandoned-carts': AbandonedCartsPanel,
  'restock-alerts': StockNotificationsPanel,
  wholesale: WholesalePanel,
  coupons: CouponsPanel,
  promotions: PromotionsPanel,
  'homepage-tiles': HomepageTilesPanel,
  'discover-products': DiscoverProductsPanel,
  'hero-banners': HeroBannersPanel,
  marketing: MarketingPanel,
  'partner-pages': PartnerPagesPanel,
  loyalty: LoyaltyPanel,
  'review-rewards': ReviewRewardsPanel,
  referrals: ReferralsPanel,
  resellers: ResellersPanel,
  affiliates: AffiliatesPanel,
  giftcards: GiftCardsPanel,
  vendors: VendorsPanel,
  fulfillment: FulfillmentPanel,
  'vendor-settlements': VendorSettlementsPanel,
  'vendor-ops': VendorOpsPanel,
  'vendor-reports': VendorReportsPanel,
  'product-sources': ProductSourcesPanel,
  settings: SettingsPanel,
  'gst-report': GstReportPanel,
  'cache-warm': CacheWarmPanel,
};

const VALID_SECTIONS = Object.keys(PANELS) as AdminSection[];

function isAdminSection(value: string | null): value is AdminSection {
  return !!value && (VALID_SECTIONS as string[]).includes(value);
}

function AdminPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Initialize from the URL so a reload (or a shared link) lands on the
  // section the admin was actually looking at instead of always resetting
  // to Analytics. Old "?section=variants" links (from before variants moved
  // inside Products) fall back to Products instead of a blank panel.
  const rawSection = searchParams.get('section');
  const initialSection = isAdminSection(rawSection)
    ? (rawSection as AdminSection)
    : rawSection === 'variants'
    ? 'products'
    : 'analytics';

  const [active, setActive] = useState<AdminSection>(initialSection);

  // If the user navigates with back/forward, or the URL changes externally,
  // keep the panel in sync with it.
  useEffect(() => {
    const fromUrl = searchParams.get('section');
    if (isAdminSection(fromUrl) && fromUrl !== active) {
      setActive(fromUrl);
    }
  }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleChange = useCallback(
    (section: AdminSection, focusId?: string) => {
      setActive(section);
      const params = new URLSearchParams(searchParams.toString());
      params.set('section', section);
      // `focus` = a specific item to scroll to / highlight (set by the
      // notification bell). Any normal sidebar navigation clears it.
      if (focusId) params.set('focus', focusId);
      else params.delete('focus');
      router.replace(`/admin?${params.toString()}`, { scroll: false });
    },
    [router, searchParams]
  );

  const ActivePanel = PANELS[active];

  return (
    <AdminShell active={active} onChange={handleChange}>
      <ActivePanel />
    </AdminShell>
  );
}

export default function AdminPage() {
  return (
    <Suspense fallback={null}>
      <AdminPageInner />
    </Suspense>
  );
}
