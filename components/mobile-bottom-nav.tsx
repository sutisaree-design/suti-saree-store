'use client';

import Link from 'next/link';
import { Home, LayoutGrid, Video, User } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';

// Fixed bottom tab bar shown only on the home page on small screens, so
// shoppers get quick one-tap access to the main sections without hunting
// through the header menu — mirrors the bottom nav pattern used by most
// shopping apps (Home / Categories / Video Shopping / Account).
export default function MobileBottomNav() {
  const { user } = useAuth();

  const tabs = [
    { href: '/', label: 'Home', icon: Home, active: true },
    { href: '/categories', label: 'Categories', icon: LayoutGrid, active: false },
    { href: '/video-shopping', label: 'Video', icon: Video, active: false },
    {
      href: user ? '/account/orders' : '/login',
      label: 'Account',
      icon: User,
      active: false,
    },
  ];

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 backdrop-blur-sm md:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      aria-label="Primary"
    >
      <div className="grid grid-cols-4">
        {tabs.map((t) => (
          <Link
            key={t.label}
            href={t.href}
            className={`flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors ${
              t.active ? 'text-primary' : 'text-muted-foreground hover:text-primary'
            }`}
          >
            <t.icon className="h-5 w-5" />
            {t.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
