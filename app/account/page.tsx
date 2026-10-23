import Link from 'next/link';
import {
  Package, MapPin, User, Heart, RotateCcw,
  Gift, Users2, Store, Link2, ChevronRight, LogOut,
} from 'lucide-react';
import { getCurrentUser, getSupabaseServer } from '@/lib/supabase-server-auth';
import { formatINR } from '@/lib/format';
import LogoutButton from '@/components/account/logout-button';

const sections = [
  {
    title: 'Shopping',
    items: [
      { href: '/account/orders',    label: 'My Orders',          icon: Package,   desc: 'Track & manage orders' },
      { href: '/account/wishlist',  label: 'Wishlist',           icon: Heart,     desc: 'Saved items' },
      { href: '/account/returns',   label: 'Returns & Exchanges',icon: RotateCcw, desc: 'Request or track returns' },
      { href: '/account/addresses', label: 'Addresses',          icon: MapPin,    desc: 'Manage delivery addresses' },
    ],
  },
  {
    title: 'Rewards & Earnings',
    items: [
      { href: '/account/loyalty',   label: 'Reward Points',  icon: Gift,   desc: 'Check your points balance' },
      { href: '/account/referrals', label: 'Refer & Earn',   icon: Users2, desc: 'Invite friends, earn points' },
      { href: '/account/reseller',  label: 'Reseller',       icon: Store,  desc: 'Reseller dashboard' },
      { href: '/account/affiliate', label: 'Affiliate',      icon: Link2,  desc: 'Affiliate earnings' },
    ],
  },
  {
    title: 'Account',
    items: [
      { href: '/account/profile', label: 'Profile', icon: User, desc: 'Name, email & password' },
    ],
  },
];

export default async function AccountDashboard() {
  const user = await getCurrentUser();
  const supabase = await getSupabaseServer();

  // Quick stats
  const [{ count: orderCount }, { data: profile }] = await Promise.all([
    supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .or(`user_id.eq.${user!.id},customer_email.ilike.${user!.email}`),
    supabase.from('profiles').select('loyalty_balance').eq('id', user!.id).maybeSingle(),
  ]);

  const loyaltyBalance = profile?.loyalty_balance ?? 0;

  return (
    <div className="space-y-6">
      {/* Welcome card */}
      <div className="rounded-xl bg-primary/5 px-4 py-5 border border-primary/10">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Welcome back</p>
        <p className="mt-0.5 font-serif text-xl font-bold text-primary truncate">{user!.email}</p>

        {/* Quick stats */}
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Link
            href="/account/orders"
            className="rounded-lg bg-background border border-border/60 px-2 py-3 text-center hover:border-primary/30 transition-colors"
          >
            <p className="font-serif text-xl font-bold text-primary">{orderCount ?? 0}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Orders</p>
          </Link>
          <Link
            href="/account/loyalty"
            className="rounded-lg bg-background border border-border/60 px-2 py-3 text-center hover:border-primary/30 transition-colors"
          >
            <p className="font-serif text-xl font-bold text-primary">{loyaltyBalance}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Reward Points</p>
          </Link>
        </div>
      </div>

      {/* Section groups */}
      {sections.map((section) => (
        <div key={section.title}>
          <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            {section.title}
          </p>
          <div className="overflow-hidden rounded-xl border border-border/60 divide-y divide-border/60 bg-background">
            {section.items.map(({ href, label, icon: Icon, desc }) => (
              <Link
                key={href}
                href={href}
                className="flex items-center gap-3 px-4 py-3.5 hover:bg-accent/40 transition-colors"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/8 text-primary">
                  <Icon className="h-4 w-4" />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium">{label}</span>
                  <span className="block text-xs text-muted-foreground">{desc}</span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50" />
              </Link>
            ))}
          </div>
        </div>
      ))}

      {/* Logout */}
      <div className="overflow-hidden rounded-xl border border-border/60 bg-background">
        <LogoutButton />
      </div>
    </div>
  );
}
