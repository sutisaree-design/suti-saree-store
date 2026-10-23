import type { Metadata } from 'next';

// page.tsx here is a client component ('use client'), so it can't export
// `metadata` itself — this sibling layout supplies it instead, same
// pattern used by /sell-with-us and /refer-earn.
export const metadata: Metadata = {
  title: 'Loyalty Rewards — AruhiHandlooms',
  description:
    'Earn reward points on every order at AruhiHandlooms and redeem them for discounts on your next handloom saree.',
  alternates: { canonical: '/loyalty' },
};

export default function LoyaltyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
