-- ============================================================
-- Coupons: admin toggle controlling whether a coupon is included
-- in the Google Merchant Center promotions feed
-- (/api/promotions-feed). Default OFF so nothing is sent to
-- Google until you explicitly enable it per coupon.
-- ============================================================
ALTER TABLE coupons
  ADD COLUMN IF NOT EXISTS show_in_google_promotions boolean NOT NULL DEFAULT false;
