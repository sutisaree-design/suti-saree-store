import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

// Product photo for the WhatsApp link-preview card of the "complete your
// payment" link (/checkout/resume/[id] -> generateMetadata -> og:image).
//
// Why a dedicated route instead of pointing og:image straight at the stored
// image: the stored product photos are .webp files, and WhatsApp's link
// preview is unreliable with webp -- it often shows the bare domain and no
// picture at all. This route re-encodes the order's first item photo as a
// small square JPEG (which WhatsApp always renders) and serves it from OUR
// domain (aruhihandlooms.com/api/og/pay/<order id>), not the storage host.
//
// Same access model as /checkout/resume/[id] and /order-confirmation/[id]:
// the order id is an unguessable UUID. Only the product photo is exposed --
// no customer details, no prices.

export const runtime = 'nodejs';

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.aruhihandlooms.com').replace(/\/$/, '');

// Only ever fetch images from hosts we already store/serve product photos on.
const ALLOWED_HOST_SUFFIXES = ['.supabase.co', 'aruhihandlooms.com', 'images.pexels.com', 'images.unsplash.com'];

function isAllowedImageUrl(u: URL) {
  if (u.protocol !== 'https:') return false;
  return ALLOWED_HOST_SUFFIXES.some((s) => u.hostname === s.replace(/^\./, '') || u.hostname.endsWith(s));
}

const NOT_FOUND_HEADERS = { 'Cache-Control': 'public, max-age=60' };

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) {
    return new NextResponse(null, { status: 404, headers: NOT_FOUND_HEADERS });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data: order } = await supabase.from('orders').select('items').eq('id', params.id).maybeSingle();
    const items: any[] = Array.isArray(order?.items) ? (order!.items as any[]) : [];
    const rawUrl: string | undefined = items
      .map((it) => it?.image_url || it?.image || it?.images?.[0])
      .find((u) => typeof u === 'string' && u.length > 0);
    if (!rawUrl) {
      // Diagnostic: this is the #1 reason the WhatsApp preview silently has
      // no photo -- the order row simply has no usable image_url on any
      // item. Logged so it shows up in Vercel's function logs instead of
      // disappearing as a bare 404.
      console.warn(`[og/pay] order ${params.id} has no item image_url/image/images[0]`);
      return new NextResponse(null, { status: 404, headers: NOT_FOUND_HEADERS });
    }

    const imageUrl = new URL(rawUrl.startsWith('/') ? `${SITE_URL}${rawUrl}` : rawUrl);
    if (!isAllowedImageUrl(imageUrl)) {
      console.warn(`[og/pay] order ${params.id} image host not allow-listed: ${imageUrl.hostname} (raw: ${rawUrl})`);
      return new NextResponse(null, { status: 404, headers: NOT_FOUND_HEADERS });
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    let upstream: Response;
    try {
      upstream = await fetch(imageUrl.toString(), { signal: controller.signal, cache: 'no-store' });
    } finally {
      clearTimeout(timer);
    }
    if (!upstream.ok) {
      console.warn(`[og/pay] order ${params.id} upstream fetch failed: ${upstream.status} ${upstream.statusText} for ${imageUrl.toString()}`);
      return new NextResponse(null, { status: 404, headers: NOT_FOUND_HEADERS });
    }

    const input = Buffer.from(await upstream.arrayBuffer());
    const jpeg = await sharp(input)
      .rotate() // respect EXIF orientation
      .resize(800, 800, { fit: 'cover', position: sharp.strategy.attention })
      .jpeg({ quality: 82 })
      .toBuffer();

    return new NextResponse(jpeg, {
      status: 200,
      headers: {
        'Content-Type': 'image/jpeg',
        'Content-Length': String(jpeg.length),
        // WhatsApp / CDN can cache this; the photo for an order basically never changes.
        'Cache-Control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800',
      },
    });
  } catch (err) {
    console.error(`[og/pay] order ${params.id} failed:`, err);
    return new NextResponse(null, { status: 404, headers: NOT_FOUND_HEADERS });
  }
}
