-- ---------------------------------------------------------------------
-- Phase 4A — Fee Formula, Settlement Schema, COD Reconciliation, Clawback
-- Schema + calculation logic only, per your request — no admin/vendor
-- UI here (that's Phase 4B). Builds on Phase 1, 2A-2E, 3A-3C.
--
-- What already existed before this migration (context for anyone
-- reading this file later without the earlier phase migrations):
--   - order_items.stage already has 'delivered' in its CHECK constraint
--     (added in Phase 3A) but NOTHING in the app ever actually sets it
--     — the fulfillment API only goes up to 'shipped_to_customer'. This
--     migration adds a 'deliver' action to
--     app/api/admin/fulfillment/[id]/route.ts (admin-only, service-role,
--     same pattern as every other action in that file) so there's a
--     real way to reach 'delivered' and trigger the fee calc below.
--   - order_items.price is the UNIT price for that line (see
--     app/checkout/page.tsx — `price: i.product.price`), NOT the line
--     total. "sale_price" in your fee formula is treated here as the
--     LINE total, i.e. price * quantity — documented via a comment on
--     the trigger function below in case you intended per-unit instead
--     (easy one-line change if so).
--   - orders.payment_method already exists ('cod' / other values) —
--     reused directly instead of adding a duplicate `payment_mode`
--     column, per your point 4.
-- ---------------------------------------------------------------------

-- ============================================================
-- 1. Settings — handling fee formula + settlement config
--    Same key/value `settings` table pattern as vendor_order_settings
--    (Phase 3A) / store_info / shipping etc (lib/settings-api.ts).
--    Editable later from an admin settings screen (Phase 4B) without a
--    migration.
-- ============================================================

INSERT INTO settings (key, value)
VALUES (
  'vendor_settlement_settings',
  jsonb_build_object(
    'handling_fee_base', 0,
    'handling_fee_percent', 10,
    'return_window_days', 7
  )
)
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- 2. order_items — fee calculation + settlement linkage columns
-- ============================================================

ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS fee_amount numeric(10, 2),
  ADD COLUMN IF NOT EXISTS vendor_payable_amount numeric(10, 2),
  ADD COLUMN IF NOT EXISTS settlement_id uuid;
  -- settlement_id -> vendor_settlements(id) FK added after that table
  -- exists (section 4 below), so this column isn't orphaned if this
  -- migration is ever re-run partially.

COMMENT ON COLUMN order_items.vendor_payable_amount IS
  'sale_price (price * quantity) minus fee_amount, calculated once by calculate_order_item_settlement_fee() the moment stage becomes ''delivered''. NULL until then. Never recalculated afterwards even if settings change later — a delivered order''s payable amount is locked in.';
COMMENT ON COLUMN order_items.settlement_id IS
  'Set by the weekly settlement cron (Phase 4A point 3) once this item''s return window has passed and (for COD) the courier has remitted payment. NULL = not yet settled.';

CREATE INDEX IF NOT EXISTS idx_order_items_settlement_id ON order_items(settlement_id);
-- The settlement cron's main query: "delivered, vendor-sourced, not yet
-- settled, past its return window".
CREATE INDEX IF NOT EXISTS idx_order_items_delivered_unsettled
  ON order_items(delivered_at)
  WHERE stage = 'delivered' AND vendor_id IS NOT NULL AND settlement_id IS NULL;

-- ============================================================
-- 3. orders — COD reconciliation flags
--    Per-order (not per-item) because COD is collected by the courier
--    for the whole shipment, not per line item.
-- ============================================================

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS cod_collected_by_courier boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cod_remitted_to_us boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cod_remitted_at timestamptz;

COMMENT ON COLUMN orders.cod_remitted_to_us IS
  'Only relevant when payment_method = ''cod''. A COD order''s items are settlement-eligible only once this is true — the courier has actually forwarded the collected cash to us. Prepaid orders are eligible as soon as delivered (this flag is irrelevant for them). Set via PATCH /api/admin/orders/[id]/cod (service role) — no UI yet, Phase 4B.';

-- ============================================================
-- 4. vendor_settlements — weekly settlement batches
-- ============================================================

CREATE TABLE IF NOT EXISTS vendor_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  week_end date NOT NULL,
  total_amount numeric(10, 2) NOT NULL DEFAULT 0,
  clawback_deducted numeric(10, 2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid')),
  payment_reference text,
  paid_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vendor_settlements_vendor_id ON vendor_settlements(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_settlements_status ON vendor_settlements(status);

-- Now that vendor_settlements exists, wire up order_items.settlement_id's FK.
ALTER TABLE order_items DROP CONSTRAINT IF EXISTS order_items_settlement_id_fkey;
ALTER TABLE order_items
  ADD CONSTRAINT order_items_settlement_id_fkey
  FOREIGN KEY (settlement_id) REFERENCES vendor_settlements(id) ON DELETE SET NULL;

ALTER TABLE vendor_settlements ENABLE ROW LEVEL SECURITY;

-- Same "vendor reads only their own row" pattern as `vendors` (Phase 1)
-- — no INSERT/UPDATE policy for authenticated at all, this table is
-- written only by the weekly cron / admin routes via the service role.
DROP POLICY IF EXISTS "own_select_vendor_settlements" ON vendor_settlements;
CREATE POLICY "own_select_vendor_settlements" ON vendor_settlements FOR SELECT
  TO authenticated USING (
    vendor_id IN (SELECT id FROM vendors WHERE user_id = auth.uid())
  );

DROP TRIGGER IF EXISTS trg_vendor_settlements_touch_updated_at ON vendor_settlements;
CREATE TRIGGER trg_vendor_settlements_touch_updated_at
  BEFORE UPDATE ON vendor_settlements
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
-- touch_updated_at() already exists in this schema (used by `returns`,
-- Phase 3A/full_feature_schema) — reused as-is.

-- ============================================================
-- 5. vendor_clawbacks — refunds/returns against an ALREADY-PAID
--    settlement, deducted from the vendor's next settlement cycle.
-- ============================================================

CREATE TABLE IF NOT EXISTS vendor_clawbacks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  order_item_id uuid REFERENCES order_items(id) ON DELETE SET NULL,
  return_id uuid REFERENCES returns(id) ON DELETE SET NULL,
  source_settlement_id uuid REFERENCES vendor_settlements(id) ON DELETE SET NULL,
  applied_settlement_id uuid REFERENCES vendor_settlements(id) ON DELETE SET NULL,
  amount numeric(10, 2) NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'applied')),
  created_at timestamptz NOT NULL DEFAULT now(),
  applied_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_vendor_clawbacks_vendor_pending
  ON vendor_clawbacks(vendor_id)
  WHERE status = 'pending';

ALTER TABLE vendor_clawbacks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own_select_vendor_clawbacks" ON vendor_clawbacks;
CREATE POLICY "own_select_vendor_clawbacks" ON vendor_clawbacks FOR SELECT
  TO authenticated USING (
    vendor_id IN (SELECT id FROM vendors WHERE user_id = auth.uid())
  );

-- ---------------------------------------------------------------------
-- create_vendor_clawback — called by the `returns` trigger below.
-- Only fires when the order item's settlement was already marked
-- 'paid' (per your point 5: "JAB TAK uska settlement already vendor ko
-- Paid mark ho chuka hai"). If the settlement is still 'pending' (not
-- paid out yet), no clawback row is created — the weekly cron's own
-- "not yet settled" filter naturally keeps an unsettled, now-returned
-- item out of any future settlement (it will simply never qualify,
-- since it's no longer in stage 'delivered').
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION create_vendor_clawback_if_paid()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item record;
  v_settlement record;
BEGIN
  -- Only act on the transition INTO a refunded/completed state.
  IF NEW.status NOT IN ('refunded', 'completed') THEN
    RETURN NEW;
  END IF;
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;
  IF NEW.order_item_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT id, vendor_id, settlement_id, vendor_payable_amount
  INTO v_item
  FROM order_items
  WHERE id = NEW.order_item_id;

  IF v_item.vendor_id IS NULL OR v_item.settlement_id IS NULL THEN
    RETURN NEW; -- not a vendor item, or never settled — nothing to claw back
  END IF;

  SELECT id, status INTO v_settlement
  FROM vendor_settlements
  WHERE id = v_item.settlement_id;

  IF v_settlement.status = 'paid' THEN
    INSERT INTO vendor_clawbacks (
      vendor_id, order_item_id, return_id, source_settlement_id, amount, status
    ) VALUES (
      v_item.vendor_id,
      v_item.id,
      NEW.id,
      v_settlement.id,
      coalesce(v_item.vendor_payable_amount, 0),
      'pending'
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_returns_create_vendor_clawback ON returns;
CREATE TRIGGER trg_returns_create_vendor_clawback
  AFTER UPDATE ON returns
  FOR EACH ROW EXECUTE FUNCTION create_vendor_clawback_if_paid();

-- ============================================================
-- 6. Fee calculation — fires the moment an order_item's stage becomes
--    'delivered'. fee = handling_fee_base + (sale_price * percent/100);
--    vendor_payable_amount = sale_price - fee. sale_price here =
--    price * quantity (this line's total — see the note at the top of
--    this file about order_items.price being a unit price).
-- ============================================================

CREATE OR REPLACE FUNCTION calculate_order_item_settlement_fee()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fee_base numeric;
  v_fee_percent numeric;
  v_sale_price numeric;
  v_fee numeric;
BEGIN
  IF NEW.stage <> 'delivered' OR OLD.stage = 'delivered' OR NEW.vendor_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT
    coalesce((value->>'handling_fee_base')::numeric, 0),
    coalesce((value->>'handling_fee_percent')::numeric, 10)
  INTO v_fee_base, v_fee_percent
  FROM settings WHERE key = 'vendor_settlement_settings';

  v_fee_base := coalesce(v_fee_base, 0);
  v_fee_percent := coalesce(v_fee_percent, 10);

  v_sale_price := coalesce(NEW.price, 0) * coalesce(NEW.quantity, 1);
  v_fee := round(v_fee_base + (v_sale_price * v_fee_percent / 100), 2);
  -- Fee can never exceed the sale price — payable floors at 0 rather
  -- than going negative on a very small/heavily-discounted line item.
  IF v_fee > v_sale_price THEN
    v_fee := v_sale_price;
  END IF;

  NEW.delivered_at := coalesce(NEW.delivered_at, now());
  NEW.fee_amount := v_fee;
  NEW.vendor_payable_amount := v_sale_price - v_fee;

  RETURN NEW;
END;
$$;

-- BEFORE UPDATE (not AFTER) so it can set NEW.* directly on the same
-- row/statement — same style as touch_order_item_stage_timestamp
-- (Phase 3A). Runs regardless of which code path flips stage to
-- 'delivered' (the fulfillment API's new 'deliver' action today, or
-- any future path), as long as it goes through the service-role client
-- like every other fulfillment write in this schema.
DROP TRIGGER IF EXISTS trg_order_items_calculate_fee ON order_items;
CREATE TRIGGER trg_order_items_calculate_fee
  BEFORE UPDATE ON order_items
  FOR EACH ROW EXECUTE FUNCTION calculate_order_item_settlement_fee();

-- ============================================================
-- 7. Extend the Phase 3A/3C fulfillment guard trigger to also protect
--    every column this migration added. Full CREATE OR REPLACE of the
--    function body — the trigger itself already exists (Phase 3A) and
--    points at this function by name.
-- ============================================================

CREATE OR REPLACE FUNCTION guard_order_item_fulfillment_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN
    IF NEW.stage IS DISTINCT FROM OLD.stage
       OR NEW.vendor_id IS DISTINCT FROM OLD.vendor_id
       OR NEW.variant_unit_id IS DISTINCT FROM OLD.variant_unit_id
       OR NEW.barcode IS DISTINCT FROM OLD.barcode
       OR NEW.liability IS DISTINCT FROM OLD.liability
       OR NEW.vendor_accept_deadline IS DISTINCT FROM OLD.vendor_accept_deadline
       OR NEW.vendor_accepted_at IS DISTINCT FROM OLD.vendor_accepted_at
       OR NEW.pickup_requested_at IS DISTINCT FROM OLD.pickup_requested_at
       OR NEW.pickup_photo_url IS DISTINCT FROM OLD.pickup_photo_url
       OR NEW.warehouse_received_photo_url IS DISTINCT FROM OLD.warehouse_received_photo_url
       OR NEW.received_at IS DISTINCT FROM OLD.received_at
       OR NEW.qc_defect_found IS DISTINCT FROM OLD.qc_defect_found
       OR NEW.qc_color_match IS DISTINCT FROM OLD.qc_color_match
       OR NEW.qc_fabric_check IS DISTINCT FROM OLD.qc_fabric_check
       OR NEW.qc_tag_removed IS DISTINCT FROM OLD.qc_tag_removed
       OR NEW.qc_condition_notes IS DISTINCT FROM OLD.qc_condition_notes
       OR NEW.qc_checked_at IS DISTINCT FROM OLD.qc_checked_at
       OR NEW.packed_photo_url IS DISTINCT FROM OLD.packed_photo_url
       OR NEW.packed_at IS DISTINCT FROM OLD.packed_at
       OR NEW.shipped_courier_name IS DISTINCT FROM OLD.shipped_courier_name
       OR NEW.shipped_tracking_number IS DISTINCT FROM OLD.shipped_tracking_number
       OR NEW.shipped_at IS DISTINCT FROM OLD.shipped_at
       OR NEW.delivered_at IS DISTINCT FROM OLD.delivered_at
       OR NEW.fee_amount IS DISTINCT FROM OLD.fee_amount
       OR NEW.vendor_payable_amount IS DISTINCT FROM OLD.vendor_payable_amount
       OR NEW.settlement_id IS DISTINCT FROM OLD.settlement_id
    THEN
      RAISE EXCEPTION 'Only admin/vendor-authorized backend routes can change order fulfillment fields';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Guard the two new COD flags on `orders` too — that table's anon
-- UPDATE policy is fully open (`USING (true)`, inherited from the
-- original schema for guest checkout — see the standing note in the
-- Phase 3A migration), so without this, anyone with the anon key could
-- flip cod_remitted_to_us themselves and fake settlement-eligibility.
CREATE OR REPLACE FUNCTION guard_order_cod_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN
    IF NEW.cod_collected_by_courier IS DISTINCT FROM OLD.cod_collected_by_courier
       OR NEW.cod_remitted_to_us IS DISTINCT FROM OLD.cod_remitted_to_us
       OR NEW.cod_remitted_at IS DISTINCT FROM OLD.cod_remitted_at
    THEN
      RAISE EXCEPTION 'Only admin/service-role backend routes can change COD reconciliation fields';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_order_cod_fields ON orders;
CREATE TRIGGER trg_guard_order_cod_fields
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION guard_order_cod_fields();

-- ============================================================
-- 8. run_weekly_vendor_settlement — the cron's core logic as one
--    atomic function (same "one transaction, all-or-nothing per
--    vendor" spirit as place_order_with_items in Phase 3A). The actual
--    Vercel Cron endpoint (app/api/cron/vendor-settlement/route.ts)
--    just calls this and reports the result — kept in SQL so it can
--    also be triggered manually from the Supabase SQL editor for
--    testing without waiting a week.
--
--    Eligibility per item:
--      - stage = 'delivered', vendor_id NOT NULL, settlement_id IS NULL
--      - delivered_at + return_window_days <= now()
--      - prepaid orders: eligible as soon as the above is true
--      - COD orders: additionally require orders.cod_remitted_to_us = true
-- ============================================================

CREATE OR REPLACE FUNCTION run_weekly_vendor_settlement(
  p_week_start date DEFAULT (CURRENT_DATE - 7),
  p_week_end date DEFAULT CURRENT_DATE
)
RETURNS TABLE (vendor_id uuid, settlement_id uuid, item_count integer, total_amount numeric, clawback_deducted numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_return_window_days integer;
  v_vendor record;
  v_gross numeric;
  v_item_count integer;
  v_clawback numeric;
  v_settlement_id uuid;
BEGIN
  SELECT coalesce((value->>'return_window_days')::integer, 7)
  INTO v_return_window_days
  FROM settings WHERE key = 'vendor_settlement_settings';
  v_return_window_days := coalesce(v_return_window_days, 7);

  FOR v_vendor IN
    SELECT DISTINCT oi.vendor_id AS id
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    WHERE oi.stage = 'delivered'
      AND oi.vendor_id IS NOT NULL
      AND oi.settlement_id IS NULL
      AND oi.delivered_at IS NOT NULL
      AND oi.delivered_at <= (now() - (v_return_window_days || ' days')::interval)
      AND (o.payment_method <> 'cod' OR o.cod_remitted_to_us = true)
  LOOP
    SELECT coalesce(sum(oi.vendor_payable_amount), 0), count(*)
    INTO v_gross, v_item_count
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    WHERE oi.vendor_id = v_vendor.id
      AND oi.stage = 'delivered'
      AND oi.settlement_id IS NULL
      AND oi.delivered_at IS NOT NULL
      AND oi.delivered_at <= (now() - (v_return_window_days || ' days')::interval)
      AND (o.payment_method <> 'cod' OR o.cod_remitted_to_us = true);

    IF v_item_count = 0 THEN
      CONTINUE;
    END IF;

    -- Pending clawbacks from a previously-PAID settlement, deducted now.
    SELECT coalesce(sum(amount), 0) INTO v_clawback
    FROM vendor_clawbacks
    WHERE vendor_id = v_vendor.id AND status = 'pending';

    INSERT INTO vendor_settlements (vendor_id, week_start, week_end, total_amount, clawback_deducted, status)
    VALUES (v_vendor.id, p_week_start, p_week_end, v_gross - v_clawback, v_clawback, 'pending')
    RETURNING id INTO v_settlement_id;

    UPDATE order_items oi
    SET settlement_id = v_settlement_id
    FROM orders o
    WHERE oi.order_id = o.id
      AND oi.vendor_id = v_vendor.id
      AND oi.stage = 'delivered'
      AND oi.settlement_id IS NULL
      AND oi.delivered_at IS NOT NULL
      AND oi.delivered_at <= (now() - (v_return_window_days || ' days')::interval)
      AND (o.payment_method <> 'cod' OR o.cod_remitted_to_us = true);

    UPDATE vendor_clawbacks
    SET status = 'applied', applied_settlement_id = v_settlement_id, applied_at = now()
    WHERE vendor_id = v_vendor.id AND status = 'pending';

    vendor_id := v_vendor.id;
    settlement_id := v_settlement_id;
    item_count := v_item_count;
    total_amount := v_gross - v_clawback;
    clawback_deducted := v_clawback;
    RETURN NEXT;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION run_weekly_vendor_settlement(date, date) TO service_role;

-- NOTE: this function bypasses order_items' guard trigger safely — it's
-- SECURITY DEFINER, and the UPDATE it issues runs as the function
-- owner (a superuser-created role at migration time), NOT as
-- 'service_role' by auth.role()'s reckoning. If your Supabase project
-- enforces auth.role() strictly even inside SECURITY DEFINER functions
-- and you see the guard trigger reject this UPDATE, the fix is to also
-- allow auth.role() = 'authenticator'/'postgres' in the guard, or
-- simpler: call this function through the cron route using the service
-- role client's RPC call (same as every other RPC in this schema —
-- restock_order_item, place_order_with_items) so the session itself is
-- already service_role before the function body runs. That's the path
-- app/api/cron/vendor-settlement/route.ts below actually takes.
