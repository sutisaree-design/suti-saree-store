-- ---------------------------------------------------------------------
-- Phase 4C — Return Timers, Restock Alerts, Vendor Performance,
-- Stale Inventory, Off-boarding.
-- Builds on Phase 1, 2A-2E, 3A-3C, 4A-4B.
--
-- Design choice, so the reasoning is on record: only the two RETURN
-- TIMERS (90-day never-sold, 60-day cancelled/returned) need their own
-- table — they must fire ONCE per item and stay flagged until an admin
-- resolves them, and off-boarding (point 5) must be able to add rows to
-- that exact same list immediately. Restock Suggested, Vendor
-- Performance and Stale Inventory (points 2, 3, 4) are plain "what does
-- the data look like right now" queries with no fire-once state to
-- track, so those are read-only SQL functions computed live on every
-- admin panel load, same spirit as run_weekly_vendor_settlement() being
-- callable standalone from the SQL editor for testing.
-- ---------------------------------------------------------------------

-- ============================================================
-- 1. Config — same key/value `settings` table pattern as
--    vendor_order_settings (3A) / vendor_settlement_settings (4A).
-- ============================================================

INSERT INTO settings (key, value)
VALUES (
  'vendor_lifecycle_settings',
  jsonb_build_object(
    'never_sold_days', 90,
    'cancelled_returned_days', 60,
    'restock_lookback_days', 30,
    'restock_sold_threshold_percent', 70,
    'stale_inventory_days', 14
  )
)
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- 2. products.approval_status_changed_at — needed for the 90-day
--    "never sold" timer. `updated_at` touches on ANY change (not just
--    approval_status), so it can't be used for this. Same
--    touch-a-dedicated-timestamp pattern as quantity_last_updated_at
--    (Phase 2A) / stage_updated_at (Phase 3A).
-- ============================================================

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS approval_status_changed_at timestamptz NOT NULL DEFAULT now();

-- Backfill: best guess for existing rows is "whenever this row was last
-- touched", since we have no earlier record of the actual transition.
UPDATE products SET approval_status_changed_at = updated_at
WHERE approval_status_changed_at IS NULL OR approval_status_changed_at = now();

CREATE OR REPLACE FUNCTION touch_approval_status_timestamp()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.approval_status IS DISTINCT FROM OLD.approval_status THEN
    NEW.approval_status_changed_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_products_touch_approval_status ON products;
CREATE TRIGGER trg_products_touch_approval_status
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION touch_approval_status_timestamp();

CREATE INDEX IF NOT EXISTS idx_products_approval_status_changed_at
  ON products(approval_status_changed_at)
  WHERE vendor_id IS NOT NULL AND approval_status IN ('awaiting_stock', 'live');

-- ============================================================
-- 3. return_to_vendor_queue — the one stateful list. Fed by three
--    sources: the 90-day scan, the 60-day scan (both via
--    run_return_to_vendor_scan() below, called by the daily cron), and
--    close_vendor_account() (point 5, fires immediately, no wait).
-- ============================================================

CREATE TABLE IF NOT EXISTS return_to_vendor_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  order_item_id uuid REFERENCES order_items(id) ON DELETE SET NULL,

  reason text NOT NULL CHECK (reason IN (
    'never_sold_90d', 'cancelled_returned_60d', 'offboarding'
  )),
  note text,

  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'returned')),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_rtv_queue_vendor_id ON return_to_vendor_queue(vendor_id);
CREATE INDEX IF NOT EXISTS idx_rtv_queue_status_reason ON return_to_vendor_queue(status, reason);

-- One pending "never sold" flag per product, one pending "cancelled/
-- returned" flag per order item — the scan is safe to re-run daily
-- without ever double-inserting.
CREATE UNIQUE INDEX IF NOT EXISTS idx_rtv_queue_unique_never_sold
  ON return_to_vendor_queue(product_id)
  WHERE reason = 'never_sold_90d' AND status = 'pending';
CREATE UNIQUE INDEX IF NOT EXISTS idx_rtv_queue_unique_cancelled_returned
  ON return_to_vendor_queue(order_item_id)
  WHERE reason = 'cancelled_returned_60d' AND status = 'pending';

ALTER TABLE return_to_vendor_queue ENABLE ROW LEVEL SECURITY;
-- No policies for `authenticated`/`anon` on purpose — admin panel only,
-- via the service role, same as vendor_barcode_counters (Phase 2A).

