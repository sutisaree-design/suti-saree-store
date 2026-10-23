import type { Metadata } from 'next';
import { buildProductMetadata, ProductPageBody } from '@/app/product/[slug]/product-page-body';

// Internal route. Visitors never see this URL: next.config.js rewrites
// /product/:slug?size=XL here, so only Merchant-feed style links (which carry
// ?size=) run this dynamic page. Every normal product view is served by the
// static page at app/product/[slug]/page.tsx.
// Metadata (incl. canonical -> /product/:slug) is identical to that page.
export const revalidate = 1800;

type Params = { params: { slug: string }; searchParams?: { size?: string } };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  return buildProductMetadata(params.slug);
}

export default async function ProductSizePage({ params, searchParams }: Params) {
  return ProductPageBody({ slug: params.slug, size: searchParams?.size });
}
