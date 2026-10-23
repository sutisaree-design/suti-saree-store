-- Restock alerts: remember WHICH colour variation the customer wanted, so the
-- admin panel can show the variation image/colour next to each signup.

ALTER TABLE stock_notifications ADD COLUMN IF NOT EXISTS variant_color text;
ALTER TABLE stock_notifications ADD COLUMN IF NOT EXISTS variant_slug text;
ALTER TABLE stock_notifications ADD COLUMN IF NOT EXISTS variant_image text;

-- Old rule allowed only ONE signup per product+email; now it is per product+colour+email.
DO $$
DECLARE c text;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'stock_notifications'::regclass AND contype = 'u'
      AND pg_get_constraintdef(oid) ILIKE '%product_id, email%'
  LOOP
    EXECUTE format('ALTER TABLE stock_notifications DROP CONSTRAINT %I', c);
  END LOOP;
END $$;

DROP INDEX IF EXISTS uq_stock_notifications_product_phone;

CREATE UNIQUE INDEX IF NOT EXISTS uq_stock_notifications_variant_email
  ON stock_notifications (product_id, (coalesce(variant_color, '')), email) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_stock_notifications_variant_phone
  ON stock_notifications (product_id, (coalesce(variant_color, '')), phone) WHERE phone IS NOT NULL;
