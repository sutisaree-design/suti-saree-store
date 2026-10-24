// Builds the public URL of a category page.
// If the category was imported from WooCommerce it has a woo_path, and we
// keep the OLD WooCommerce URL exactly (SEO / GSC / GMC safe).
// Otherwise we fall back to the new /category/<slug>/ route.
export function categoryPath(c: { slug: string; woo_path?: string | null }): string {
  if (c.woo_path) {
    return `/product-category/${c.woo_path.replace(/^\/+|\/+$/g, '')}/`;
  }
  return `/category/${c.slug}/`;
}
