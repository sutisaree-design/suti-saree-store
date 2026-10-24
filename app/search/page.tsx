import { Metadata } from 'next';
import { fetchProductsServer, fetchCategoriesServer } from '@/lib/products-api-server';
import ShopContent from '../shop/shop-content';

// Same caching reasoning as app/shop/page.tsx: dynamically rendered per
// request, but the underlying fetch is cached for 60s at the route level so
// most visits don't hit Supabase at all.
// Vercel ISR-writes fix: 60 -> 300 (5 min).
export const revalidate = 1800;

// Search results get their own URL (/search?q=...) instead of living under
// /shop?q=... -- /shop stays the pure category/filter browsing page, while
// this page is what the header's search box and the homepage's JSON-LD
// SearchAction both point to. It renders the exact same <ShopContent>
// component /shop does (same filters, same product grid, same colour-variant
// matching), just under a URL that says "this is a search", not "this is
// the catalog with a filter applied".
export const metadata: Metadata = {
  title: 'Search Results | Sutisaree',
  description: 'Search Sutisaree for sarees, lehengas, kurtis and other handwoven ethnic wear.',
  robots: {
    // Individual search-result pages (?q=...) aren't useful landing pages
    // for Google to index -- same treatment /shop?q= implicitly got before,
    // just made explicit now that search has its own dedicated route.
    index: false,
    follow: true,
  },
};

export default async function SearchPage() {
  // If Supabase has a transient hiccup, fail soft (empty catalog + "no
  // products found" state) instead of throwing -- same reasoning as
  // app/shop/page.tsx.
  let products: Awaited<ReturnType<typeof fetchProductsServer>> = [];
  let categories: Awaited<ReturnType<typeof fetchCategoriesServer>> = [];
  try {
    [products, categories] = await Promise.all([
      fetchProductsServer(),
      fetchCategoriesServer(),
    ]);
  } catch (err) {
    console.error('Failed to load /search data:', err);
  }

  return <ShopContent products={products} categories={categories} />;
}
