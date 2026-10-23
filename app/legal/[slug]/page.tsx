import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { getServerSupabase } from '@/lib/supabase-server';
import { LEGAL_PAGE_TITLES, LegalPages, LegalSlug, applyFulfillmentTokens, fetchFulfillmentSettings } from '@/lib/marketing-api';
import { fetchShippingSettings } from '@/lib/pincode-api';

const VALID_SLUGS = Object.keys(LEGAL_PAGE_TITLES) as LegalSlug[];

// Legal page content is edited from Admin > Marketing > Legal Pages and saved
// straight to Supabase. Without this, Next.js would statically generate this
// page once at build time and keep serving that stale copy forever, so admin
// edits would never show up on the live site until the next deploy.
export const dynamic = 'force-dynamic';

async function getLegalPages(): Promise<LegalPages> {
  const supabase = getServerSupabase();
  const { data } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'legal_pages')
    .maybeSingle();
  return (data?.value as LegalPages) ?? ({} as LegalPages);
}

export function generateStaticParams() {
  return VALID_SLUGS.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const slug = params.slug as LegalSlug;
  if (!VALID_SLUGS.includes(slug)) return {};
  const title = LEGAL_PAGE_TITLES[slug];
  return {
    title,
    description: `${title} for AruhiHandlooms — read our policy before you shop.`,
    alternates: { canonical: `/legal/${slug}` },
    robots: { index: true, follow: true },
  };
}

export default async function LegalPage({ params }: { params: { slug: string } }) {
  const slug = params.slug as LegalSlug;
  if (!VALID_SLUGS.includes(slug)) notFound();

  const [pages, fulfillment, shipping] = await Promise.all([
    getLegalPages(),
    fetchFulfillmentSettings(),
    fetchShippingSettings(),
  ]);
  const title = LEGAL_PAGE_TITLES[slug];
  const rawContent = pages[slug] || 'This page is being updated. Please check back soon.';
  // {{dispatch_days}}, {{return_days}}, {{shipping_fee}}, etc. always
  // reflect the live numbers from Admin > Marketing > Shipping & Returns
  // Timing and Admin > Settings > GST & Shipping.
  const content = applyFulfillmentTokens(rawContent, fulfillment, shipping);

  return (
    <div className="container-boutique max-w-3xl py-10 sm:py-14">
      <nav className="mb-6 text-xs text-muted-foreground">
        <Link href="/" className="hover:text-primary">Home</Link>
        <span className="mx-1">/</span>
        <span className="text-foreground">{title}</span>
      </nav>

      <h1 className="font-serif text-3xl font-bold text-primary sm:text-4xl">{title}</h1>

      <div className="mt-6 whitespace-pre-wrap text-sm leading-relaxed text-foreground/80">
        {content}
      </div>

      <div className="mt-10 flex flex-wrap gap-x-4 gap-y-2 border-t border-border/60 pt-6 text-xs">
        {VALID_SLUGS.filter((s) => s !== slug).map((s) => (
          <Link key={s} href={`/legal/${s}`} className="text-muted-foreground hover:text-primary">
            {LEGAL_PAGE_TITLES[s]}
          </Link>
        ))}
      </div>
    </div>
  );
}
