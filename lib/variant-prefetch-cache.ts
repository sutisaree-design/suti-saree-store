/**
 * In-memory (module-level, client-only) cache of full colour-variant data
 * — including per-size stock, which is the one thing the old flow always
 * fetched fresh over the network on every colour switch.
 *
 * The PDP already shows the *first-opened* colour instantly (it's rendered
 * server-side and passed down as `initialVariant`, see app/product/[slug]/
 * page.tsx) and already background-preloads the *photos* of the other
 * colours (see components/product/variant-swatches.tsx). This cache extends
 * that same idea to the rest of a variant's data: once
 * `variant-swatches.tsx` walks the swatch list in the background, every
 * other colour's full row (sizes/stock included) sits here ready to go, so
 * `handleSelectVariant` in product-detail.tsx can swap to it with zero
 * network round-trip — no flash of "sizes filling in a moment later".
 *
 * Deliberately a plain module-level Map, not React state/context: it's
 * pure client-side memoisation for the lifetime of the tab, doesn't need
 * to trigger a re-render on its own, and every consumer on the page (there
 * is only ever one PDP mounted at a time) should share the same cache.
 */

import { VariantWithSizes } from './variants-api';

const cache = new Map<string, VariantWithSizes>();

export function getPrefetchedVariant(slug: string): VariantWithSizes | undefined {
  return cache.get(slug);
}

export function setPrefetchedVariant(slug: string, variant: VariantWithSizes): void {
  cache.set(slug, variant);
}
