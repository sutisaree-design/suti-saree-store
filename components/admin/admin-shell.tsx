'use client';

import { useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  BarChart3,
  Package,
  FolderTree,
  Layers,
  Star,
  ShoppingCart,
  Users,
  Undo2,
  ShoppingBag,
  PackageX,
  LifeBuoy,
  MessageSquare,
  Building2,
  Tag,
  Percent,
  Megaphone,
  Gift,
  Users2,
  CreditCard,
  Settings,
  LogOut,
  Menu,
  X,
  Store,
  LayoutGrid,
  Images,
  Truck,
  PackageCheck,
  Landmark,
  RotateCcw,
  FileBarChart,
  Newspaper,
  EyeOff,
  Download,
  Flame,
  IndianRupee,
  Sparkles,
  Award,
  FolderOpen,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import NotificationBell from './notification-bell';

export type AdminSection =
  | 'analytics'
  | 'products'
  | 'categories'
  | 'price-filters'
  | 'collections'
  | 'blog'
  | 'media'
  | 'reviews'
  | 'orders'
  | 'customers'
  | 'woocommerce-import'
  | 'returns'
  | 'support-tickets'
  | 'contact-messages'
  | 'abandoned-carts'
  | 'restock-alerts'
  | 'wholesale'
  | 'coupons'
  | 'promotions'
  | 'homepage-tiles'
  | 'discover-products'
  | 'hero-banners'
  | 'marketing'
  | 'partner-pages'
  | 'loyalty'
  | 'review-rewards'
  | 'referrals'
  | 'resellers'
  | 'affiliates'
  | 'giftcards'
  | 'vendors'
  | 'fulfillment'
  | 'vendor-settlements'
  | 'vendor-ops'
  | 'vendor-reports'
  | 'product-sources'
  | 'cache-warm'
  | 'gst-report'
  | 'settings';

interface NavItem {
  value: AdminSection;
  label: string;
  icon: typeof BarChart3;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Overview',
    items: [{ value: 'analytics', label: 'Analytics', icon: BarChart3 }],
  },
  {
    label: 'Catalog',
    items: [
      { value: 'products', label: 'Products', icon: Package },
      { value: 'categories', label: 'Categories', icon: FolderTree },
      { value: 'price-filters', label: 'Price Filters', icon: IndianRupee },
      { value: 'collections', label: 'Collections', icon: Layers },
      { value: 'media', label: 'Media', icon: FolderOpen },
      { value: 'blog', label: 'Blog', icon: Newspaper },
      { value: 'reviews', label: 'Reviews', icon: Star },
    ],
  },
  {
    label: 'Sales',
    items: [
      { value: 'orders', label: 'Orders', icon: ShoppingCart },
      { value: 'returns', label: 'Returns', icon: Undo2 },
      { value: 'support-tickets', label: 'Support Tickets', icon: LifeBuoy },
      { value: 'contact-messages', label: 'Contact Messages', icon: MessageSquare },
      { value: 'abandoned-carts', label: 'Abandoned Carts', icon: ShoppingBag },
      { value: 'restock-alerts', label: 'Restock Alerts', icon: PackageX },
      { value: 'wholesale', label: 'Wholesale', icon: Building2 },
    ],
  },
  {
    label: 'Sourcing',
    items: [
      { value: 'vendors', label: 'Vendors', icon: Truck },
      { value: 'fulfillment', label: 'Stock Receiving', icon: PackageCheck },
      { value: 'vendor-settlements', label: 'Vendor Settlements', icon: Landmark },
      { value: 'vendor-ops', label: 'Vendor Ops', icon: RotateCcw },
      { value: 'vendor-reports', label: 'Vendor Reports', icon: FileBarChart },
      { value: 'product-sources', label: 'Product Sources', icon: EyeOff },
    ],
  },
  {
    label: 'People',
    items: [
      { value: 'customers', label: 'Customers', icon: Users },
      { value: 'woocommerce-import', label: 'WooCommerce Import', icon: Download },
    ],
  },
  {
    label: 'Marketing',
    items: [
      { value: 'coupons', label: 'Coupons', icon: Tag },
      { value: 'promotions', label: 'Promotions', icon: Percent },
      { value: 'homepage-tiles', label: 'Homepage Tiles', icon: LayoutGrid },
      { value: 'discover-products', label: 'Discover Products', icon: Sparkles },
      { value: 'hero-banners', label: 'Hero Banners', icon: Images },
      { value: 'marketing', label: 'Marketing', icon: Megaphone },
      { value: 'partner-pages', label: 'Partner Pages', icon: Store },
      { value: 'loyalty', label: 'Loyalty', icon: Gift },
      { value: 'review-rewards', label: 'Review Rewards', icon: Award },
      { value: 'referrals', label: 'Referrals', icon: Users2 },
      { value: 'resellers', label: 'Resellers', icon: Store },
      { value: 'affiliates', label: 'Affiliates', icon: Users2 },
      { value: 'giftcards', label: 'Gift Cards', icon: CreditCard },
    ],
  },
  {
    label: 'Configuration',
    items: [
      { value: 'gst-report', label: 'GST Report', icon: IndianRupee },
      { value: 'settings', label: 'Settings', icon: Settings },
      { value: 'cache-warm', label: 'Cache Warm', icon: Flame },
    ],
  },
];

