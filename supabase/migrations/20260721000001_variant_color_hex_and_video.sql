-- Phase: Variant colour swatches + variant video
--
-- 1. `color_hex` stores the actual swatch colour (e.g. #7A1F2B) picked from
--    the admin's colour library (or typed manually for a custom colour), so
--    the storefront can render a real colour dot instead of just falling
--    back to text initials when a variant has no image yet.
-- 2. `video` is an optional short video URL per colour variant (fabric
--    drape / try-on), same pattern as the existing `products.video_url`.

ALTER TABLE product_variants
  ADD COLUMN IF NOT EXISTS color_hex text,
  ADD COLUMN IF NOT EXISTS video text;
