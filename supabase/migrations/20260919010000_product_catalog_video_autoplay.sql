-- Admin "Add/Edit Product" video section gets a toggle: "Autoplay video in
-- catalog thumbnail (instead of image)". This column stores that choice.
--
-- When true AND products.video_url is set, the storefront catalog grid
-- (shop/category listing cards) renders a silent, looping, autoplaying
-- video in that product's thumbnail slot instead of its first image --
-- see the CatalogCardMedia component. Defaults to false so every existing
-- product keeps showing its normal image thumbnail until an admin
-- explicitly opts a product into video thumbnails.
--
-- The `product-videos` storage bucket (public read, 50MB cap) already
-- exists from the 20260725000000_product_slideshow_videos_bucket.sql
-- migration, so no bucket/policy changes are needed here -- this migration
-- only adds the flag column.

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS autoplay_video_in_catalog boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN products.autoplay_video_in_catalog IS
  'When true and video_url is set, the storefront catalog grid shows a muted autoplaying video instead of the product''s first image in its thumbnail slot.';
