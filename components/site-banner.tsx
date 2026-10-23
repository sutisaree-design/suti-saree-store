'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { fetchSiteBanner, type SiteBanner as SiteBannerSettings } from '@/lib/settings-api';
import { toPublicMediaUrl } from '@/lib/media-url';

/**
 * Promotional banner (set from Admin > Store Settings). Shows on every
 * page EXCEPT checkout, same as the original storewide behavior — with
 * one carve-out: the home page and individual product pages are each
 * gated by their own toggle (Admin > Settings > Site Banner > "Show on
 * home page" / "Show on product page"), since those two pages often want
 * the banner turned off independently of everywhere else. Every other
 * page (shop, category, etc.) always shows the banner whenever one is
 * set, exactly like before these toggles existed.
 */
export default function SiteBanner({ initialBanner }: { initialBanner?: SiteBannerSettings }) {
  const pathname = usePathname();
  // `initialBanner` is read on the server (app/layout.tsx), so the banner is
  // already in the first HTML -- it no longer pops in after hydration and
  // pushes the page down. The client fetch below only runs as a fallback if
  // this component is ever mounted without it.
  const [imageUrl, setImageUrl] = useState(initialBanner?.image_url || '');
  const [linkUrl, setLinkUrl] = useState(initialBanner?.link_url || '');
  const [showOnHome, setShowOnHome] = useState(!!initialBanner?.show_on_home);
  const [showOnProduct, setShowOnProduct] = useState(!!initialBanner?.show_on_product);

  useEffect(() => {
    if (initialBanner) return;
    fetchSiteBanner()
      .then((b) => {
        setImageUrl(b.image_url || '');
        setLinkUrl(b.link_url || '');
        setShowOnHome(!!b.show_on_home);
        setShowOnProduct(!!b.show_on_product);
      })
      .catch(() => {});
  }, [initialBanner]);

  const isCheckout = pathname?.startsWith('/checkout');
  const isHome = pathname === '/';
  const isProduct = pathname?.startsWith('/product/');
  // Home/product are toggle-gated; every other non-checkout page keeps
  // the original always-on behavior.
  const allowedHere = isHome ? showOnHome : isProduct ? showOnProduct : !isCheckout;

  if (!imageUrl || !allowedHere) return null;

  const img = (
    <Image
      src={toPublicMediaUrl(imageUrl) || imageUrl}
      alt="Promotional banner"
      width={1600}
      height={400}
      sizes="100vw"
      priority
      className="h-auto w-full object-cover"
    />
  );

  return (
    <div className="w-full">
      {linkUrl ? (
        <Link href={linkUrl} className="block">
          {img}
        </Link>
      ) : (
        img
      )}
    </div>
  );
}
