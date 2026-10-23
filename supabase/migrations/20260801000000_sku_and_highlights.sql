-- Phase: SKU codes + AI-filled "Product Highlights" spec block
--
-- 1. SKU codes were never stored anywhere -- the JSON-LD on the product page
--    was faking a `sku` from the row's UUID. This adds a real, editable SKU
--    per product (used when a product has no colour variants yet) and per
--    colour variant (the thing that should actually show as "SKU" in admin).
-- 2. `highlights` is a small JSONB bag for the extra spec fields shown in the
--    "Product Highlights" / "Additional Details" block on the PDP (Fit &
--    Shape, Length, Neck, Sleeve Length/Styling, Net Quantity, etc). The AI
--    listing generator fills this in automatically from the name/photo.

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS sku text,
  ADD COLUMN IF NOT EXISTS highlights jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE product_variants
  ADD COLUMN IF NOT EXISTS sku text;

ALTER TABLE product_variant_sizes
  ADD COLUMN IF NOT EXISTS sku text;

-- Allow duplicate NULLs (products saved before this migration) but keep
-- non-null SKUs unique per table.
DROP INDEX IF EXISTS products_sku_unique_idx;
CREATE UNIQUE INDEX products_sku_unique_idx ON products (sku) WHERE sku IS NOT NULL;

DROP INDEX IF EXISTS product_variants_sku_unique_idx;
CREATE UNIQUE INDEX product_variants_sku_unique_idx ON product_variants (sku) WHERE sku IS NOT NULL;

DROP INDEX IF EXISTS product_variant_sizes_sku_unique_idx;
CREATE UNIQUE INDEX product_variant_sizes_sku_unique_idx ON product_variant_sizes (sku) WHERE sku IS NOT NULL;
