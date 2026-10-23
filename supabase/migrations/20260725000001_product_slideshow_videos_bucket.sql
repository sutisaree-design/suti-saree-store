-- Storage bucket for admin-generated product slideshow videos (Admin >
-- Products > "Generate Video" button). Public read (so Meta's Graph API
-- can fetch the video_url when posting to Instagram/Facebook/Threads),
-- same pattern as the existing product-images bucket. Only the admin's
-- own upload route writes here, using the SERVICE ROLE client (same
-- pattern as app/api/admin/fulfillment/upload-photo/route.ts), so no
-- anon/authenticated INSERT policy is needed.
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('product-videos', 'product-videos', true, 52428800) -- 50MB cap
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "anon_read_product_videos" ON storage.objects;
CREATE POLICY "anon_read_product_videos" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'product-videos');
