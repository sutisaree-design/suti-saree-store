-- Adds click-tracking alongside the existing open-tracking (see
-- 20260805000000_campaign_open_tracking.sql). Every outbound link in a
-- campaign email (product cards, category thumbnails, CTA buttons, the
-- reseller promo banner) is rewritten to route through
-- /api/track/click/<send id> before redirecting to the real destination,
-- so we can tell not just "was this opened" but "did they actually click
-- through to the site" -- same per-send uuid the pixel and unsubscribe
-- link already reuse.

ALTER TABLE woocommerce_campaign_sends
  ADD COLUMN IF NOT EXISTS clicked_at timestamptz,
  ADD COLUMN IF NOT EXISTS click_count integer NOT NULL DEFAULT 0;
