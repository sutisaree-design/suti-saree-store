import type { Metadata } from 'next';

// page.tsx here is a client component ('use client'), so it can't export
// `metadata` itself — this sibling layout supplies it instead. This page
// was previously untitled/undescribed for SEO purposes even though it's
// public; giving it real title/description helps it surface for "vendor
// registration" style searches alongside the dedicated /vendor-registration
// landing page.
export const metadata: Metadata = {
  title: 'Vendor Registration — Sell With Us',
  description:
    'Apply to become a supplying vendor for AruhiHandlooms. Submit your business details and start selling handloom sarees and ethnic wear.',
  alternates: { canonical: '/sell-with-us' },
};

export default function SellWithUsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
