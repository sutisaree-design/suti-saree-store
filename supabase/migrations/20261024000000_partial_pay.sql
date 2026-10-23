-- Partial Pay (advance online + balance on delivery)
--
-- Customer pays a % of the order total online (Razorpay) and the rest in cash/UPI to the
-- courier on delivery. The % is set by the admin (Admin > Settings > Partial Pay), stored in
-- settings.key = 'partial_pay'.
--
-- DESIGN: place_order_with_items() is NOT touched. It already stores payment_method as given
-- and only applies the COD risk-gate / online discount to 'cod' / 'online', so 'partial'
-- automatically gets no online discount. The advance is computed HERE, by a trigger, from the
-- authoritative orders.total_amount and the admin setting -- the client never sends an amount.
--
-- RUN THIS BEFORE deploying the storefront change.

-- 1) New columns -------------------------------------------------------------
ALTER TABLE orders ADD COLUMN IF NOT EXISTS advance_percent     numeric;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS advance_amount      integer NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS balance_due         integer NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS advance_payment_id  text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS advance_paid_at     timestamptz;
-- Set when a partial order's advance is refunded (self-cancel) so it is never refunded twice.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS advance_refund_id   text;

-- 2) Default setting (disabled until the admin switches it on) ---------------
INSERT INTO settings (key, value)
VALUES (
  'partial_pay',
  '{"enabled": false, "percent": 50, "min_order_value": 0, "max_order_value": 0, "label": "Partial Pay", "refund_advance_on_cancel": true}'::jsonb
)
ON CONFLICT (key) DO NOTHING;

-- 3) Compute / enforce the advance on the server -----------------------------
CREATE OR REPLACE FUNCTION orders_apply_partial_pay()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_setting jsonb;
  v_enabled boolean;
  v_percent numeric;
  v_min integer;
  v_max integer;
  v_advance integer;
BEGIN
  IF NEW.payment_method IS DISTINCT FROM 'partial' THEN
    RETURN NEW;
  END IF;

  -- Once the advance is paid its numbers are frozen.
  IF TG_OP = 'UPDATE' AND OLD.advance_paid_at IS NOT NULL THEN
    NEW.advance_amount := OLD.advance_amount;
    NEW.advance_percent := OLD.advance_percent;
    RETURN NEW;
  END IF;

  SELECT value INTO v_setting FROM settings WHERE key = 'partial_pay';
  v_enabled := coalesce((v_setting->>'enabled')::boolean, false);
  v_percent := least(greatest(coalesce((v_setting->>'percent')::numeric, 50), 1), 99);
  v_min := greatest(coalesce((v_setting->>'min_order_value')::integer, 0), 0);
  v_max := greatest(coalesce((v_setting->>'max_order_value')::integer, 0), 0);

  IF TG_OP = 'INSERT' THEN
    IF NOT v_enabled THEN
      RAISE EXCEPTION 'PARTIAL_PAY_DISABLED: Partial payment is not available right now. Please choose another payment method.';
    END IF;
    IF NEW.total_amount < v_min OR (v_max > 0 AND NEW.total_amount > v_max) THEN
      RAISE EXCEPTION 'PARTIAL_PAY_NOT_ELIGIBLE: Partial payment is not available for this order value.';
    END IF;
  END IF;

  v_advance := round(NEW.total_amount * v_percent / 100.0);
  v_advance := least(greatest(v_advance, 1), greatest(NEW.total_amount - 1, 1));

  NEW.advance_percent := v_percent;
  NEW.advance_amount := v_advance;
  -- balance_due stays 0 until the advance is actually captured (verify-payment / webhook set it).
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_apply_partial_pay ON orders;
CREATE TRIGGER trg_orders_apply_partial_pay
  BEFORE INSERT OR UPDATE OF total_amount, payment_method ON orders
  FOR EACH ROW EXECUTE FUNCTION orders_apply_partial_pay();

-- 4) Settings are public-read (checkout needs the %), but must NOT be anon-writable:
--    the advance is derived from this row, so a tampered % would let anyone pay 1%.
--    Writes go through /api/admin/settings/partial-pay (service role).
--    (Only 'partial_pay' is added to the existing 20261002 lock list; nothing else changes.)
DROP POLICY IF EXISTS "anon_select_settings" ON settings;
DROP POLICY IF EXISTS "anon_write_settings" ON settings;

CREATE POLICY "anon_select_settings" ON settings FOR SELECT
  TO anon, authenticated
  USING (key NOT IN ('email_provider', 'social_publish', 'cart_recovery_sequence_settings', 'review_reward_settings'));

CREATE POLICY "anon_write_settings" ON settings FOR ALL
  TO anon, authenticated
  USING (key NOT IN ('email_provider', 'social_publish', 'cart_recovery_sequence_settings', 'review_reward_settings', 'partial_pay'))
  WITH CHECK (key NOT IN ('email_provider', 'social_publish', 'cart_recovery_sequence_settings', 'review_reward_settings', 'partial_pay'));

DROP POLICY IF EXISTS "admin_all_settings" ON settings;
CREATE POLICY "admin_all_settings" ON settings FOR ALL
  TO service_role USING (true) WITH CHECK (true);
