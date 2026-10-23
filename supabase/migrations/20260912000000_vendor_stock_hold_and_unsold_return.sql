-- ---------------------------------------------------------------------
-- Vendor Stock-Hold Timer + "unsold after return/RTO" auto-flag
--
-- Ye migration teen cheezein add karta hai (Vendor Ops screenshot me
-- jo tabs dikhte hain — Vendors / Stock Receiving / Vendor Settlements /
-- Vendor Ops / Vendor Reports — unke upar hi build karta hai, koi
-- naya top-level module nahi):
--
--   1. vendors.stock_hold_days — vendor khud set kar sakta hai ki agar
--      uska koi item return/RTO hoke warehouse me wapas aaya to kitne
--      din tak warehouse me hold rahega (min 15, max 30, default 15).
--      Sirf ek naya RPC (update_vendor_stock_hold_days) se badalta hai —
--      koi direct UPDATE policy nahi, same pattern jo is file me
--      request_vendor_bank_update() ke liye already use hua hai.
--
--   2. vendor_return_holds — jab bhi koi order_item return ya RTO hoke
--      warehouse pahunchta hai, ek row yahan ban jaati hai (status
--      'holding', deadline = returned_at + us waqt ka vendor ka
--      stock_hold_days). Agar deadline se pehle usi product ka koi
--      naya order aa jaaye (matlab dobara bikk gaya), row 'resold' ho
--      jaati hai. Agar deadline nikal jaaye aur koi naya order na aaye,
--      row 'flagged' ho jaati hai AUR return_to_vendor_queue me ek
--      naya row daal di jaati hai (reason 'unsold_after_return') taaki
--      admin ise wahi se resolve kar sake jaha 2x-return aur baaki
--      return-to-vendor cases already dikhte hain.
--
--   3. RTO ko bhi "same product 2 baar return" wale counter
--      (products.return_count / return_threshold, already
--      20260901000000_vendor_return_consent.sql me bana hai) me count
--      kiya jaata hai — pehle sirf customer ke `returns` table wale
--      return count hote the, RTO nahi. check_vendor_return_threshold()
--      ka core logic ek shared function me nikaal ke dono jagah
--      (returns table trigger + naya orders RTO trigger) se call kiya
--      gaya hai — behavior bilkul same, bas ab dusra trigger source bhi
--      isi function ko call karta hai.
-- ---------------------------------------------------------------------

-- ============================================================
-- 1. vendors.stock_hold_days
-- ============================================================

ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS stock_hold_days integer NOT NULL DEFAULT 15
    CHECK (stock_hold_days BETWEEN 15 AND 30);

COMMENT ON COLUMN vendors.stock_hold_days IS
  'Vendor-configurable: how many days a returned/RTO unit sits in the warehouse before it gets auto-flagged in Return to Vendor. Min 15 (default), max 30. Only changeable via update_vendor_stock_hold_days().';

CREATE OR REPLACE FUNCTION update_vendor_stock_hold_days(new_days integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
BEGIN
  SELECT status INTO v_status FROM vendors WHERE user_id = auth.uid();

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'No vendor profile found for this account';
  END IF;

  IF v_status <> 'approved' THEN
    RAISE EXCEPTION 'Only approved vendors can change this setting';
  END IF;

  IF new_days IS NULL OR new_days < 15 OR new_days > 30 THEN
    RAISE EXCEPTION 'Stock hold days must be between 15 and 30';
  END IF;

  UPDATE vendors
  SET stock_hold_days = new_days,
      updated_at = now()
  WHERE user_id = auth.uid();

  RETURN new_days;
END;
$$;

GRANT EXECUTE ON FUNCTION update_vendor_stock_hold_days(integer) TO authenticated;

-- ============================================================
-- 2. return_to_vendor_queue — new reason + hold_deadline (for the
--    green→red countdown badge in the admin panel).
-- ============================================================

ALTER TABLE return_to_vendor_queue DROP CONSTRAINT IF EXISTS return_to_vendor_queue_reason_check;
ALTER TABLE return_to_vendor_queue ADD CONSTRAINT return_to_vendor_queue_reason_check
  CHECK (reason IN (
    'never_sold_90d', 'cancelled_returned_60d', 'offboarding',
    'returned_2x_consent', 'unsold_after_return'
  ));

ALTER TABLE return_to_vendor_queue
  ADD COLUMN IF NOT EXISTS hold_deadline timestamptz;

COMMENT ON COLUMN return_to_vendor_queue.hold_deadline IS
  'Only set for reason=unsold_after_return — copied from vendor_return_holds.hold_deadline so the admin panel can show "X days overdue" without an extra join.';

-- ============================================================
-- 3. vendor_return_holds — one row per order_item that came back to
--    the warehouse via a return or an RTO.
-- ============================================================

CREATE TABLE IF NOT EXISTS vendor_return_holds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  order_item_id uuid NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,

  source text NOT NULL CHECK (source IN ('return', 'rto')),
  returned_at timestamptz NOT NULL DEFAULT now(),
  hold_days integer NOT NULL,             -- snapshot of vendor.stock_hold_days at the time
  hold_deadline timestamptz NOT NULL,

  status text NOT NULL DEFAULT 'holding' CHECK (status IN ('holding', 'resold', 'flagged', 'returned')),
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vendor_return_holds_vendor_id ON vendor_return_holds(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_return_holds_status ON vendor_return_holds(status);
CREATE INDEX IF NOT EXISTS idx_vendor_return_holds_product_id ON vendor_return_holds(product_id);

-- One hold per order_item, ever.
CREATE UNIQUE INDEX IF NOT EXISTS idx_vendor_return_holds_unique_order_item
  ON vendor_return_holds(order_item_id);

ALTER TABLE vendor_return_holds ENABLE ROW LEVEL SECURITY;
-- Admin panel reads everything via service role. Vendor reads only
-- their own rows (their dashboard's "Stock Hold Timers" widget).
DROP POLICY IF EXISTS "own_select_vendor_return_holds" ON vendor_return_holds;
CREATE POLICY "own_select_vendor_return_holds" ON vendor_return_holds FOR SELECT
  TO authenticated USING (
    vendor_id IN (SELECT id FROM vendors WHERE user_id = auth.uid())
  );

-- ============================================================
-- 4. run_vendor_return_hold_scan() — daily cron job:
--    a) open a hold for any newly-returned/RTO order_item that doesn't
--       have one yet
--    b) resolve holds where a fresh order for the same product+vendor
--       has come in since (resold — no need to send it back)
--    c) flag holds whose deadline has passed with nothing resold —
--       pushes into return_to_vendor_queue (reason 'unsold_after_return')
-- ============================================================

