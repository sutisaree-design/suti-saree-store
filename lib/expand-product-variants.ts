import { Product } from './types';
import { getVariantDisplayName } from './variant-display-name';

/** An exploded card carries this extra marker (not part of the `Product`
 *  shape itself) so callers can tell it apart from the base "shows every
 *  colour as a swatch dot" card — e.g. to only autoplay the catalog video
 *  on that one base card instead of on every near-duplicate colour card. */
export type ExpandedProduct = Product & { isVariantCard?: boolean };

/**
 * Expands each product into one card per colour it comes in — its own
 * base colour, plus every `product_variants` row — instead of folding
 * them into swatch dots on a single card. A product with 7 colours turns
 * into 7 separate cards in the grid, each linking straight to that exact
 * colour's own product page.
 *
 * Mirrors exactly how the product-detail page represents a variant as a
 * `Product` (see the `useMemo` merging `variant` onto `baseProduct` in
 * app/product/[slug]/product-detail.tsx): same `id`, only `slug`,
 * `colors`, and `images` swapped to that colour's own. Keeping `id`
 * unchanged means Add-to-Bag / wishlist / cart-line-matching (which all
 * key off `product.id` + `colors[0]`, see `itemColor` in
 * lib/cart-context.tsx) keep working exactly as they do from the PDP —
 * each colour still lands in its own cart line, and the wishlist heart
 * still refers to the same underlying product record.
 *
 * Cards render via the ordinary <ProductCard>, which already hides its
 * own swatch-dot row when a card has nothing left to switch between
 * (`variant_list` cleared to `[]` below) — so an exploded card shows
 * just its own photo, no redundant dots for colours already shown as
 * separate cards.
 */
export function expandProductVariants(products: Product[], maxPerProduct?: number): ExpandedProduct[] {
  // 0 (or anything falsy but explicitly set) means "off" -- one card per
  // product, same as before this feature existed. Undefined means no
  // caller-supplied limit, i.e. unlimited.
  if (maxPerProduct === 0) return products;
  const expanded: ExpandedProduct[] = [];
  for (const product of products) {
    const baseColor = (product.colors?.[0] ?? '').trim();
    const variants = product.variant_list ?? [];
    if (variants.length === 0) {
      expanded.push(product);
      continue;
    }
    // The base colour's own card, unchanged — same as today. This is the
    // one card that still shows every colour as a swatch dot.
    expanded.push(product);
    let cardCount = 1;
    const seen = new Set([baseColor.toLowerCase()]);
    for (const v of variants) {
      if (maxPerProduct && cardCount >= maxPerProduct) break;
      const key = v.color.trim().toLowerCase();
      if (!key || seen.has(key)) continue; // skip the base colour re-added as a variant row
      seen.add(key);
      cardCount += 1;
      expanded.push({
        ...product,
        slug: v.slug,
        name: getVariantDisplayName(product.name, baseColor, v.color),
        colors: [v.color],
        all_colors: [v.color],
        images: v.image ? [v.image, ...product.images.slice(1)] : product.images,
        default_variant_slug: undefined,
        default_variant_image: undefined,
        default_variant_color: undefined,
        variant_list: [],
        // Each exploded colour card reports ITS OWN stock (falls back to the base flag when unknown).
        inStock: v.inStock ?? product.inStock,
        isVariantCard: true,
      });
    }
  }
  return expanded;
}
