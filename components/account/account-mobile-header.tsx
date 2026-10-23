'use client';

import { usePathname, useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';

const PAGE_TITLES: Record<string, string> = {
  '/account': 'My Account',
  '/account/orders': 'My Orders',
  '/account/wishlist': 'Wishlist',
  '/account/loyalty': 'Reward Points',
  '/account/referrals': 'Refer & Earn',
  '/account/reseller': 'Reseller',
  '/account/affiliate': 'Affiliate',
  '/account/addresses': 'Addresses',
  '/account/returns': 'Returns & Exchanges',
  '/account/profile': 'Profile',
};

export default function AccountMobileHeader({ email }: { email: string }) {
  const pathname = usePathname();
  const router = useRouter();

  // Exact match first, then prefix for nested routes like /account/orders/[id]
  const title =
    PAGE_TITLES[pathname] ??
    Object.entries(PAGE_TITLES)
      .reverse()
      .find(([key]) => pathname.startsWith(key))?.[1] ??
    'My Account';

  const isRoot = pathname === '/account' || pathname === '/account/orders';
  // Sub-pages like /account/orders/[id] get a back button to parent
  const isOrderDetail = pathname.startsWith('/account/orders/') && pathname !== '/account/orders';

  return (
    <header className="sticky top-0 z-30 flex items-center gap-2 border-b bg-background/95 px-4 py-3 backdrop-blur md:hidden">
      {isOrderDetail ? (
        <button
          onClick={() => router.back()}
          className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-accent"
          aria-label="Go back"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
      ) : !isRoot ? (
        <button
          onClick={() => router.push('/account')}
          className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-accent"
          aria-label="Back to account"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
      ) : (
        <div className="h-8 w-8" />
      )}
      <h1 className="flex-1 text-center font-serif text-base font-semibold text-primary">
        {title}
      </h1>
      <div className="h-8 w-8" />
    </header>
  );
}
