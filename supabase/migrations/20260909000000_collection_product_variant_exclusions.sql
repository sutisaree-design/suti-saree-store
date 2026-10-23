-- ---------------------------------------------------------------------
-- Admin > Collections product picker: let the admin pick which of a
-- product's colour variations actually belong in the collection, instead
-- of it being all-or-nothing per product.
--
-- `product_variants` rows don't have a stable identity the admin panel
-- can show *before* the product is saved to a collection (the base
-- product's own colour isn't a `product_variants` row at all -- see
-- lib/products-api.ts resolveAllColors()), so exclusions are recorded by
-- slug instead of a foreign key:
--   - the literal string 'base' means "this product's own base colour"
--   - anything else is expected to match a `product_variants.slug`
--
-- Default '{}' (nothing excluded) preserves today's behaviour for every
-- existing collection_products row -- a product with no exclusions shows
-- every variation it has, exactly like before this migration.
-- ---------------------------------------------------------------------

ALTER TABLE collection_products
  ADD COLUMN IF NOT EXISTS excluded_variant_slugs text[] NOT NULL DEFAULT '{}';
