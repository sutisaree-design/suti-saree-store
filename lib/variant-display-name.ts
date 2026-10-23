// The AI product-title generator bakes the photographed colour directly
// into the base product name (e.g. "Maroon Handloom Rayon Kurti with
// Palazzo" -- see lib/vendor-ai-listing.ts). That's correct for the base
// listing, but once a vendor adds another colour as a variant (e.g. "Steel
// Blue"), every place that renders `product.name` as-is -- the on-page H1,
// share text, etc. -- keeps showing "Maroon ..." even while looking at the
// Steel Blue variant. That's a real on-page SEO problem: the visible H1
// then contradicts the URL slug, the <title>, and the swatch the shopper
// has selected.
//
// This replaces the base product's own colour (its first entry in
// `colors`, e.g. "Maroon") with the variant's colour wherever it appears
// in the product name, so the H1 always matches whichever colour is
// actually being viewed. If the base colour word isn't found in the name
// (the vendor didn't bake a colour into the title, or worded it
// differently), it falls back to prefixing the variant colour instead of
// silently showing the wrong colour.
export function getVariantDisplayName(
  productName: string,
  baseColor: string | null | undefined,
  variantColor: string | null | undefined
): string {
  const name = productName.trim();
  const toColor = variantColor?.trim();
  if (!toColor) return name;

  const fromColor = baseColor?.trim();
  if (fromColor && fromColor.toLowerCase() === toColor.toLowerCase()) return name;

  // Match the base colour as a whole word/phrase (case-insensitive) so
  // "Maroon" doesn't accidentally match inside an unrelated word.
  if (fromColor) {
    const escaped = fromColor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`\\b${escaped}\\b`, 'i');
    if (pattern.test(name)) {
      return name.replace(pattern, toColor);
    }
  }

  // No base colour to swap out (or it isn't part of the name text) --
  // don't guess where to splice it in, just lead with the variant colour.
  return `${toColor} ${name}`;
}
