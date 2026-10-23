-- Adds open-tracking to woocommerce_campaign_sends so the admin can see
-- whether a sent campaign email was actually opened, not just "sent".
--
-- How it works: each row's own `id` (uuid, already the primary key) is
-- reused as the tracking id. When an email is sent, a 1x1 pixel is
-- embedded pointing at /api/track/open/<id>. When that pixel is
-- requested by the recipient's mail client, opened_at is stamped once.

ALTER TABLE woocommerce_campaign_sends
  ADD COLUMN IF NOT EXISTS opened_at timestamptz,
  ADD COLUMN IF NOT EXISTS open_count integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_woocommerce_campaign_sends_subject
  ON woocommerce_campaign_sends (subject);
