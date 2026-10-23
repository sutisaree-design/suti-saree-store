import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/supabase-server-auth';
import AccountNav from '@/components/account/account-nav';
import AccountMobileHeader from '@/components/account/account-mobile-header';

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/account');

  return (
    <>
      {/* Mobile header — only visible on small screens */}
      <AccountMobileHeader email={user.email ?? ''} />

      <div className="container-boutique py-6 md:py-10">
        <div className="md:grid md:grid-cols-[220px_1fr] md:gap-8">
          {/* Sidebar — hidden on mobile (mobile uses bottom tab bar instead) */}
          <aside className="hidden md:block space-y-1">
            <div className="mb-4 px-1">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Welcome back</p>
              <p className="truncate font-serif text-lg font-semibold text-primary">{user.email}</p>
            </div>
            <AccountNav />
          </aside>

          {/* Page content */}
          <main className="min-w-0 pb-24 md:pb-0">{children}</main>
        </div>
      </div>

      {/* Mobile bottom tab bar */}
      <AccountNav mobileOnly />
    </>
  );
}