const LABELS: Record<AdminSection, string> = Object.fromEntries(
  NAV_GROUPS.flatMap((g) => g.items.map((i) => [i.value, i.label]))
) as Record<AdminSection, string>;

interface AdminShellProps {
  active: AdminSection;
  onChange: (section: AdminSection, focusId?: string) => void;
  children: ReactNode;
}

export default function AdminShell({ active, onChange, children }: AdminShellProps) {
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = async () => {
    try {
      const res = await fetch('/api/admin/logout', { method: 'POST' });
      if (res.ok) {
        router.push('/');
      } else {
        const body = await res.json().catch(() => ({}));
        toast.error(body?.error || 'Logout failed');
      }
    } catch {
      toast.error('Logout failed');
    }
  };

  const select = (section: AdminSection) => {
    onChange(section);
    setMobileOpen(false);
  };

  const sidebarContent = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2.5 px-5 py-6">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary font-serif text-base font-bold text-primary-foreground">
          S
        </div>
        <div className="min-w-0">
          <p className="truncate font-serif text-lg font-bold leading-tight text-primary">Sutisaree</p>
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">Admin</p>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-4">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="mb-5">
            <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">
              {group.label}
            </p>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = active === item.value;
                return (
                  <li key={item.value}>
                    <button
                      type="button"
                      onClick={() => select(item.value)}
                      aria-current={isActive ? 'page' : undefined}
                      className={cn(
                        'flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm font-medium transition-colors',
                        isActive
                          ? 'bg-primary text-primary-foreground shadow-sm'
                          : 'text-foreground/80 hover:bg-accent hover:text-accent-foreground'
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-border px-3 py-3">
        <button
          type="button"
          onClick={handleLogout}
          className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          Log out
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-muted/40">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 border-r border-border bg-card lg:block">
        <div className="sticky top-0 h-screen">{sidebarContent}</div>
      </aside>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <aside className="absolute left-0 top-0 h-full w-72 bg-card shadow-xl">
            <div className="flex justify-end px-3 pt-3">
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="rounded-md p-2 text-muted-foreground hover:bg-accent"
                aria-label="Close menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {sidebarContent}
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-card/95 px-4 py-3.5 backdrop-blur sm:px-6">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="rounded-md p-2 text-foreground hover:bg-accent lg:hidden"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <p className="font-serif text-base font-bold text-primary lg:hidden">{LABELS[active]}</p>
          <div className="flex-1" />
          <NotificationBell onNavigate={onChange} />
        </header>

        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <div className="mb-6 hidden lg:block">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-secondary">Admin</p>
            <h1 className="mt-1 font-serif text-3xl font-bold text-primary">{LABELS[active]}</h1>
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}
