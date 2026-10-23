-- Back-in-stock alerts: allow WhatsApp number (with or without email).
-- Public signups now go through POST /api/stock-notify (service role), so the
-- anon upsert path (broken since anon UPDATE was removed) is no longer needed.

ALTER TABLE stock_notifications ALTER COLUMN email DROP NOT NULL;
ALTER TABLE stock_notifications ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE stock_notifications ADD COLUMN IF NOT EXISTS whatsapp_sent boolean NOT NULL DEFAULT false;

ALTER TABLE stock_notifications DROP CONSTRAINT IF EXISTS stock_notifications_contact_check;
ALTER TABLE stock_notifications
  ADD CONSTRAINT stock_notifications_contact_check CHECK (email IS NOT NULL OR phone IS NOT NULL);

CREATE UNIQUE INDEX IF NOT EXISTS uq_stock_notifications_product_phone
  ON stock_notifications (product_id, phone) WHERE phone IS NOT NULL;

DROP POLICY IF EXISTS "anon_insert_stock_notifications" ON stock_notifications;
