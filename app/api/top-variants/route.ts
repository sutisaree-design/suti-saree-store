import { NextResponse } from 'next/server';
import { fetchTopVariantMapServer, toJSON } from '@/lib/top-variant-server';

// Public, read-only, aggregated data only (productId -> best colour's name/
// image/slug) — no order or customer detail ever leaves fetchTopVariantMapServer.
// Used by client components that can't call the server helper directly:
// "You may also like" and "Recently viewed" on the product page.
export const revalidate = 300; // 5 min — this doesn't need to be second-fresh

export async function GET() {
  try {
    const map = await fetchTopVariantMapServer();
    return NextResponse.json({ variants: toJSON(map) });
  } catch (err) {
    return NextResponse.json({ variants: {} }, { status: 200 });
  }
}
