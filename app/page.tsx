import { getServerSupabase } from '@/lib/supabase-server';
import { safeJsonLd } from '@/lib/json-ld';
import { fetchHomeData } from '@/lib/home-data-server';
import HomeClient from './home-client';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.aruhihandlooms.com';

// Homepage now fetches products/categories/collections server-side (see
// fetchHomeData below) instead of the client re-fetching them fresh on
// every visit. Without a revalidate value this page would render once at
// build time and could go stale indefinitely as products/collections
// change in admin — 60s keeps it fresh, same safety net used on the
// product and category pages.
// CPU-saving change: 60s -> 1800s (30 min). Admin edits already purge this
// page instantly via revalidatePath('/'), so the longer window is only the
// safety net for changes that don't go through admin (e.g. vendor edits).
export const revalidate = 1800;

interface HomeSeoData {
  name: string;
  description: string;
  email: string;
  phone: string;
}

// Pulls the store name/description (Admin > Marketing > SEO) and contact
// details (Admin > Settings > Store Info) so the homepage's structured data
// stays in sync with whatever the admin has configured — no code change
// needed if the shop rebrands.
async function getHomeSeoData(): Promise<HomeSeoData> {
  const fallback: HomeSeoData = {
    name: 'AruhiHandlooms',
    description:
      'Handpicked sarees and ethnic wear from master weavers across India.',
    email: '',
    phone: '',
  };
  try {
    const supabase = getServerSupabase();
    const [seoRes, storeRes] = await Promise.all([
      supabase.from('settings').select('value').eq('key', 'seo_settings').maybeSingle(),
      supabase.from('settings').select('value').eq('key', 'store_info').maybeSingle(),
    ]);
    const seo = (seoRes.data?.value as { site_title?: string; meta_description?: string }) || {};
    const store = (storeRes.data?.value as { name?: string; support_email?: string; support_phone?: string }) || {};
    return {
      name: store.name || fallback.name,
      description: seo.meta_description || fallback.description,
      email: store.support_email || '',
      phone: store.support_phone || '',
    };
  } catch {
    return fallback;
  }
}

export default async function Home() {
  const [data, homeData] = await Promise.all([getHomeSeoData(), fetchHomeData()]);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        name: data.name,
        url: SITE_URL,
        logo: `${SITE_URL}/icon`,
        ...(data.email || data.phone
          ? {
              contactPoint: {
                '@type': 'ContactPoint',
                contactType: 'customer service',
                ...(data.email ? { email: data.email } : {}),
                ...(data.phone ? { telephone: data.phone } : {}),
              },
            }
          : {}),
      },
      {
        '@type': 'WebSite',
        name: data.name,
        url: SITE_URL,
        description: data.description,
        potentialAction: {
          '@type': 'SearchAction',
          target: `${SITE_URL}/search?q={search_term_string}`,
          'query-input': 'required name=search_term_string',
        },
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }}
      />
      <HomeClient
        products={homeData.products}
        categories={homeData.categories}
        banner={homeData.banner}
        heroBanners={homeData.heroBanners}
        freeShippingThreshold={homeData.freeShippingThreshold}
        collections={homeData.collections}
        tiles={homeData.tiles}
        collectionSlugById={homeData.collectionSlugById}
        promotionCollectionSlugById={homeData.promotionCollectionSlugById}
        discoverSettings={homeData.discoverSettings}
        discoverInitialProducts={homeData.discoverInitialProducts}
        discoverInitialHasMore={homeData.discoverInitialHasMore}
        discoverCategoryCounts={homeData.discoverCategoryCounts}
      />
    </>
  );
}
