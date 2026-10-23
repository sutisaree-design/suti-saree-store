import { Metadata } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import StorePageClient from './store-page-client';

type Params = { params: { slug: string } };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  try {
    const admin = getSupabaseAdmin();
    const { data: vendor } = await admin
      .from('vendor_public_profiles')
      .select('business_name')
      .eq('storefront_slug', params.slug)
      .maybeSingle();

    if (!vendor) {
      return {
        title: 'Store not found | AruhiHandlooms',
        robots: { index: false, follow: true },
      };
    }

    return {
      title: `${vendor.business_name} | AruhiHandlooms`,
      description: `Shop the full collection from ${vendor.business_name} on AruhiHandlooms.`,
    };
  } catch {
    return { title: 'AruhiHandlooms' };
  }
}

export default function StorePage() {
  return <StorePageClient />;
}
