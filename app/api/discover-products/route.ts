import { NextResponse } from 'next/server';
import { fetchDiscoverProductsServer } from '@/lib/discover-products-api';

export const revalidate = 0;

// Public — powers the "Discover Products For You" homepage section's
// client-side pagination (page 1 is already rendered server-side via
// lib/home-data-server.ts / fetchDiscoverProductsServer, this route only
// gets hit for "load more" / infinite scroll and whenever the shopper
// changes the category or price filter chips).
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const category = searchParams.get('category') || undefined;
  const priceMinRaw = searchParams.get('priceMin');
  const priceMaxRaw = searchParams.get('priceMax');
  const pageRaw = searchParams.get('page');
  const pageSizeRaw = searchParams.get('pageSize');

  const priceMin = priceMinRaw ? Number(priceMinRaw) : undefined;
  const priceMax = priceMaxRaw ? Number(priceMaxRaw) : undefined;
  const page = pageRaw ? Math.max(1, Number(pageRaw)) : undefined;
  const pageSize = pageSizeRaw ? Number(pageSizeRaw) : undefined;

  try {
    const result = await fetchDiscoverProductsServer({
      category,
      priceMin: Number.isFinite(priceMin) ? priceMin : undefined,
      priceMax: Number.isFinite(priceMax) ? priceMax : undefined,
      page: Number.isFinite(page) ? page : undefined,
      pageSize: Number.isFinite(pageSize) ? pageSize : undefined,
    });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load products';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
