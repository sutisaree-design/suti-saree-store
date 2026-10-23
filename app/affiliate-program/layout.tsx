import type { Metadata } from 'next';

// page.tsx here is a client component ('use client'), so it can't export
// `metadata` itself — this sibling layout supplies it instead, same
// pattern used by /sell-with-us, /refer-earn and /loyalty.
export const metadata: Metadata = {
  title: 'Affiliate Program — AruhiHandlooms',
  description:
    'Join the AruhiHandlooms affiliate programme and earn commission on every order placed through your unique referral link.',
  alternates: { canonical: '/affiliate-program' },
};

export default function AffiliateProgramLayout({ children }: { children: React.ReactNode }) {
  return children;
}
