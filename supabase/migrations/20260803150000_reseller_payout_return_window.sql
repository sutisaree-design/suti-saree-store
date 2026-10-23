-- ============================================================
-- Reseller payout — wait for the return window before paying
--
-- Problem: the original reseller payout system (see
-- 20260803140000_reseller_payout_system.sql) marked a reseller's
-- margin 'eligible' the moment an order was DELIVERED. But a customer
-- can still return that order for the store's normal return window
-- (settings.fulfillment_settings.return_window_days — same number
-- shown to the customer on /account/orders/[id]) after delivery. If
-- the admin paid the reseller during that window and the order was
-- then returned, the admin would have to claw back margin already
-- sent out — exactly the scenario this migration avoids, mirroring
-- the same "wait out the return window" rule vendor settlements
-- already use (run_weekly_vendor_settlement in
-- 20260808000000_phase4a_settlement_schema.sql).
--
-- New orders.reseller_payout_status lifecycle:
--   pending_delivery -> in_return_window -> eligible -> paid
--                                         \-> void   (RTO / cancelled /
--                                             refunded / a return gets
--                                             filed during the window)
--
-- 'in_return_window' only ever advances to 'eligible' via the new
-- promote_reseller_payouts_after_return_window() function below (run
-- daily by runResellerPayoutWindowJob — see lib/cron-jobs.ts), once
-- reseller_payout_return_window_ends_at has passed. Nothing changes
-- for a payout that's already 'paid' — a return discovered after that
-- point is still a manual clawback matter for the admin, same as
-- before.
-- ============================================================

-- ---------- orders: track delivery time + when the window ends ----------
ALTER TABLE orders ADD COLUMN IF NOT EXISTS reseller_payout_delivered_at timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS reseller_payout_return_window_ends_at timestamptz;

-- Widen the status check to add the new in-between stage.
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_reseller_payout_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_reseller_payout_status_check
  CHECK (reseller_payout_status IN ('pending_delivery', 'in_return_window', 'eligible', 'paid', 'void'));

-- ---------- trigger: delivery now moves an order into the return window, not straight to eligible ----------
CREATE OR REPLACE FUNCTION sync_reseller_payout_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_return_window_days integer;
BEGIN
  IF NEW.is_reseller_order IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  -- Never touch a payout that's already been paid out — any refund/RTO
  -- discovered after the fact is a manual clawback matter for the admin,
  -- not something this trigger should silently reverse.
  IF NEW.reseller_payout_status = 'paid' THEN
    RETURN NEW;
  END IF;

  IF NEW.delivery_status IN ('rto_initiated', 'rto_delivered')
     OR NEW.status IN ('cancelled', 'failed')
     OR NEW.refund_status = 'refunded' THEN
    NEW.reseller_payout_status := 'void';
    RETURN NEW;
  END IF;

  IF (NEW.delivery_status = 'delivered' OR NEW.status = 'delivered')
     AND (NEW.reseller_payout_status = 'pending_delivery' OR NEW.reseller_payout_status IS NULL) THEN
    SELECT coalesce((value->>'return_window_days')::integer, 7)
    INTO v_return_window_days
    FROM settings WHERE key = 'fulfillment_settings';
    v_return_window_days := coalesce(v_return_window_days, 7);

    NEW.reseller_payout_status := 'in_return_window';
    NEW.reseller_payout_delivered_at := now();
    NEW.reseller_payout_return_window_ends_at := now() + (v_return_window_days || ' days')::interval;
  END IF;

  RETURN NEW;
END;
$$;

-- (trigger itself is unchanged, just re-pointing at the updated function)
DROP TRIGGER IF EXISTS trg_sync_reseller_payout_status ON orders;
CREATE TRIGGER trg_sync_reseller_payout_status
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION sync_reseller_payout_status();

-- ---------- trigger: a return filed during the window voids the payout ----------
-- Fires off the `returns` table (not `orders`) because a customer
-- filing a return doesn't necessarily change anything on the order row
-- itself right away. Any return that isn't outright rejected — requested,
-- approved, refunded, or completed — means this order should not pay the
-- reseller, so we void it as soon as it's filed rather than waiting for
-- a refund to actually finish processing.
CREATE OR REPLACE FUNCTION void_reseller_payout_on_return()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IN ('requested', 'approved', 'refunded', 'completed') THEN
    UPDATE orders
    SET reseller_payout_status = 'void'
    WHERE id = NEW.order_id
      AND is_reseller_order = true
      AND reseller_payout_status IN ('pending_delivery', 'in_return_window', 'eligible');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_void_reseller_payout_on_return ON returns;
CREATE TRIGGER trg_void_reseller_payout_on_return
  AFTER INSERT OR UPDATE ON returns
  FOR EACH ROW EXECUTE FUNCTION void_reseller_payout_on_return();

-- ---------- function: promote orders whose return window has closed ----------
-- Run daily (see runResellerPayoutWindowJob in lib/cron-jobs.ts, wired
-- into app/api/cron/daily-jobs/route.ts). A separate function rather
-- than a trigger because nothing about the order row itself changes
-- when the window simply expires with time.
CREATE OR REPLACE FUNCTION promote_reseller_payouts_after_return_window()
RETURNS TABLE (order_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE orders
  SET reseller_payout_status = 'eligible',
      reseller_payout_eligible_at = now()
  WHERE is_reseller_order = true
    AND reseller_payout_status = 'in_return_window'
    AND reseller_payout_return_window_ends_at IS NOT NULL
    AND reseller_payout_return_window_ends_at <= now()
  RETURNING id;
END;
$$;

GRANT EXECUTE ON FUNCTION promote_reseller_payouts_after_return_window() TO service_role;

-- ---------- backfill ----------
-- Orders already sitting at 'eligible' (delivered, not yet paid, under
-- the OLD immediate rule) get re-checked against the new rule: if their
-- return window would already have closed by now, they stay eligible;
-- otherwise they move back into 'in_return_window' so they can't be
-- paid out early. Orders already 'paid' or 'void' are left untouched.
DO $$
DECLARE
  v_return_window_days integer;
BEGIN
  SELECT coalesce((value->>'return_window_days')::integer, 7)
  INTO v_return_window_days
  FROM settings WHERE key = 'fulfillment_settings';
  v_return_window_days := coalesce(v_return_window_days, 7);

  UPDATE orders
  SET reseller_payout_delivered_at = coalesce(reseller_payout_delivered_at, reseller_payout_eligible_at, created_at),
      reseller_payout_return_window_ends_at =
        coalesce(reseller_payout_delivered_at, reseller_payout_eligible_at, created_at)
        + (v_return_window_days || ' days')::interval,
      reseller_payout_status = CASE
        WHEN coalesce(reseller_payout_delivered_at, reseller_payout_eligible_at, created_at)
             + (v_return_window_days || ' days')::interval <= now()
          THEN 'eligible'
        ELSE 'in_return_window'
      END,
      reseller_payout_eligible_at = CASE
        WHEN coalesce(reseller_payout_delivered_at, reseller_payout_eligible_at, created_at)
             + (v_return_window_days || ' days')::interval <= now()
          THEN reseller_payout_eligible_at
        ELSE NULL
      END
  WHERE is_reseller_order = true
    AND reseller_payout_status = 'eligible';
END $$;
