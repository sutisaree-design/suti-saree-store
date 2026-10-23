import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/supabase-server-auth';
import VendorSidebarNav from '@/components/vendor/sidebar-nav';

export default async function VendorLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/vendor/dashboard');

  return (
    <div className="container-boutique max-w-6xl py-10 sm:py-14">
      <p className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-secondary lg:hidden">
        Vendor Sourcing
      </p>
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-10">
        <VendorSidebarNav />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
