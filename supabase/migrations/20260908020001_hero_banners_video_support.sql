-- ============================================================
-- HERO BANNERS — video support
-- ============================================================
-- Lets each hero banner be either a static image (existing behaviour)
-- or a short looping video, chosen in Admin > Hero Banners. The
-- storefront carousel (components/home/hero-banner-carousel.tsx)
-- always renders video banners muted + autoplay + loop -- required by
-- every browser's autoplay policy anyway, and keeps the homepage from
-- suddenly playing sound.
--
-- `poster_url` is an optional still frame shown while the video's
-- first frame is loading (and as the <video poster> fallback), same
-- role as a thumbnail -- reuses the existing product-images bucket via
-- uploadHeroBannerImage(), no new bucket needed.
-- ============================================================

ALTER TABLE hero_banners
  ADD COLUMN IF NOT EXISTS media_type text NOT NULL DEFAULT 'image'
    CHECK (media_type IN ('image', 'video'));

ALTER TABLE hero_banners
  ADD COLUMN IF NOT EXISTS poster_url text;

-- Optional mobile-specific media. NULL means "use the desktop columns
-- above on phones too" — so every existing banner keeps working exactly
-- as before, and adding mobile media is opt-in per banner.
ALTER TABLE hero_banners
  ADD COLUMN IF NOT EXISTS mobile_image_url text;

ALTER TABLE hero_banners
  ADD COLUMN IF NOT EXISTS mobile_media_type text
    CHECK (mobile_media_type IS NULL OR mobile_media_type IN ('image', 'video'));

ALTER TABLE hero_banners
  ADD COLUMN IF NOT EXISTS mobile_poster_url text;

COMMENT ON COLUMN hero_banners.media_type IS
  'image (default) or video. Video banners render muted/autoplay/loop on the storefront.';
COMMENT ON COLUMN hero_banners.poster_url IS
  'Optional still-frame shown while a video banner loads. Ignored for image banners.';
COMMENT ON COLUMN hero_banners.mobile_image_url IS
  'Optional phone-only override of image_url. NULL = reuse the desktop image_url on mobile.';
COMMENT ON COLUMN hero_banners.mobile_media_type IS
  'Optional phone-only override of media_type. NULL = reuse the desktop media_type on mobile.';
COMMENT ON COLUMN hero_banners.mobile_poster_url IS
  'Optional phone-only override of poster_url. NULL = reuse the desktop poster_url on mobile.';
