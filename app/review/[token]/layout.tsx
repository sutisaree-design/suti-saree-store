import type { Metadata } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { verifyReviewToken } from '@/lib/review-link-tokens';

// The review page itself is a client component (can't export metadata), so the
// link-preview card lives here. This is what makes the WhatsApp message with
// the review link show the product photo + "How was your <product>?" instead
// of a bare URL. The photo is served as a WhatsApp-safe JPEG by /api/og/pay/[id]
// (works for any order id). Only the product name/photo are exposed.
export async function generateMetadata({ params }: { params: { token: string } }): Promise<Metadata> {
  const base: Metadata = { title: 'Rate your order', robots: { index: false, follow: false } };
  try {
    const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.aruhihandlooms.com').replace(/\/$/, '');
    const verified = await verifyReviewToken(params.token);
    if (!verified) return base;

    const supabase = getSupabaseAdmin();
    const { data: order } = await supabase.from('orders').select('id, items').eq('id', verified.orderId).maybeSingle();
    if (!order) return base;

    const items: any[] = Array.isArray(order.items) ? order.items : [];
    const first = items[0];
    const itemName: string = first?.product_name || first?.name || 'your order';
    const more = items.length > 1 ? ` +${items.length - 1} more` : '';
    const hasImage = items.some((it) => it?.image_url || it?.image || it?.images?.[0]);

    const title = `How was your ${itemName}? · Aruhi Handlooms`;
    const description = `Tap to rate${more} and share a photo. It takes less than a minute.`;

    return {
      ...base,
      title: { absolute: title },
      description,
      openGraph: {
        title,
        description,
        url: `${siteUrl}/review/${params.token}`,
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

export default function ReviewLayout({ children }: { children: React.ReactNode }) {
  return children;
}
