-- ---------------------------------------------------------------------
-- Product -> vendor collection lookup (for the "BRIDAL · <Collection>"
-- label on product cards and the PDP).
--
-- The product card / PDP need the vendor's storefront name + slug for
-- every product, so the label can link to /collection/[slug]. Customer-
-- facing product reads deliberately never select `products.vendor_id`
-- (see the comment above CUSTOMER_SAFE_PRODUCT_COLUMNS in
-- lib/products-api.ts) -- so instead of widening that select, this adds
-- a small dedicated public view keyed by product_id, mirroring the
-- security-invoker, safe-columns-only pattern `vendor_public_profiles`
-- already uses.
--
-- Only approved vendors show up here, same rule as vendor_public_profiles.
-- A product with no vendor (or an unapproved/removed vendor) simply has
-- no row -- the UI falls back to just showing the category.
-- ---------------------------------------------------------------------

CREATE OR REPLACE VIEW product_collections
WITH (security_invoker = true) AS
SELECT
  p.id AS product_id,
  v.business_name,
  v.storefront_slug
FROM products p
JOIN vendors v ON v.id = p.vendor_id
WHERE v.status = 'approved'
  AND v.storefront_slug IS NOT NULL;

GRANT SELECT ON product_collections TO anon, authenticated;
