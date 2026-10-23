import type { Metadata } from 'next';
import RedirectToCart from '@/components/cart/redirect-to-cart';

// Dedicated landing URL for the abandoned-cart recovery EMAIL button:
//   /recover/<OFFER_CODE>
// It remembers the offer code and forwards the visitor to /cart, where CartProvider
// stacks it on top of any coupon the customer already has applied and the cart page
// highlights the extra saving.
export const metadata: Metadata = {
  title: 'Your cart',
  robots: { index: false, follow: false },
};

export default function RecoverPage({ params }: { params: { code: string } }) {
  return <RedirectToCart offer={decodeURIComponent(params.code || '')} />;
}
