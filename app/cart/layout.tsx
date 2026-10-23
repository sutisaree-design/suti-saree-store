import { Metadata } from 'next';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.aruhihandlooms.com';

export const metadata: Metadata = {
  title: 'Shopping Cart',
  description: 'Review the items in your shopping cart and proceed to checkout.',
  alternates: {
    canonical: `${SITE_URL}/cart`,
  },
  robots: { index: false, follow: true },
};

export default function CartLayout({ children }: { children: React.ReactNode }) {
  return children;
}
