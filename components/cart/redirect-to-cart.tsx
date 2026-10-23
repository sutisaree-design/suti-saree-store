'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { queuePendingCoupon } from '@/lib/cart-context';

// Link-preview crawlers (WhatsApp etc.) don't run JS, so they read the OG
// tags of /cart-link/[id]; real visitors get sent on to the cart instantly.
// If the link carries an offer code (/recover/CODE or ?offer=CODE), the code is
// queued here and CartProvider auto-applies it once the cart has loaded.
export default function RedirectToCart({ offer }: { offer?: string }) {
  const router = useRouter();
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const code = offer || params.get('offer') || params.get('coupon');
      if (code) queuePendingCoupon(code);
    } catch {
      // ignore
    }
    router.replace('/cart');
  }, [router, offer]);
  return (
    <div className="flex min-h-[50vh] items-center justify-center text-sm text-muted-foreground">
      Taking you to your cart…
    </div>
  );
}
