-- ============================================================
-- Review variation (colour) tagging + step-gated reward support
--
-- Context: reviews were only ever linked to the base product_id, with
-- no record of *which colour variant* the reviewer actually bought --
-- so the storefront could never show "Reviewed: Green" or let a
-- shopper filter reviews down to the colour they're looking at.
-- order_items already carries a `color` per line (see
-- app/checkout/page.tsx's orderItems.map), so we just carry that
-- same value through onto the review row at submit time.
--
-- No new tables needed for the "reward only after all 3 steps"
-- change -- rating/comment/photos already live on the reviews row
-- itself, so step-completion is derived from that existing data (see
-- lib/review-rewards-server.ts's getReviewStepProgress). This
-- migration only adds the columns needed to remember *which colour*
-- was reviewed.
-- ============================================================

ALTER TABLE reviews ADD COLUMN IF NOT EXISTS variant_color text;
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS variant_slug text;

-- Powers "show only reviews for this colour" on the product page --
-- filtered by (product_id, variant_color) together, so this composite
-- index serves that query directly instead of a full scan + filter.
CREATE INDEX IF NOT EXISTS idx_reviews_product_variant_color
  ON reviews(product_id, variant_color);

COMMENT ON COLUMN reviews.variant_color IS
  'Colour of the exact variant the reviewer bought/is reviewing (copied from order_items.color at submit time for guest reviews). NULL for older reviews and for products with no colour variants.';
COMMENT ON COLUMN reviews.variant_slug IS
  'Slug of the exact colour-variant product page the review belongs to, so "view this variant" links can be built without a join.';
