-- ---------------------------------------------------------------------
-- PHASE 2, STEP 2 (optional): after scripts/migrate-to-r2.mjs has
-- copied your existing files into R2, run this to make product pages,
-- your sitemap, and your Google/Meta/Pinterest feeds serve the R2 URLs
-- instead of the Supabase ones -- so those ~500 existing images/videos
-- also stop counting against Supabase egress.
--
-- SAFE / REVERSIBLE:
--   - This is a plain string REPLACE on the URL prefix. The file path
--     after the bucket name (e.g. "products/kurta-123-abc.webp") does
--     NOT change, because migrate-to-r2.mjs preserved it exactly -- so
--     this is a pure find-and-replace, nothing is "recalculated".
--   - The Supabase files are still sitting there untouched. To roll
--     back, just re-run this script with the two REPLACE() arguments
--     swapped (old <-> new).
--   - ALWAYS take a Supabase database backup (Dashboard -> Database ->
--     Backups) before running, as with any bulk UPDATE.
--
-- BEFORE RUNNING: replace the two placeholder values below.
--   1. YOUR_SUPABASE_PROJECT   e.g. abcdxyzproject
--   2. YOUR_R2_PUBLIC_DOMAIN   e.g. https://cdn.yourdomain.com  (NO trailing slash)
-- ---------------------------------------------------------------------

-- products.images (text[]) and products.video_url (text)
UPDATE products
SET images = (
  SELECT array_agg(
    REPLACE(
      img,
      'https://YOUR_SUPABASE_PROJECT.supabase.co/storage/v1/object/public/product-images/',
      'YOUR_R2_PUBLIC_DOMAIN/product-images/'
    )
  )
  FROM unnest(images) AS img
)
WHERE images IS NOT NULL;

UPDATE products
SET video_url = REPLACE(
  video_url,
  'https://YOUR_SUPABASE_PROJECT.supabase.co/storage/v1/object/public/product-videos/',
  'YOUR_R2_PUBLIC_DOMAIN/product-videos/'
)
WHERE video_url IS NOT NULL;

-- product_variants.images (text[])
UPDATE product_variants
SET images = (
  SELECT array_agg(
    REPLACE(
      img,
      'https://YOUR_SUPABASE_PROJECT.supabase.co/storage/v1/object/public/product-images/',
      'YOUR_R2_PUBLIC_DOMAIN/product-images/'
    )
  )
  FROM unnest(images) AS img
)
WHERE images IS NOT NULL;

-- hero_banners.image_url / mobile_image_url (text)
UPDATE hero_banners
SET
  image_url = REPLACE(
    image_url,
    'https://YOUR_SUPABASE_PROJECT.supabase.co/storage/v1/object/public/product-images/',
    'YOUR_R2_PUBLIC_DOMAIN/product-images/'
  ),
  mobile_image_url = REPLACE(
    mobile_image_url,
    'https://YOUR_SUPABASE_PROJECT.supabase.co/storage/v1/object/public/product-images/',
    'YOUR_R2_PUBLIC_DOMAIN/product-images/'
  )
WHERE image_url LIKE '%supabase.co%' OR mobile_image_url LIKE '%supabase.co%';

-- homepage_tiles.image_url (text), if this column exists in your schema
UPDATE homepage_tiles
SET image_url = REPLACE(
  image_url,
  'https://YOUR_SUPABASE_PROJECT.supabase.co/storage/v1/object/public/product-images/',
  'YOUR_R2_PUBLIC_DOMAIN/product-images/'
)
WHERE image_url LIKE '%supabase.co%';

-- After running: spot-check a handful of product pages, your
-- /sitemap.xml, and your Google Merchant feed URL to confirm the new
-- R2 links load correctly before resubmitting feeds in Merchant
-- Center / Meta Commerce Manager / Pinterest.
