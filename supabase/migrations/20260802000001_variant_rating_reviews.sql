-- Phase: Per-colour-variant rating & review count override
--
-- Until now, every colour variant of a product silently inherited the base
-- product's admin-set "seed" rating (products.rating) and review count
-- (products.reviews) -- there was no way to give an individual colour its
-- own numbers the way price_override, meta_title etc. already work per
-- variant. This adds that same override pattern for rating/reviews:
--   - NULL  -> variant has no override, storefront falls back to the base
--              product's rating/reviews (today's existing behaviour).
--   - a value -> that colour's own dedicated product page shows this
--              rating/review count instead of the parent product's.
--
-- Real, approved customer reviews (the reviews table) remain keyed to the
-- base product only -- this column only affects the admin-seeded "social
-- proof" numbers shown before/alongside real reviews, same as today.

ALTER TABLE product_variants
  ADD COLUMN IF NOT EXISTS rating numeric,
  ADD COLUMN IF NOT EXISTS reviews integer;
