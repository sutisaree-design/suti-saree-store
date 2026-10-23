import type { Metadata } from 'next';

// page.tsx here is a client component ('use client'), so it can't export
// `metadata` itself — this sibling layout supplies it instead, same pattern
// used by /sell-with-us.
export const metadata: Metadata = {
  title: 'Refer & Earn — AruhiHandlooms',
  description:
    'Invite friends to AruhiHandlooms. When they place their first order, you both earn reward points redeemable on future purchases.',
  alternates: { canonical: '/refer-earn' },
};

export default function ReferEarnLayout({ children }: { children: React.ReactNode }) {
  return children;
}
