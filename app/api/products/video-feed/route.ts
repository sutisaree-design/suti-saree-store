import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase-server';
import { toPublicMediaUrl } from '@/lib/media-url';

// Public, read-only feed of every product/colour-variant that has a video
// attached — backs the full-screen Reels-style "video shopping" overlay.
// Ordered newest-first so freshly uploaded videos surface first, same as a
// real short-video feed. No pagination: catalogs with a video on every
// product are still small enough (dozens, not thousands) that a single
// query is simpler and fast enough; revisit with a `range()` cursor if
// the video catalog grows into the hundreds.
//
// IMPORTANT: a colour variant can have its OWN video (product_variants.video)
// that's completely separate from the base product's video_url. Previously
// this route only looked at `products.video_url`, so opening the video
// trigger/peek from a variant page whose video lives only on the variant row
// meant `startProductId` was never found in this feed — the reel silently
// fell back to index 0 (some unrelated product) instead of the video the
// shopper actually meant to watch. Both the base product row AND every
// videoed variant row are now included as separate feed entries (keyed by
// their own id), and app/product/[slug]/product-detail.tsx passes the
// active variant's id (falling back to the base product id) so it always
// matches an entry here.
export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = getServerSupabase();

  const { data: products, error: productsError } = await supabase
    .from('products')
    .select('id, slug, name, price, mrp, images, video_url, video_like_count, video_share_count, category_name')
    .order('created_at', { ascending: false });

  if (productsError) {
    return NextResponse.json({ error: productsError.message }, { status: 500 });
  }

  const { data: variants, error: variantsError } = await supabase
    .from('product_variants')
    .select('id, product_id, slug, color, images, video, price_override, created_at')
    .not('video', 'is', null)
    .order('created_at', { ascending: false });

  if (variantsError) {
    return NextResponse.json({ error: variantsError.message }, { status: 500 });
  }

  const productsById = new Map((products ?? []).map((p) => [p.id as string, p]));

  const baseItems = (products ?? [])
    .filter((p) => !!p.video_url)
    .map((p) => ({
      id: p.id as string,
      slug: p.slug as string,
      name: p.name as string,
      price: p.price as number,
      mrp: (p.mrp as number | null) ?? null,
      image: toPublicMediaUrl((p.images as string[] | null)?.[0] ?? null),
      videoUrl: toPublicMediaUrl(p.video_url as string),
      likeCount: (p.video_like_count as number | null) ?? 0,
      shareCount: (p.video_share_count as number | null) ?? 0,
      productId: p.id as string,
      category: (p.category_name as string | null) ?? null,
    }));

  const variantItems = (variants ?? [])
    .filter((v) => !!v.video)
    .map((v) => {
      const parent = productsById.get(v.product_id as string);
      if (!parent) return null; // orphaned variant row — skip defensively
      const images = (v.images as string[] | null) ?? [];
      return {
        id: v.id as string,
        slug: v.slug as string,
        name: parent.name as string,
        price: (v.price_override as number | null) ?? (parent.price as number),
        mrp: (parent.mrp as number | null) ?? null,
        image: toPublicMediaUrl(images[0] ?? (parent.images as string[] | null)?.[0] ?? null),
        videoUrl: toPublicMediaUrl(v.video as string),
        likeCount: (parent.video_like_count as number | null) ?? 0,
        shareCount: (parent.video_share_count as number | null) ?? 0,
        productId: parent.id as string,
        category: (parent.category_name as string | null) ?? null,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  return NextResponse.json(
    { items: [...baseItems, ...variantItems] },
    {
      headers: {
        // This endpoint decides WHICH product's video opens first when a
        // shopper taps "Watch Product Video" — a stale/cached copy here
        // means the reel keeps opening on whatever product was newest at
        // cache time, no matter which product's button was actually
        // tapped (looks exactly like "wrong video always opens", even
        // after the id-matching logic on the client is fixed). No layer
        // between this response and the browser should ever cache it.
        'Cache-Control': 'no-store, must-revalidate',
      },
    }
  );
}
