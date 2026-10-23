'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Keeps `window.__BLUR_SHIMMER_ENABLED__` and
 * `window.__BLUR_REAL_PREVIEW_ENABLED__` in sync across client-side
 * navigation.
 *
 * The root layout (app/layout.tsx) only ever sets those globals ONCE, via
 * a `beforeInteractive` inline script, at the moment of a full page load.
 * The App Router keeps the root layout mounted for a shopper's entire
 * session — it never re-runs on client-side navigation between pages —
 * so without this, toggling Admin > Settings > Blur Placeholder while a
 * shopper already had the site open did nothing for them: the shop grid,
 * category grid, colour swatches (components/product/variant-swatches.tsx,
 * components/catalog-card-media.tsx, app/shop/shop-content.tsx,
 * app/categories/page.tsx) and even the product gallery itself
 * (components/product/product-gallery.tsx) kept reading whatever value
 * was true when the tab first loaded, until a hard refresh.
 *
 * Mounted once in the root layout's <body>. `usePathname()` only changes
 * on an actual navigation (not on every render), so this fires once per
 * page the shopper visits — not continuously — and just refreshes the
 * two globals every component in the tree already reads via
 * `isShimmerEnabled()` / `isRealPreviewEnabled()` (lib/image-placeholder.ts).
 */
export default function BlurPlaceholderSync() {
  const pathname = usePathname();
  const lastFetchedAt = useRef(0);

  useEffect(() => {
    // Cheap de-dupe: never fire more than once every 10s even on rapid
    // back/forward or fast link-tapping — this is a background sync, not
    // something any render is waiting on, so there's no rush.
    const now = Date.now();
    if (now - lastFetchedAt.current < 10_000) return;
    lastFetchedAt.current = now;

    let cancelled = false;
    fetch('/api/settings/blur-placeholder', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        const g = window as unknown as Record<string, unknown>;
        if (typeof data.shimmer_enabled === 'boolean') g.__BLUR_SHIMMER_ENABLED__ = data.shimmer_enabled;
        if (typeof data.real_preview_enabled === 'boolean') g.__BLUR_REAL_PREVIEW_ENABLED__ = data.real_preview_enabled;
      })
      .catch(() => {
        // Best-effort — a failed sync just means this page keeps using
        // whatever value it already had, same as before this existed.
      });

    return () => {
      cancelled = true;
    };
  }, [pathname]);

  return null;
}
