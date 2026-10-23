import Link from 'next/link';
import type { Metadata } from 'next';
import { LogIn, Store } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getServerSupabase } from '@/lib/supabase-server';
import { mergePartnerPagesContent } from '@/lib/settings-api';

// Public, crawlable landing page for the "vendor login" search intent.
// /vendor/* is behind auth middleware, so a logged-out visitor (including
// Googlebot) is always bounced to /login before seeing content — nothing
// under /vendor/* can rank for this keyword. This page lives outside that
// protected path on purpose. Content is admin-editable at
// Admin > Marketing > Partner Pages.

async function getContent() {
  const supabase = getServerSupabase();
  const { data } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'partner_pages_content')
    .maybeSingle();
  return mergePartnerPagesContent(data?.value as any).vendor_login;
}

export async function generateMetadata(): Promise<Metadata> {
  const c = await getContent();
  return {
    title: 'Vendor Login — AruhiHandlooms Vendor Dashboard',
    description: c.hero_subtext,
    alternates: { canonical: '/vendor-login' },
  };
}

export default async function VendorLoginPage() {
  const c = await getContent();

  return (
    <div className="container-boutique max-w-xl py-14 sm:py-20">
      <nav className="mb-8 text-xs text-muted-foreground">
        <Link href="/" className="hover:text-secondary">Home</Link>
        <span className="mx-1">/</span>
        <span>Vendor Login</span>
      </nav>

      <div className="rounded-lg border border-border/60 bg-gradient-to-br from-primary/5 to-secondary/5 p-8 text-center">
        <Store className="mx-auto h-9 w-9 text-primary" />
        <h1 className="mt-3 font-serif text-3xl font-bold text-primary">{c.hero_heading}</h1>
        <p className="mt-3 text-sm text-muted-foreground">{c.hero_subtext}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href="/login?next=/vendor/dashboard">
            <Button className="bg-primary">
              <LogIn className="mr-2 h-4 w-4" />
              {c.cta_label}
            </Button>
          </Link>
        </div>
        <p className="mt-6 text-xs text-muted-foreground">
          Not a vendor yet?{' '}
          <Link href="/vendor-registration" className="underline hover:text-secondary">
            Register as a vendor
          </Link>
        </p>
      </div>
    </div>
  );
}