-- ============================================================
-- 4. run_return_to_vendor_scan() — the daily cron's whole job in one
--    function, callable manually from the SQL editor too.
--    a) Never-sold 90-day timer: vendor product still awaiting_stock/
--       live for >= never_sold_days, with zero order_items ever placed
--       against it (any stage — "not a single unit sold" is read here
--       as "never even ordered", which is the strictest/safest reading;
--       an order that was itself cancelled doesn't count as a sale).
--    b) Cancelled/returned 60-day timer: order_items sitting in stage
--       'cancelled' or 'returned' for >= cancelled_returned_days.
-- ============================================================

CREATE OR REPLACE FUNCTION run_return_to_vendor_scan()
RETURNS TABLE (never_sold_flagged integer, cancelled_returned_flagged integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_never_sold_days integer;
  v_cancelled_returned_days integer;
  v_never_sold_count integer := 0;
  v_cancelled_returned_count integer := 0;
BEGIN
  SELECT
    coalesce((value->>'never_sold_days')::integer, 90),
    coalesce((value->>'cancelled_returned_days')::integer, 60)
  INTO v_never_sold_days, v_cancelled_returned_days
  FROM settings WHERE key = 'vendor_lifecycle_settings';
  v_never_sold_days := coalesce(v_never_sold_days, 90);
  v_cancelled_returned_days := coalesce(v_cancelled_returned_days, 60);

  -- (a) Never sold — 90 din
  INSERT INTO return_to_vendor_queue (vendor_id, product_id, reason, note)
  SELECT p.vendor_id, p.id, 'never_sold_90d',
         'Awaiting-stock/live for ' || v_never_sold_days || '+ days with zero units sold'
  FROM products p
  WHERE p.vendor_id IS NOT NULL
    AND p.approval_status IN ('awaiting_stock', 'live')
    AND p.approval_status_changed_at <= now() - (v_never_sold_days || ' days')::interval
    AND NOT EXISTS (SELECT 1 FROM order_items oi WHERE oi.product_id = p.id)
    AND NOT EXISTS (
      SELECT 1 FROM return_to_vendor_queue q
      WHERE q.product_id = p.id AND q.reason = 'never_sold_90d' AND q.status = 'pending'
    )
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_never_sold_count = ROW_COUNT;

  -- (b) Cancelled/returned — 60 din, still sitting in the warehouse
  INSERT INTO return_to_vendor_queue (vendor_id, order_item_id, product_id, reason, note)
  SELECT oi.vendor_id, oi.id, oi.product_id, 'cancelled_returned_60d',
         'Order item has been ' || oi.stage || ' for ' || v_cancelled_returned_days || '+ days'
  FROM order_items oi
  WHERE oi.vendor_id IS NOT NULL
    AND oi.stage IN ('cancelled', 'returned')
    AND oi.stage_updated_at <= now() - (v_cancelled_returned_days || ' days')::interval
    AND NOT EXISTS (
      SELECT 1 FROM return_to_vendor_queue q
      WHERE q.order_item_id = oi.id AND q.reason = 'cancelled_returned_60d' AND q.status = 'pending'
    )
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_cancelled_returned_count = ROW_COUNT;

  never_sold_flagged := v_never_sold_count;
  cancelled_returned_flagged := v_cancelled_returned_count;
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION run_return_to_vendor_scan() TO service_role;

-- ============================================================
-- 5. Restock Suggested — live query, no state to persist.
--    "last 30 din me kitni units bikin vs available_quantity" — read
--    as sold / (sold + still-available) > threshold%, i.e. how much of
--    the recent sellable stock has already moved.
-- ============================================================

CREATE OR REPLACE FUNCTION get_restock_suggestions()
RETURNS TABLE (
  product_id uuid,
  product_name text,
  vendor_id uuid,
  business_name text,
  available_quantity integer,
  sold_last_30d bigint,
  sell_through_percent numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lookback_days integer;
  v_threshold_percent numeric;
BEGIN
  SELECT
    coalesce((value->>'restock_lookback_days')::integer, 30),
    coalesce((value->>'restock_sold_threshold_percent')::numeric, 70)
  INTO v_lookback_days, v_threshold_percent
  FROM settings WHERE key = 'vendor_lifecycle_settings';
  v_lookback_days := coalesce(v_lookback_days, 30);
  v_threshold_percent := coalesce(v_threshold_percent, 70);

  RETURN QUERY
  SELECT
    p.id,
    p.name,
    p.vendor_id,
    v.business_name,
    p.available_quantity,
    coalesce(sold.qty, 0) AS sold_last_30d,
    round(
      (coalesce(sold.qty, 0)::numeric /
        NULLIF(coalesce(sold.qty, 0) + p.available_quantity, 0)) * 100,
      1
    ) AS sell_through_percent
  FROM products p
  JOIN vendors v ON v.id = p.vendor_id
  LEFT JOIN (
    SELECT oi.product_id, sum(oi.quantity) AS qty
    FROM order_items oi
    WHERE oi.created_at >= now() - (v_lookback_days || ' days')::interval
      AND oi.stage NOT IN ('cancelled')
    GROUP BY oi.product_id
  ) sold ON sold.product_id = p.id
  WHERE p.vendor_id IS NOT NULL
    AND p.approval_status IN ('awaiting_stock', 'live')
    AND coalesce(sold.qty, 0) > 0
    AND (coalesce(sold.qty, 0)::numeric / NULLIF(coalesce(sold.qty, 0) + p.available_quantity, 0)) * 100
        >= v_threshold_percent
  ORDER BY sell_through_percent DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION get_restock_suggestions() TO service_role;

-- ============================================================
-- 6. Vendor Performance — live per-vendor rollup.
-- ============================================================

CREATE OR REPLACE FUNCTION get_vendor_performance()
RETURNS TABLE (
  vendor_id uuid,
  business_name text,
  total_items bigint,
  delivered_count bigint,
  cancelled_count bigint,
  returned_count bigint,
  sell_through_rate numeric,
  cancellation_rate numeric,
  return_rate numeric,
  avg_accept_time_minutes numeric,
  received_count bigint,
  quality_hold_count bigint,
  quality_check_fail_rate numeric,
  missed_order_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    v.id,
    v.business_name,
    count(oi.id) AS total_items,
    count(oi.id) FILTER (WHERE oi.stage = 'delivered') AS delivered_count,
    count(oi.id) FILTER (WHERE oi.stage = 'cancelled') AS cancelled_count,
    count(oi.id) FILTER (WHERE oi.stage = 'returned') AS returned_count,
    round(
      (count(oi.id) FILTER (WHERE oi.stage = 'delivered')::numeric
        / NULLIF(count(oi.id), 0)) * 100, 1
    ) AS sell_through_rate,
    round(
      (count(oi.id) FILTER (WHERE oi.stage = 'cancelled')::numeric
        / NULLIF(count(oi.id), 0)) * 100, 1
    ) AS cancellation_rate,
    round(
      (count(oi.id) FILTER (WHERE oi.stage = 'returned')::numeric
        / NULLIF(count(oi.id), 0)) * 100, 1
    ) AS return_rate,
    round(
      (extract(epoch FROM avg(oi.vendor_accepted_at - oi.created_at)
        FILTER (WHERE oi.vendor_accepted_at IS NOT NULL)) / 60)::numeric, 1
    ) AS avg_accept_time_minutes,
    count(oi.id) FILTER (WHERE oi.received_at IS NOT NULL) AS received_count,
    count(oi.id) FILTER (
      WHERE oi.received_at IS NOT NULL
        AND (oi.stage = 'quality_hold' OR oi.qc_defect_found = true)
    ) AS quality_hold_count,
    round(
      (count(oi.id) FILTER (
        WHERE oi.received_at IS NOT NULL
          AND (oi.stage = 'quality_hold' OR oi.qc_defect_found = true)
      )::numeric / NULLIF(count(oi.id) FILTER (WHERE oi.received_at IS NOT NULL), 0)) * 100, 1
    ) AS quality_check_fail_rate,
    v.missed_order_count
  FROM vendors v
  LEFT JOIN order_items oi ON oi.vendor_id = v.id
  WHERE v.status IN ('approved', 'suspended')
  GROUP BY v.id, v.business_name, v.missed_order_count
  ORDER BY v.business_name;
END;
$$;

GRANT EXECUTE ON FUNCTION get_vendor_performance() TO service_role;

-- ============================================================
-- 7. Stale Inventory — live query (14+ din se quantity untouched).
-- ============================================================

CREATE OR REPLACE FUNCTION get_stale_inventory()
RETURNS TABLE (
  product_id uuid,
  product_name text,
  vendor_id uuid,
  business_name text,
  available_quantity integer,
  quantity_last_updated_at timestamptz,
  days_stale integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stale_days integer;
BEGIN
  SELECT coalesce((value->>'stale_inventory_days')::integer, 14)
  INTO v_stale_days
  FROM settings WHERE key = 'vendor_lifecycle_settings';
  v_stale_days := coalesce(v_stale_days, 14);

  RETURN QUERY
  SELECT
    p.id,
    p.name,
    p.vendor_id,
    v.business_name,
    p.available_quantity,
    p.quantity_last_updated_at,
    extract(day FROM now() - p.quantity_last_updated_at)::integer AS days_stale
  FROM products p
  JOIN vendors v ON v.id = p.vendor_id
  WHERE p.vendor_id IS NOT NULL
    AND p.approval_status IN ('awaiting_stock', 'live')
    AND p.quantity_last_updated_at <= now() - (v_stale_days || ' days')::interval
  ORDER BY p.quantity_last_updated_at ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION get_stale_inventory() TO service_role;

-- ============================================================
-- 8. Vendor off-boarding — "Close Vendor Account".
--    vendor_settlements gets an `is_final` flag so the admin UI can
--    label an off-boarding settlement distinctly from a normal weekly
--    one (point 5b: "Final Settlement" flag).
-- ============================================================

ALTER TABLE vendor_settlements
  ADD COLUMN IF NOT EXISTS is_final boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION close_vendor_account(p_vendor_id uuid)
RETURNS TABLE (
  products_flagged integer,
  final_settlement_id uuid,
  final_settlement_amount numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_products_flagged integer := 0;
  v_gross numeric := 0;
  v_item_count integer := 0;
  v_clawback numeric := 0;
  v_settlement_id uuid;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'close_vendor_account can only be called by the admin backend';
  END IF;

  -- (a) Every awaiting_stock/live product goes straight into the
  -- Return to Vendor queue — no waiting for the 90/60-day timers.
  -- available_quantity is also zeroed so nothing more can be sold
  -- against stock that's about to physically leave the warehouse.
  INSERT INTO return_to_vendor_queue (vendor_id, product_id, reason, note)
  SELECT p.vendor_id, p.id, 'offboarding', 'Vendor account closed — return immediately'
  FROM products p
  WHERE p.vendor_id = p_vendor_id
    AND p.approval_status IN ('awaiting_stock', 'live')
    AND NOT EXISTS (
      SELECT 1 FROM return_to_vendor_queue q
      WHERE q.product_id = p.id AND q.status = 'pending'
    );
  GET DIAGNOSTICS v_products_flagged = ROW_COUNT;

  UPDATE products
  SET available_quantity = 0
  WHERE vendor_id = p_vendor_id AND approval_status IN ('awaiting_stock', 'live');

  -- (b) Finalize any pending settlement immediately — every delivered,
  -- vendor-sourced, not-yet-settled item for this vendor, regardless of
  -- return window or COD-remittance state (unlike the weekly cron —
  -- off-boarding intentionally skips those waits, per your instruction
  -- "turant finalize karo").
  SELECT coalesce(sum(oi.vendor_payable_amount), 0), count(*)
  INTO v_gross, v_item_count
  FROM order_items oi
  WHERE oi.vendor_id = p_vendor_id
    AND oi.stage = 'delivered'
    AND oi.settlement_id IS NULL;

  IF v_item_count > 0 THEN
    SELECT coalesce(sum(amount), 0) INTO v_clawback
    FROM vendor_clawbacks
    WHERE vendor_id = p_vendor_id AND status = 'pending';

    INSERT INTO vendor_settlements (
      vendor_id, week_start, week_end, total_amount, clawback_deducted, status, is_final
    ) VALUES (
      p_vendor_id, CURRENT_DATE, CURRENT_DATE, v_gross - v_clawback, v_clawback, 'pending', true
    )
    RETURNING id INTO v_settlement_id;

    UPDATE order_items
    SET settlement_id = v_settlement_id
    WHERE vendor_id = p_vendor_id AND stage = 'delivered' AND settlement_id IS NULL;

    UPDATE vendor_clawbacks
    SET status = 'applied', applied_settlement_id = v_settlement_id, applied_at = now()
    WHERE vendor_id = p_vendor_id AND status = 'pending';
  END IF;

  -- (c) Suspend — dashboard access removal is enforced in the app layer
  -- (vendor GET routes below now check status = 'approved').
  UPDATE vendors
  SET status = 'suspended',
      admin_note = coalesce(admin_note || ' | ', '') || 'Account closed (off-boarded) on ' || CURRENT_DATE,
      updated_at = now()
  WHERE id = p_vendor_id;

  products_flagged := v_products_flagged;
  final_settlement_id := v_settlement_id;
  final_settlement_amount := CASE WHEN v_settlement_id IS NULL THEN NULL ELSE v_gross - v_clawback END;
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION close_vendor_account(uuid) TO service_role;

-- NOTE (dashboard-access gap, point 5c): app/api/vendor/orders,
-- app/api/vendor/earnings and app/api/vendor/products (GET) did not
-- previously check vendor.status at all, so a suspended vendor could
-- still read their own data via those routes even after this function
-- runs. This migration's job is schema/data; the accompanying code
-- change (same PR) adds `if (vendor.status !== 'approved') return 403`
-- to those three GET handlers so suspension actually takes effect.