CREATE OR REPLACE FUNCTION run_vendor_return_hold_scan()
RETURNS TABLE (holds_opened integer, holds_resolved_resold integer, holds_flagged integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_opened integer := 0;
  v_resolved integer := 0;
  v_flagged integer := 0;
BEGIN
  -- (a) Open a hold for every order_item that has come back to the
  -- warehouse (customer return OR RTO) and doesn't have one yet.
  INSERT INTO vendor_return_holds (vendor_id, product_id, order_item_id, source, returned_at, hold_days, hold_deadline)
  SELECT
    oi.vendor_id,
    oi.product_id,
    oi.id,
    CASE WHEN oi.stage = 'returned' THEN 'return' ELSE 'rto' END,
    coalesce(
      CASE WHEN oi.stage = 'returned' THEN oi.stage_updated_at END,
      o.delivery_status_updated_at,
      now()
    ),
    v.stock_hold_days,
    coalesce(
      CASE WHEN oi.stage = 'returned' THEN oi.stage_updated_at END,
      o.delivery_status_updated_at,
      now()
    ) + (v.stock_hold_days || ' days')::interval
  FROM order_items oi
  JOIN orders o ON o.id = oi.order_id
  JOIN vendors v ON v.id = oi.vendor_id
  WHERE oi.vendor_id IS NOT NULL
    AND (oi.stage = 'returned' OR o.delivery_status = 'rto_delivered')
    AND NOT EXISTS (SELECT 1 FROM vendor_return_holds h WHERE h.order_item_id = oi.id)
  ON CONFLICT (order_item_id) DO NOTHING;
  GET DIAGNOSTICS v_opened = ROW_COUNT;

  -- (b) Resold — a fresh order for the same product from the same
  -- vendor has landed after this unit came back, before the deadline.
  -- Repeat demand exists, so no need to send the returned unit back.
  UPDATE vendor_return_holds h
  SET status = 'resold', resolved_at = now()
  WHERE h.status = 'holding'
    AND h.product_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM order_items oi2
      WHERE oi2.product_id = h.product_id
        AND oi2.vendor_id = h.vendor_id
        AND oi2.id <> h.order_item_id
        AND oi2.created_at > h.returned_at
        AND oi2.stage NOT IN ('cancelled')
    );
  GET DIAGNOSTICS v_resolved = ROW_COUNT;

  -- (c) Deadline passed, still sitting unsold — flag it.
  WITH to_flag AS (
    UPDATE vendor_return_holds h
    SET status = 'flagged', resolved_at = now()
    WHERE h.status = 'holding'
      AND h.hold_deadline <= now()
    RETURNING h.id, h.vendor_id, h.product_id, h.order_item_id, h.hold_days, h.hold_deadline
  )
  INSERT INTO return_to_vendor_queue (vendor_id, product_id, order_item_id, reason, note, hold_deadline)
  SELECT
    vendor_id, product_id, order_item_id, 'unsold_after_return',
    'No repeat order for this product in the vendor''s configured ' || hold_days || '-day hold window since it came back to the warehouse.',
    hold_deadline
  FROM to_flag
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_flagged = ROW_COUNT;

  holds_opened := v_opened;
  holds_resolved_resold := v_resolved;
  holds_flagged := v_flagged;
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION run_vendor_return_hold_scan() TO service_role;

