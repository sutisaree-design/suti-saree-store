'use client';

import { useEffect, useState } from 'react';
import type { TopVariantMapJSON } from './top-variant-server';

// Module-level cache: every component that calls useTopVariants() during
// this page's lifetime shares one fetch instead of each firing its own
// request (Recently Viewed + You May Also Like can both mount on the same
// product page).
let cachedPromise: Promise<TopVariantMapJSON> | null = null;

function loadTopVariants(): Promise<TopVariantMapJSON> {
  if (!cachedPromise) {
    cachedPromise = fetch('/api/top-variants')
      .then((res) => (res.ok ? res.json() : { variants: {} }))
      .then((body) => body.variants ?? {})
      .catch(() => ({}));
  }
  return cachedPromise;
}

/**
 * Returns { productId: { color, image, slug } } for every product whose
 * best-performing colour variation differs from its default — so product
 * cards outside the PDP (You may also like, Recently viewed, Shop, Category)
 * can show that colour's photo and link straight to it instead of always
 * defaulting to the product's base colour.
 */
export function useTopVariants(): TopVariantMapJSON {
  const [data, setData] = useState<TopVariantMapJSON>({});
  useEffect(() => {
    let cancelled = false;
    loadTopVariants().then((result) => {
      if (!cancelled) setData(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return data;
}
