import type { Metadata } from 'next';
import { buildProductMetadata, ProductPageBody } from './product-page-body';
import { fetchTopProductSlugsServer } from '@/lib/top-products-server';

// ISR: cached page, regenerated at most every 30 min on a visit. Admin
// edits/deletes purge instantly via revalidatePath (app/api/admin/products/
// [id]/route.ts); live stock/size data is refreshed client-side. 30 min
// matches the root layout's revalidate -- Next uses the LOWEST value across
// layout + page, so a smaller number here would only add Vercel ISR writes
// (Hobby plan: 200k/month).
// NOTE: do NOT read `searchParams` in this file -- it turns the page dynamic.
export const revalidate = 1800;

type Params = { params: { slug: string } };

// Pre-renders the N most-viewed live products at build time (see
// lib/top-products-server.ts) so the busiest pages are already cached the
// moment a deploy goes live. All other products are rendered + cached on
// their first visit (dynamicParams defaults to true). WITHOUT this export a
// dynamic [slug] route is treated as fully dynamic (one function run per
// view) even with `revalidate` set -- so keep it, even if N is 0.
//
// N comes from the PRERENDER_TOP_PRODUCTS env var (Vercel > Settings >
// Environment Variables). Default 30. Set it to 0 to pre-render nothing
// (e.g. if a build ever fails because of one product's data).
const PRERENDER_TOP_PRODUCTS = Number(process.env.PRERENDER_TOP_PRODUCTS ?? 30);

export async function generateStaticParams() {
  const slugs = await fetchTopProductSlugsServer(PRERENDER_TOP_PRODUCTS);
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  return buildProductMetadata(params.slug);
}

export default async function ProductPage({ params }: Params) {
  return ProductPageBody({ slug: params.slug });
}
