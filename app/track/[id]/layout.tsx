import type { Metadata } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

// Link-preview card for /track/[id] -- so the order link in WhatsApp messages
// (order confirmed / paid / shipped / cancelled) shows the product photo, the
// order number and the current status instead of a bare URL. The page itself
// is unchanged (its own `metadata` only sets robots, which still applies).
// Same access model as the page: the order id is an unguessable UUID; only the
// product name/photo and the status word are exposed, no customer details.
const STATUS_WORD: Record<string, string> = {
  pending: 'Order received',
  paid: 'Payment received',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  failed: 'Payment failed',
};

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const base: Metadata = { title: 'Track your order' };
  try {
    if (!/^[0-9a-f-]{36}$/i.test(params.id)) return base;
    const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.aruhihandlooms.com').replace(/\/$/, '');
    const supabase = getSupabaseAdmin();
    const { data: order } = await supabase.from('orders').select('id, items, status').eq('id', params.id).maybeSingle();
    if (!order) return base;

    const items: any[] = Array.isArray(order.items) ? order.items : [];
    const first = items[0];
    const itemName: string = first?.product_name || first?.name || 'your order';
    const more = items.length > 1 ? ` +${items.length - 1} more` : '';
    const shortId = String(order.id).slice(0, 8).toUpperCase();
    const hasImage = items.some((it) => it?.image_url || it?.image || it?.images?.[0]);

    const title = `Order #${shortId} · ${STATUS_WORD[order.status] || 'Track your order'} · Aruhi Handlooms`;
    const description = `${itemName}${more}. Tap to see your order status.`;

    return {
      ...base,
      title: { absolute: title },
      description,
      openGraph: {
        title,
        description,
        url: `${siteUrl}/track/${order.id}`,
        siteName: 'Aruhi Handlooms',
        type: 'website',
        ...(hasImage
          ? { images: [{ url: `${siteUrl}/api/og/pay/${order.id}`, width: 800, height: 800, alt: itemName }] }
          : {}),
      },
    };
  } catch {
    return base;
  }
}

export default function TrackLayout({ children }: { children: React.ReactNode }) {
  return children;
}
