-- Fix Google Merchant Center "Misrepresentation" flag.
--
-- Root cause: multiple places in the app defaulted a product's `rating`
-- column to 4.5 whenever it wasn't explicitly supplied (admin create form,
-- vendor create API, and a `Number(row.rating) || 4.5` falsy-zero bug on
-- read). That means many products with 0 real reviews are showing a
-- fabricated "4.5 rating" on the storefront -- a fake trust signal, which is
-- exactly what Google's Misrepresentation policy flags.
--
-- The application code has been fixed to stop writing/reading this fake
-- default. This migration cleans up the rows that already have the bad data:
-- any product or variant with reviews = 0 (or null) but rating = 4.5 almost
-- certainly never had a real rating -- it just hit the old default. We reset
-- those to 0 so the storefront stops showing a rating with no reviews behind
-- it.
--
-- NOTE: if you know some of these products *do* have genuine reviews that
-- were entered directly into `reviews` without ever touching `rating`
-- (unlikely, but check first), review the SELECT below before running the
-- UPDATE.

-- 1) Inspect affected rows first (safe, read-only):
--    select id, name, rating, reviews from products
--    where rating = 4.5 and coalesce(reviews, 0) = 0;

-- 2) Fix products table.
update products
set rating = 0
where rating = 4.5
  and coalesce(reviews, 0) = 0;

-- 3) Fix product_variants table, if it independently stores rating/reviews.
update product_variants
set rating = 0
where rating = 4.5
  and coalesce(reviews, 0) = 0;
