'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Boxes,
  PackageSearch,
  Wallet,
  ShieldCheck,
  Settings,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const NAV = [
  { href: '/vendor/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/vendor/dashboard/products', label: 'Products', icon: Boxes },
  { href: '/vendor/dashboard/orders', label: 'My Orders', icon: PackageSearch },
  { href: '/vendor/dashboard/earnings', label: 'Earnings', icon: Wallet },
  { href: '/vendor/dashboard/kyc', label: 'KYC Documents', icon: ShieldCheck },
  { href: '/vendor/dashboard/settings', label: 'Settings', icon: Settings },
];

export default function VendorSidebarNav({ businessName }: { businessName?: string }) {
  const pathname = usePathname();

  return (
    <aside className="shrink-0 lg:w-60">
      <div className="lg:sticky lg:top-24">
        <div className="mb-4 hidden lg:block">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-secondary">
            Vendor Sourcing
          </p>
          {businessName && (
            <p className="mt-1 truncate font-serif text-sm font-semibold text-primary">
              {businessName}
            </p>
          )}
        </div>

        <nav className="flex gap-1 overflow-x-auto rounded-lg border border-border/60 bg-card p-1.5 lg:flex-col lg:overflow-visible lg:p-2">
          {NAV.map((item) => {
            const isActive =
              item.href === '/vendor/dashboard'
                ? pathname === '/vendor/dashboard'
                : pathname === item.href || pathname?.startsWith(item.href + '/');
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors lg:whitespace-normal',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted/60 hover:text-primary'
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}
