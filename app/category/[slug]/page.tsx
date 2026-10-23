import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { fetchCategoriesServer, fetchProductsServer } from '@/lib/products-api-server';
import { fetchPopularityRankServer } from '@/lib/popularity-rank-server';
import { fetchTopVariantMapServer, toJSON } from '@/lib/top-variant-server';
import { getBlurPreviews } from '@/lib/blur-preview';
import { toPublicMediaUrl } from '@/lib/media-url';
import ViewItemListTracker from '@/components/analytics/view-item-list-tracker';
import CategoryToolbarGrid from '@/components/category/category-toolbar-grid';
import { safeJsonLd } from '@/lib/json-ld';
import { expandProductVariants } from '@/lib/expand-product-variants';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.aruhihandlooms.com';

// This page uses generateStaticParams(), so without a `revalidate` value
// Next.js caches it once at build time and NEVER regenerates it (revalidate:
// false is the default for statically-generated pages). That meant a product
// deleted from the admin panel kept showing up here on the category
// storefront page indefinitely -- because it was baked into that static
// HTML at build time -- while its own /product/[slug] page (rendered fresh,
// no generateStaticParams) correctly 404'd on click. ISR with a 60s window
// keeps this page nearly-static (cheap, fast) while making sure it drops
// deleted/changed products within a minute instead of only on the next
// deploy. Admin mutations also call revalidatePath() for an instant purge --
// see app/api/admin/products/[id]/route.ts -- this is just the safety net.
// CPU-saving change: safety-net window raised 60s -> 1800s (30 min). Admin
// product/collection edits still purge instantly via revalidatePath().
export const revalidate = 1800;

type Params = { params: { slug: string } };

/**
 * Fallback intro copy, used only when the admin hasn't filled in the
 * category's own `description` field yet (Admin > Categories — that field
 * already existed, it just had no public page to render on until now).
 * Keeps every category page unique, indexable, and reasonably descriptive
 * out of the box; admins can override it any time with custom SEO copy.
 */
function fallbackIntro(name: string): string {
  return (
    `Explore our handpicked ${name} collection at AruhiHandlooms. Every piece is sourced ` +
    `directly from master weavers across India, blending traditional craftsmanship with ` +
    `designs made for everyday elegance and special occasions alike. Whether you're shopping ` +
    `for a wedding, festival, or gifting, our ${name} collection is curated for quality, ` +
    `comfort, and timeless style — with new arrivals added regularly. Each product page has ` +
    `detailed fabric, care, and sizing information so you can shop with confidence.`
  );
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const [categories, products] = await Promise.all([
    fetchCategoriesServer(),
    fetchProductsServer(),
  ]);
  const category = categories.find((c) => c.slug === params.slug);

  if (!category) {
    return {
      title: 'Category not found | AruhiHandlooms',
      robots: { index: false, follow: true },
    };
  }

  const description = (category.description || fallbackIntro(category.name)).slice(0, 160);
  const url = `${SITE_URL}/category/${category.slug}`;
  const title = `${category.name} | AruhiHandlooms`;

  // An empty category ("No products yet") is thin content -- indexing it
  // risks a low-quality signal on the whole domain, and it's not a page
  // we want ranking anyway. noindex,follow keeps it crawlable (so links
  // out of it still pass equity) without submitting it to Google's index.
  // The page re-qualifies for indexing automatically the moment a product
  // is added, since this check runs fresh on every request/revalidation.
  const hasProducts = products.some((p) => p.category === category.name);

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: 'AruhiHandlooms',
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
    robots: {
      index: hasProducts,
      follow: true,
      googleBot: { index: hasProducts, follow: true, 'max-image-preview': 'large' },
    },
  };
}

export async function generateStaticParams() {
  const categories = await fetchCategoriesServer();
  return categories.map((c) => ({ slug: c.slug }));
}

export default async function CategoryPage({ params }: Params) {
  const [categories, products, initialPopularityRank, topVariantMap] = await Promise.all([
    fetchCategoriesServer(),
    fetchProductsServer(),
    fetchPopularityRankServer(),
    fetchTopVariantMapServer(),
  ]);
  const initialTopVariants = toJSON(topVariantMap);

  const category = categories.find((c) => c.slug === params.slug);
  if (!category) notFound();

  const categoryProducts = products.filter((p) => p.category === category.name);
  // Same real per-image blur preview lookup as /shop (see app/shop/page.tsx
  // for the full explanation) — scoped to just this category's products.
  const cardImageUrls = new Set<string>();
  for (const p of categoryProducts) {
    const main = toPublicMediaUrl(p.default_variant_image || p.images[0]);
    const hover = toPublicMediaUrl(p.images[1]);
    if (main) cardImageUrls.add(main);
    if (hover) cardImageUrls.add(hover);
  }
  const blurPreviews = Object.fromEntries(await getBlurPreviews(Array.from(cardImageUrls)));
  // Counts every colour card the grid below actually renders (base colour
  // + each distinct `product_variants` colour), not just the number of
  // underlying product rows -- otherwise a single product with 10 colours
  // showed as "1 product" here while the grid rendered 10 cards for it.
  const displayCount = expandProductVariants(categoryProducts).length;
  const intro = category.description || fallbackIntro(category.name);
  const url = `${SITE_URL}/category/${category.slug}`;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: category.name,
    description: intro,
    url,
    ...(categoryProducts.length > 0
      ? {
          mainEntity: {
            '@type': 'ItemList',
            itemListElement: categoryProducts.slice(0, 24).map((p, i) => ({
              '@type': 'ListItem',
              position: i + 1,
              url: `${SITE_URL}/product/${p.slug}`,
            })),
          },
        }
      : {}),
  };

  // Breadcrumb rich snippet: Home > {Category Name}.
  // Simplified to 2 levels (was Home > Categories > Category Name) so that
  // Google's SERP breadcrumb display shows the actual category name instead
  // of the generic "Categories" middle node when space is limited.
  // Purely a search-results enhancement (bigger, more clickable listing) --
  // doesn't change indexing eligibility, which is controlled by the
  // canonical + robots meta in generateMetadata() above.
  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: category.name, item: url },
    ],
  };

  return (
    <div className="container-boutique py-8 pb-24 md:pb-12">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(breadcrumbJsonLd) }}
      />

      <nav className="mb-4 text-xs text-muted-foreground">
        <Link href="/" className="hover:text-primary">
          Home
        </Link>
        {' / '}
        <Link href="/categories" className="hover:text-primary">
          Categories
        </Link>
        {' / '}
        <span className="text-foreground">{category.name}</span>
      </nav>

      <h1 className="font-serif text-3xl font-bold text-primary sm:text-4xl">{category.name}</h1>
      <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground sm:text-base">
        {intro}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        {displayCount} {displayCount === 1 ? 'product' : 'products'}
      </p>

      {categoryProducts.length === 0 ? (
        <div className="mt-10 flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border py-20 text-center">
          <p className="font-serif text-lg font-semibold">No products yet</p>
          <p className="text-sm text-muted-foreground">
            Check back soon, or browse everything in Shop.
          </p>
          <Link href="/shop" className="mt-2 text-sm font-medium text-primary underline">
            Shop All
          </Link>
        </div>
      ) : (
        <CategoryToolbarGrid
          products={categoryProducts}
          categoryName={category.name}
          initialPopularityRank={initialPopularityRank}
          initialTopVariants={initialTopVariants}
          blurPreviews={blurPreviews}
        />
      )}
      <ViewItemListTracker
        listName={category.name}
        items={categoryProducts.map((p) => ({ id: p.id, name: p.name, category: p.category, price: p.price }))}
      />
    </div>
  );
}
