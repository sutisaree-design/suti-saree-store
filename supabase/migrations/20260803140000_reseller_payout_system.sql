-- ============================================================
-- Reseller payout system
--
-- Problem: reseller_profit column already existed on `orders`, but
-- there was NO concept of *when* the store owner should actually pay
-- that profit out to the reseller, and no admin screen to manage/track
-- it. This migration adds that, mirroring the existing
-- vendor_settlements pattern (Phase 4A) as closely as possible.
--
-- Rule implemented: a reseller's margin becomes payable only once the
-- order is actually DELIVERED (orders.delivery_status = 'delivered',
-- the same column the Delhivery tracking cron already fills in — see
-- lib/cron-jobs.ts:runForwardShipmentTrackingJob — or orders.status =
-- 'delivered' for orders that don't carry a courier waybill). If an
-- order instead comes back RTO, gets cancelled, or gets refunded, the
-- payout is voided instead — no margin owed on an order that never
-- reached the customer.
--
-- orders.reseller_payout_status lifecycle:
--   pending_delivery -> eligible -> paid
--                    \-> void   (RTO / cancelled / refunded)
-- ============================================================

-- ---------- reseller_profiles: where to actually send the money ----------
ALTER TABLE reseller_profiles ADD COLUMN IF NOT EXISTS payout_upi_id text;
ALTER TABLE reseller_profiles ADD COLUMN IF NOT EXISTS payout_account_holder text;

-- ---------- reseller_payouts: one row per payout run an admin makes ----------
CREATE TABLE IF NOT EXISTS reseller_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reseller_id uuid NOT NULL REFERENCES reseller_profiles(id) ON DELETE CASCADE,
  total_amount integer NOT NULL DEFAULT 0,
  order_count integer NOT NULL DEFAULT 0,
  payment_reference text,
  notes text,
  paid_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reseller_payouts_reseller_id ON reseller_payouts(reseller_id);

ALTER TABLE reseller_payouts ENABLE ROW LEVEL SECURITY;

-- Same "reseller reads only their own rows" pattern as
-- vendor_settlements/vendors — no INSERT/UPDATE policy for
-- anon/authenticated at all, this table is written only by the admin
-- payout route via the service role.
DROP POLICY IF EXISTS "own_select_reseller_payouts" ON reseller_payouts;
CREATE POLICY "own_select_reseller_payouts" ON reseller_payouts FOR SELECT
  TO authenticated USING (
    reseller_id IN (SELECT id FROM reseller_profiles WHERE user_id = auth.uid())
  );

-- ---------- orders: payout tracking per order ----------
ALTER TABLE orders ADD COLUMN IF NOT EXISTS reseller_payout_status text
  CHECK (reseller_payout_status IN ('pending_delivery', 'eligible', 'paid', 'void'));
ALTER TABLE orders ADD COLUMN IF NOT EXISTS reseller_payout_eligible_at timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS reseller_payout_id uuid
  REFERENCES reseller_payouts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orders_reseller_payout_status ON orders(reseller_payout_status)
  WHERE is_reseller_order = true;

-- ---------- trigger: initialize payout status on a new reseller order ----------
CREATE OR REPLACE FUNCTION init_reseller_payout_status()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.is_reseller_order IS TRUE AND NEW.reseller_payout_status IS NULL THEN
    NEW.reseller_payout_status := 'pending_delivery';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_init_reseller_payout_status ON orders;
CREATE TRIGGER trg_init_reseller_payout_status
  BEFORE INSERT ON orders
  FOR EACH ROW EXECUTE FUNCTION init_reseller_payout_status();

-- ---------- trigger: keep payout status in sync with delivery/cancellation ----------
CREATE OR REPLACE FUNCTION sync_reseller_payout_status()
RETURNS trigger
LANGUAGE plpgsql
AS $$
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
  ELSIF (NEW.delivery_status = 'delivered' OR NEW.status = 'delivered')
        AND NEW.reseller_payout_status IS DISTINCT FROM 'eligible' THEN
    NEW.reseller_payout_status := 'eligible';
    NEW.reseller_payout_eligible_at := now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_reseller_payout_status ON orders;
CREATE TRIGGER trg_sync_reseller_payout_status
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION sync_reseller_payout_status();

-- ---------- backfill: reseller orders placed before this migration ----------
UPDATE orders SET
  reseller_payout_status = CASE
    WHEN delivery_status IN ('rto_initiated', 'rto_delivered')
      OR status IN ('cancelled', 'failed')
      OR refund_status = 'refunded' THEN 'void'
    WHEN delivery_status = 'delivered' OR status = 'delivered' THEN 'eligible'
    ELSE 'pending_delivery'
  END,
  reseller_payout_eligible_at = CASE
    WHEN delivery_status = 'delivered' OR status = 'delivered' THEN now()
    ELSE NULL
  END
WHERE is_reseller_order = true AND reseller_payout_status IS NULL;
