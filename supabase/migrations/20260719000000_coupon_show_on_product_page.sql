-- ============================================================
-- Coupons: allow an admin to flag a coupon as visible on the
-- product page's "Available Coupons" list.
-- ============================================================
ALTER TABLE coupons
  ADD COLUMN IF NOT EXISTS show_on_product_page boolean NOT NULL DEFAULT false;
