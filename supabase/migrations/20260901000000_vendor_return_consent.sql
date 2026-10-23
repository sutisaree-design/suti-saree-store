-- ---------------------------------------------------------------------
-- Vendor Return Consent — captured once at product-add time:
--   "Agar ye product 2 baar return hota hai, wapas vendor ko bhej diya
--    jaayega aur uski cost vendor ke agle settlement se kaat li jaayegi."
--
-- Builds on what already exists in this schema instead of reinventing it:
--   - `return_to_vendor_queue` (Phase 4C, 20260809000000) already has the
--     exact "flag a product/order_item to physically go back to the
--     vendor" mechanism (reason + status pending/returned). We just add
--     a new `reason` value for this case.
--   - `vendor_clawbacks` (Phase 4A, 20260808000000) already has the
--     exact "deduct an amount from the vendor's NEXT settlement"
--     mechanism — run_weekly_vendor_settlement() (Phase 4A) already
--     sums every status='pending' clawback for a vendor and subtracts
--     it from that week's total_amount. We just insert a row here
--     instead of only doing it from the "already-paid settlement"
--     trigger that existed before.
--
-- Nothing here touches those two mechanisms' existing behavior — this
-- migration only adds a NEW way rows get created in them.
-- ---------------------------------------------------------------------

-- ============================================================
-- 1. products — consent capture + per-listing return counter
-- ============================================================

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS vendor_return_consent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS vendor_return_consent_at timestamptz,
  ADD COLUMN IF NOT EXISTS return_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS return_threshold integer NOT NULL DEFAULT 2 CHECK (return_threshold > 0);

COMMENT ON COLUMN products.vendor_return_consent IS
  'Vendor ticked the "2x return -> sent back to me, cost deducted from my next settlement" agreement at Add Product time. Enforced server-side in POST /api/vendor/products — the API rejects the listing if this is not true, so it should never be false for a real vendor product.';
COMMENT ON COLUMN products.return_count IS
  'How many completed returns this exact listing has had SINCE the counter was last reset. Incremented by trg_returns_check_vendor_threshold below; reset to 0 once it hits return_threshold (see that function) so the cycle can start over if the vendor restocks the same listing.';
COMMENT ON COLUMN products.return_threshold IS
  'Number of returns that triggers "send back to vendor + clawback". Defaults to 2 (per your consent copy) — kept as a column, not hardcoded, in case a specific vendor/category ever needs a different number later.';

-- ============================================================
-- 2. return_to_vendor_queue — allow the new reason value
-- ============================================================

ALTER TABLE return_to_vendor_queue DROP CONSTRAINT IF EXISTS return_to_vendor_queue_reason_check;
ALTER TABLE return_to_vendor_queue ADD CONSTRAINT return_to_vendor_queue_reason_check
  CHECK (reason IN (
    'never_sold_90d', 'cancelled_returned_60d', 'offboarding', 'returned_2x_consent'
  ));

-- One pending "hit the return threshold" flag per order item — same
-- re-run-safe pattern as the other two unique partial indexes on this
-- table (Phase 4C).
CREATE UNIQUE INDEX IF NOT EXISTS idx_rtv_queue_unique_returned_2x
  ON return_to_vendor_queue(order_item_id)
  WHERE reason = 'returned_2x_consent' AND status = 'pending';

-- ============================================================
-- 3. Trigger — fires the moment a return's status becomes
--    'refunded'/'completed' (same transition create_vendor_clawback_if_paid
--    already listens for on this same table), checks the PRODUCT's
--    running return_count against its return_threshold, and if it's
--    been hit:
--      a) queues the physical item to go back to the vendor
--      b) claws back this order item's payable amount from the
--         vendor's NEXT settlement (regardless of whether an earlier
--         settlement for it was ever paid — unlike the existing
--         create_vendor_clawback_if_paid, which only fires post-payment)
--      c) resets the counter to 0 so a restocked replacement unit of
--         the same listing starts a fresh 2-strike count
-- ============================================================

CREATE OR REPLACE FUNCTION check_vendor_return_threshold()
RETURNS trigger
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
  -- Same guard as create_vendor_clawback_if_paid: only act on the
  -- transition INTO a completed return, not every update to the row.
  IF NEW.status NOT IN ('refunded', 'completed') THEN
    RETURN NEW;
  END IF;
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;
  IF NEW.order_item_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT id, vendor_id, product_id, vendor_payable_amount
  INTO v_item
  FROM order_items
  WHERE id = NEW.order_item_id;

  IF v_item.vendor_id IS NULL OR v_item.product_id IS NULL THEN
    RETURN NEW; -- not a vendor-sourced item — nothing to do
  END IF;

  SELECT id, return_count, return_threshold, vendor_expected_price, vendor_return_consent
  INTO v_product
  FROM products
  WHERE id = v_item.product_id
  FOR UPDATE; -- serialize concurrent returns against the same listing

  IF v_product.id IS NULL THEN
    RETURN NEW;
  END IF;

  v_new_count := coalesce(v_product.return_count, 0) + 1;

  IF v_new_count < coalesce(v_product.return_threshold, 2) THEN
    UPDATE products SET return_count = v_new_count WHERE id = v_product.id;
    RETURN NEW;
  END IF;

  -- Threshold hit — queue it to physically go back to the vendor.
  INSERT INTO return_to_vendor_queue (vendor_id, product_id, order_item_id, reason, note)
  VALUES (
    v_item.vendor_id,
    v_item.product_id,
    v_item.id,
    'returned_2x_consent',
    'Hit its ' || coalesce(v_product.return_threshold, 2) || '-return threshold — per the vendor''s Add Product consent, send back to vendor.'
  )
  ON CONFLICT DO NOTHING;

  -- Clawback amount: what this specific unit would have paid the
  -- vendor (vendor_payable_amount, set once delivered — see Phase 4A),
  -- falling back to their own quoted cost price if the item never got
  -- that far (e.g. returned before delivery-settlement even ran).
  v_clawback_amount := coalesce(v_item.vendor_payable_amount, v_product.vendor_expected_price, 0);

  IF v_clawback_amount > 0 THEN
    INSERT INTO vendor_clawbacks (vendor_id, order_item_id, return_id, amount, status)
    VALUES (v_item.vendor_id, v_item.id, NEW.id, v_clawback_amount, 'pending');
  END IF;

  -- Reset so a fresh restocked unit of the same listing gets its own
  -- 2-strike count instead of instantly re-triggering.
  UPDATE products SET return_count = 0 WHERE id = v_product.id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_returns_check_vendor_threshold ON returns;
CREATE TRIGGER trg_returns_check_vendor_threshold
  AFTER UPDATE ON returns
  FOR EACH ROW EXECUTE FUNCTION check_vendor_return_threshold();
