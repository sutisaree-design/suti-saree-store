// Shared slug helpers for vendor product creation and AI listing processing.
// Kept in one place so the "slug is derived from the product's current
// title + a short random suffix (for uniqueness)" behaviour stays
// identical everywhere a slug gets generated.

export const slugify = (s: string) =>
  s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');

export function randomSuffix(len = 5) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

/** Builds a fresh `{slug}-{suffix}` value from a product title. */
export function buildSlug(name: string): string {
  return `${slugify(name) || 'product'}-${randomSuffix()}`;
}
