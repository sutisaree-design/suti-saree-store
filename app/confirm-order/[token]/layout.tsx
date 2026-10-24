import type { Metadata } from 'next';
import { getCodConfirmPreview } from '@/lib/cod-confirmation';

// Private page: never indexed. The OpenGraph tags exist only so the link
// previews nicely in WhatsApp -- showing the exact product from the order.
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: { token: string } }): Promise<Metadata> {
  const base: Metadata = {
    title: 'Confirm your order',
    robots: { index: false, follow: false },
  };
  try {
    const preview = await getCodConfirmPreview(params.token);
    if (!preview) return base;
    return {
      ...base,
      title: preview.title,
      description: preview.description,
      openGraph: {
        type: 'website',
        siteName: 'Sutisaree',
        title: preview.title,
        description: preview.description,
        ...(preview.imageUrl ? { images: [{ url: preview.imageUrl, alt: preview.description }] } : {}),
      },
      twitter: {
        card: preview.imageUrl ? 'summary_large_image' : 'summary',
        title: preview.title,
        description: preview.description,
        ...(preview.imageUrl ? { images: [preview.imageUrl] } : {}),
      },
    };
  } catch {
    return base;
  }
}

export default function ConfirmOrderLayout({ children }: { children: React.ReactNode }) {
  return children;
}
