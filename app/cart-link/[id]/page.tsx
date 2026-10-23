import type { Metadata } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { formatINR } from '@/lib/format';
import RedirectToCart from '@/components/cart/redirect-to-cart';

// Landing link used in the abandoned-cart WhatsApp messages. /cart itself
// can't carry a product-specific link preview (the cart lives in the
// visitor's browser), so this page exposes the abandoned cart's first item
// photo (served as JPEG by /api/og/cart/[id]) as og:image, then forwards the
// visitor to /cart. Only the product photo/name/value is exposed; the id is
// an unguessable UUID.
export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const base: Metadata = { title: 'Your cart', robots: { index: false, follow: false } };
  try {
    if (!/^[0-9a-f-]{36}$/i.test(params.id)) return base;
    const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.aruhihandlooms.com').replace(/\/$/, '');
    const { data: cart } = await getSupabaseAdmin()
      .from('abandoned_carts')
      .select('id, items, cart_value')
      .eq('id', params.id)
      .maybeSingle();
    if (!cart) return base;

    const items: any[] = Array.isArray(cart.items) ? cart.items : [];
    const first = items[0];
    const itemName: string = first?.product_name || first?.name || 'your saved item';
    const more = items.length > 1 ? ` +${items.length - 1} more` : '';
    const hasImage = items.some((it) => it?.image_url || it?.image || it?.images?.[0]);

    const title = `${itemName}${more} is waiting in your cart · Aruhi Handlooms`;
    const description = `${cart.cart_value ? `Cart value ${formatINR(cart.cart_value)} · ` : ''}Tap to complete your order`;

    return {
      ...base,
      title: { absolute: title },
      description,
      openGraph: {
        title,
        description,
        url: `${siteUrl}/cart-link/${cart.id}`,
        siteName: 'Aruhi Handlooms',
        type: 'website',
        ...(hasImage
          ? { images: [{ url: `${siteUrl}/api/og/cart/${cart.id}`, width: 800, height: 800, alt: itemName }] }
          : {}),
      },
    };
  } catch {
    return base;
  }
}

export default function CartLinkPage() {
  return <RedirectToCart />;
}