-- Mirror the resolve behavior on the existing PATCH /api/admin/vendor-ops
-- endpoint: when an 'unsold_after_return' queue row is marked returned,
-- also close out its matching hold row so it drops off the vendor's
-- and admin's active-timer list.
CREATE OR REPLACE FUNCTION sync_vendor_return_hold_on_queue_resolve()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'returned' AND OLD.status <> 'returned'
     AND NEW.reason = 'unsold_after_return' AND NEW.order_item_id IS NOT NULL THEN
    UPDATE vendor_return_holds
    SET status = 'returned', resolved_at = now()
    WHERE order_item_id = NEW.order_item_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_vendor_return_hold_on_queue_resolve ON return_to_vendor_queue;
CREATE TRIGGER trg_sync_vendor_return_hold_on_queue_resolve
  AFTER UPDATE ON return_to_vendor_queue
  FOR EACH ROW EXECUTE FUNCTION sync_vendor_return_hold_on_queue_resolve();

-- ============================================================
-- 5. RTO now also counts toward the "same product returned 2x ->
--    send back to vendor + clawback" threshold (previously only
--    customer returns via the `returns` table counted).
--
--    check_vendor_return_threshold()'s body is lifted as-is into a
--    shared function that takes an order_item_id directly — behavior
--    for the existing returns-table trigger does not change at all.
-- ============================================================

CREATE OR REPLACE FUNCTION bump_product_return_threshold(p_order_item_id uuid, p_return_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item record;
  v_product record;
  v_new_count integer;
  v_clawback_amount numeric;
BEGIN
  IF p_order_item_id IS NULL THEN
    RETURN;
  END IF;

  SELECT id, vendor_id, product_id, vendor_payable_amount
  INTO v_item
  FROM order_items
  WHERE id = p_order_item_id;

  IF v_item.vendor_id IS NULL OR v_item.product_id IS NULL THEN
    RETURN; -- not a vendor-sourced item
  END IF;

  SELECT id, return_count, return_threshold, vendor_expected_price, vendor_return_consent
  INTO v_product
  FROM products
  WHERE id = v_item.product_id
  FOR UPDATE;

  IF v_product.id IS NULL THEN
    RETURN;
  END IF;

  v_new_count := coalesce(v_product.return_count, 0) + 1;

  IF v_new_count < coalesce(v_product.return_threshold, 2) THEN
    UPDATE products SET return_count = v_new_count WHERE id = v_product.id;
    RETURN;
  END IF;

  INSERT INTO return_to_vendor_queue (vendor_id, product_id, order_item_id, reason, note)
  VALUES (
    v_item.vendor_id,
    v_item.product_id,
    v_item.id,
    'returned_2x_consent',
    'Hit its ' || coalesce(v_product.return_threshold, 2) || '-return/RTO threshold — per the vendor''s Add Product consent, send back to vendor.'
  )
  ON CONFLICT DO NOTHING;

  v_clawback_amount := coalesce(v_item.vendor_payable_amount, v_product.vendor_expected_price, 0);

  IF v_clawback_amount > 0 THEN
    INSERT INTO vendor_clawbacks (vendor_id, order_item_id, return_id, amount, status)
    VALUES (v_item.vendor_id, v_item.id, p_return_id, v_clawback_amount, 'pending');
  END IF;

  UPDATE products SET return_count = 0 WHERE id = v_product.id;
END;
$$;

-- Existing trigger function now just delegates to the shared one —
-- identical behavior for customer returns, no change in trigger wiring.
CREATE OR REPLACE FUNCTION check_vendor_return_threshold()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status NOT IN ('refunded', 'completed') THEN
    RETURN NEW;
  END IF;
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  PERFORM bump_product_return_threshold(NEW.order_item_id, NEW.id);

  RETURN NEW;
END;
$$;

-- New: RTO also counts. Fires only on the transition INTO
-- 'rto_delivered' (item is physically back at the warehouse), and
-- walks every order_item on that order.
CREATE OR REPLACE FUNCTION check_vendor_return_threshold_on_rto()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item_id uuid;
BEGIN
  IF NEW.delivery_status IS DISTINCT FROM 'rto_delivered' THEN
    RETURN NEW;
  END IF;
  IF OLD.delivery_status = NEW.delivery_status THEN
    RETURN NEW;
  END IF;

  FOR v_item_id IN SELECT id FROM order_items WHERE order_id = NEW.id LOOP
    PERFORM bump_product_return_threshold(v_item_id, NULL);
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_check_rto_return_threshold ON orders;
CREATE TRIGGER trg_orders_check_rto_return_threshold
  AFTER UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION check_vendor_return_threshold_on_rto();

-- Note: vendor_clawbacks.return_id is already nullable in its original
-- definition, so RTO-sourced clawbacks (no matching row in `returns`)
-- insert cleanly with return_id = NULL.
