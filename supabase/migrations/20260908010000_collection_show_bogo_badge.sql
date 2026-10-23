-- ============================================================
-- COLLECTIONS — "show BOGO badge" toggle
-- ============================================================
-- When a Promotion's scope='collection' targets a collection, the shop
-- grid and product page show a dynamic "Buy X Get Y Free" badge on every
-- product in that collection (see isProductInAnyActivePromotion /
-- getActiveBogoForProduct in lib/cart-context.tsx). This adds a
-- per-collection toggle so the admin can turn that badge off for a
-- specific collection (e.g. keep the discount live but low-key) without
-- touching is_active or show_on_homepage, which control different things.
-- Defaults to true so existing collections keep behaving exactly as they
-- do today.
-- ============================================================

ALTER TABLE collections
  ADD COLUMN IF NOT EXISTS show_bogo_badge boolean NOT NULL DEFAULT true;
