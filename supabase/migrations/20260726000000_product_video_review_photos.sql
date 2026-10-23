-- Phase 14 — Product video + Review photos (UGC)
-- Safe/additive: no existing column touched, no data deleted.

-- 1) Product video: optional short video URL (mp4/webm) shown as the first
--    slide in the product gallery, before the photos. Admin sets it per
--    product from Admin -> Products.
ALTER TABLE products ADD COLUMN IF NOT EXISTS video_url text;

-- 2) Review photos: customers can attach up to a few photos with their
--    review. Stored as a plain array of public storage URLs, same pattern
--    as products.images.
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS photos text[] DEFAULT '{}'::text[];

-- 3) Storage bucket for review photo uploads (public read, same pattern as
--    the existing product-images bucket).
INSERT INTO storage.buckets (id, name, public)
VALUES ('review-images', 'review-images', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "anon_read_review_images" ON storage.objects;
CREATE POLICY "anon_read_review_images" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'review-images');

-- Only logged-in customers can upload review photos (they must be logged in
-- to submit a review anyway — see reviews.auth_insert_reviews policy).
DROP POLICY IF EXISTS "auth_insert_review_images" ON storage.objects;
CREATE POLICY "auth_insert_review_images" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'review-images');
