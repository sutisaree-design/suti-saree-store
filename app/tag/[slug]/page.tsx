import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import {
  fetchProductsServer,
  fetchTagBySlugServer,
  fetchAllTagsServer,
  fetchTagProductIdsServer,
} from '@/lib/products-api-server';
import { fetchPopularityRankServer } from '@/lib/popularity-rank-server';
import { fetchTopVariantMapServer, toJSON } from '@/lib/top-variant-server';
import { getBlurPreviews } from '@/lib/blur-preview';
import { toPublicMediaUrl } from '@/lib/media-url';
import ViewItemListTracker from '@/components/analytics/view-item-list-tracker';
import CategoryToolbarGrid from '@/components/category/category-toolbar-grid';
import { safeJsonLd } from '@/lib/json-ld';
import { expandProductVariants } from '@/lib/expand-product-variants';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.sutisaree.com';

export const revalidate = 1800;

type Params = { params: { slug: string } };

async function getTagProducts(tagId: string) {
  const [products, ids] = await Promise.all([
    fetchProductsServer(),
    fetchTagProductIdsServer(tagId),
  ]);
  const idSet = new Set(ids);
  return products.filter((p) => idSet.has(p.id));
}

export async function generateStaticParams() {
  const tags = await fetchAllTagsServer();
  return tags.map((t) => ({ slug: t.slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const tag = await fetchTagBySlugServer(params.slug);
  if (!tag) {
    return {
      title: 'Tag not found | Sutisaree',
      robots: { index: false, follow: true },
    };
  }
  const tagProducts = await getTagProducts(tag.id);
  const hasProducts = tagProducts.length > 0;
  const title = `${tag.name} | Sutisaree`;
  const description = `Shop ${tag.name} at Sutisaree. Handpicked handloom sarees sourced directly from master weavers across India.`;
  const url = `${SITE_URL}/product-tag/${tag.slug}/`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, siteName: 'Sutisaree', type: 'website' },
    twitter: { card: 'summary_large_image', title, description },
    robots: {
      index: hasProducts,
      follow: true,
      googleBot: { index: hasProducts, follow: true, 'max-image-preview': 'large' },
    },
  };
}

export default async function TagPage({ params }: Params) {
  const tag = await fetchTagBySlugServer(params.slug);
  if (!tag) notFound();

  const [tagProducts, initialPopularityRank, topVariantMap] = await Promise.all([
    getTagProducts(tag.id),
    fetchPopularityRankServer(),
    fetchTopVariantMapServer(),
  ]);
  const initialTopVariants = toJSON(topVariantMap);

  const cardImageUrls = new Set<string>();
  for (const p of tagProducts) {
    const main = toPublicMediaUrl(p.default_variant_image || p.images[0]);
    const hover = toPublicMediaUrl(p.images[1]);
    if (main) cardImageUrls.add(main);
    if (hover) cardImageUrls.add(hover);
  }
  const blurPreviews = Object.fromEntries(await getBlurPreviews(Array.from(cardImageUrls)));
  const displayCount = expandProductVariants(tagProducts).length;
  const url = `${SITE_URL}/product-tag/${tag.slug}/`;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: tag.name,
    url,
    ...(tagProducts.length > 0
      ? {
          mainEntity: {
            '@type': 'ItemList',
            itemListElement: tagProducts.slice(0, 24).map((p, i) => ({
              '@type': 'ListItem',
              position: i + 1,
              url: `${SITE_URL}/product/${p.slug}/`,
            })),
          },
        }
      : {}),
  };
  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: tag.name, item: url },
    ],
  };

  return (
    <div className="container-boutique py-8 pb-24 md:pb-12">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(breadcrumbJsonLd) }} />

      <nav className="mb-4 text-xs text-muted-foreground">
        <Link href="/" className="hover:text-primary">Home</Link>
        {' / '}
        <span className="text-foreground">{tag.name}</span>
      </nav>

      <h1 className="font-serif text-3xl font-bold text-primary sm:text-4xl">{tag.name}</h1>
      <p className="mt-1 text-xs text-muted-foreground">
        {displayCount} {displayCount === 1 ? 'product' : 'products'}
      </p>

      {tagProducts.length === 0 ? (
        <div className="mt-10 flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border py-20 text-center">
          <p className="font-serif text-lg font-semibold">No products yet</p>
          <Link href="/shop" className="mt-2 text-sm font-medium text-primary underline">
            Shop All
          </Link>
        </div>
      ) : (
        <CategoryToolbarGrid
          products={tagProducts}
          categoryName={tag.name}
          initialPopularityRank={initialPopularityRank}
          initialTopVariants={initialTopVariants}
          blurPreviews={blurPreviews}
        />
      )}
      <ViewItemListTracker
        listName={tag.name}
        items={tagProducts.map((p) => ({ id: p.id, name: p.name, category: p.category, price: p.price }))}
      />
    </div>
  );
}
