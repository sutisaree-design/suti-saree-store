import { Metadata } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import CollectionPageClient from './collection-page-client';

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
        title: 'Collection not found | Sutisaree',
        robots: { index: false, follow: true },
      };
    }

    return {
      title: `${vendor.business_name} | Sutisaree`,
      description: `Shop the full collection from ${vendor.business_name} on Sutisaree.`,
    };
  } catch {
    return { title: 'Sutisaree' };
  }
}

export default function CollectionPage() {
  return <CollectionPageClient />;
}
