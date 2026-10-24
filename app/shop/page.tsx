import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { fetchProductsServer } from '@/lib/products-api-server';
import { fetchCategoriesServer } from '@/lib/products-api-server';
import { fetchPopularityRankServer } from '@/lib/popularity-rank-server';
import { fetchTopVariantMapServer, toJSON, TopVariantMapJSON } from '@/lib/top-variant-server';
import { getBlurPreviews } from '@/lib/blur-preview';
import { toPublicMediaUrl } from '@/lib/media-url';
import ShopContent from './shop-content';

// Same reasoning as app/category/[slug]/page.tsx: this page has no
// generateStaticParams so it's dynamically rendered per-request by default,
// but `revalidate` still caches the underlying fetch/data for 60s at the
// route level, so most visits don't hit Supabase at all. Admin mutations
// call revalidatePath('/shop') for an instant purge when a product changes
// (see app/api/admin/products/[id]/route.ts) -- this is just the safety net.
// Vercel ISR-writes fix: 60 -> 300 (5 min).
export const revalidate = 1800;
// NOTE: /shop stays dynamic on purpose (it reads searchParams, and
// ShopContent uses useSearchParams). Making it static would put only the
// "Loading..." Suspense fallback into the HTML -- no products for crawlers.
// 1800 (not 300) keeps the cached Supabase data fresh for 30 min, which
// cuts Vercel ISR writes; admin product edits still purge it instantly via
// revalidatePath('/shop').

export const metadata: Metadata = {
  title: 'Shop All Sarees & Ethnic Wear | Sutisaree',
  description:
    'Browse our full collection of sarees and ethnic wear, sourced directly from master weavers across India.',
};

export default async function ShopPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  // Text search now lives at its own URL (/search?q=...) instead of
  // /shop?q=... -- /shop is the pure category/filter browsing page. Any
  // old links, bookmarks, or shares still using /shop?q=... get sent
  // straight to /search with every other param (sort, category, etc.)
  // carried over untouched, so nothing that was shared before this change
  // breaks.
  if (searchParams?.q) {
    const forwarded = new URLSearchParams();
    for (const [key, value] of Object.entries(searchParams)) {
      if (value === undefined) continue;
      if (Array.isArray(value)) value.forEach((v) => forwarded.append(key, v));
      else forwarded.append(key, value);
    }
    redirect(`/search?${forwarded.toString()}`);
  }

  // If Supabase has a transient hiccup, fail soft (empty catalog + "no
  // products found" state) instead of throwing -- an unhandled throw here
  // would hit Next.js's default error screen, which is worse than the old
  // client-fetched page ever showed for the same failure.
  let products: Awaited<ReturnType<typeof fetchProductsServer>> = [];
  let categories: Awaited<ReturnType<typeof fetchCategoriesServer>> = [];
  let initialPopularityRank: Map<string, number> = new Map();
  let initialTopVariants: TopVariantMapJSON = {};
  let blurPreviews: Record<string, string> = {};
  try {
    const [productsRes, categoriesRes, popularityRes, topVariantsRes] = await Promise.all([
      fetchProductsServer(),
      fetchCategoriesServer(),
      fetchPopularityRankServer(),
      fetchTopVariantMapServer(),
    ]);
    products = productsRes;
    categories = categoriesRes;
    initialPopularityRank = popularityRes;
    initialTopVariants = toJSON(topVariantsRes);

    // Real per-image blur previews (LQIP) for every product card on this
    // grid — the same "real photo" blur the product-detail gallery uses,
    // instead of the generic shimmer. Only the two photos each card can
    // actually show (its main photo + the hover-swap photo) are looked
    // up, keyed by the same canonical URL ProductCard itself computes via
    // toPublicMediaUrl -- any photo without a real preview yet (still
    // mid-backfill, or generation failed) simply falls back to the
    // generic shimmer, never a blank/broken state. See lib/blur-preview.ts.
    const cardImageUrls = new Set<string>();
    for (const p of products) {
      const main = toPublicMediaUrl(p.default_variant_image || p.images[0]);
      const hover = toPublicMediaUrl(p.images[1]);
      if (main) cardImageUrls.add(main);
      if (hover) cardImageUrls.add(hover);
    }
    blurPreviews = Object.fromEntries(await getBlurPreviews(Array.from(cardImageUrls)));
  } catch (err) {
    console.error('Failed to load /shop data:', err);
  }

  return (
    <ShopContent
      products={products}
      categories={categories}
      initialPopularityRank={initialPopularityRank}
      initialTopVariants={initialTopVariants}
      blurPreviews={blurPreviews}
    />
  );
}
