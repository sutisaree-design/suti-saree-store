'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth-context';
import {
  Package, MapPin, User, Heart, RotateCcw, LogOut,
  Gift, Users2, Store, Link2, LayoutDashboard,
} from 'lucide-react';

const links = [
  { href: '/account/orders',       label: 'Orders',        icon: Package },
  { href: '/account/wishlist',     label: 'Wishlist',      icon: Heart },
  { href: '/account/loyalty',   label: 'Rewards',            icon: Gift },
  { href: '/account/referrals', label: 'Refer & Earn',       icon: Users2 },
  { href: '/account/reseller',  label: 'Reseller',           icon: Store },
  { href: '/account/affiliate', label: 'Affiliate',          icon: Link2 },
  { href: '/account/addresses', label: 'Addresses',          icon: MapPin },
  { href: '/account/returns',   label: 'Returns',            icon: RotateCcw },
  { href: '/account/profile',   label: 'Profile',            icon: User },
];

// Bottom tab bar shows only the most-used 5 items; rest are in sidebar on desktop
const MOBILE_TABS = ['/account', '/account/orders', '/account/wishlist', '/account/loyalty', '/account/returns'];

export default function AccountNav({ mobileOnly = false }: { mobileOnly?: boolean }) {
  const pathname = usePathname();
  const { signOut } = useAuth();

  const isActive = (href: string) =>
    href === '/account'
      ? pathname === '/account'
      : pathname === href || pathname.startsWith(href + '/');

  // ── Desktop sidebar ──────────────────────────────────────────────────────
  if (!mobileOnly) {
    return (
      <nav className="flex flex-col gap-1">
        {links.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors',
              isActive(href)
                ? 'bg-primary text-primary-foreground'
                : 'text-foreground/80 hover:bg-accent hover:text-accent-foreground'
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {label}
          </Link>
        ))}
        <button
          onClick={() => signOut()}
          className="mt-2 flex items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
        >
          <LogOut className="h-4 w-4" />
          Logout
        </button>
      </nav>
    );
  }

  // ── Mobile bottom tab bar ────────────────────────────────────────────────
  // Shows Dashboard + 4 most-used tabs
  const mobileTabs = [
    { href: '/account', label: 'Dashboard', icon: LayoutDashboard },
    ...links.filter(l => ['/account/orders', '/account/wishlist', '/account/loyalty', '/account/returns'].includes(l.href)),
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t bg-background/95 backdrop-blur md:hidden">
      <div className="grid grid-cols-5">
        {mobileTabs.map(({ href, label, icon: Icon }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex flex-col items-center gap-0.5 px-1 py-2 text-[10px] font-medium transition-colors',
                active ? 'text-primary' : 'text-muted-foreground'
              )}
            >
              <span className={cn(
                'flex h-6 w-6 items-center justify-center rounded-full transition-colors',
                active ? 'bg-primary/10' : ''
              )}>
                <Icon className={cn('h-4 w-4', active ? 'text-primary' : '')} />
              </span>
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
