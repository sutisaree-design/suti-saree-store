-- ---------------------------------------------------------------------
-- Phase 3A — Order-Placement Backend Safety (schema only, no UI)
--
-- IMPORTANT CONTEXT (read before touching anything here):
-- This codebase does NOT currently write real rows into `order_items`.
-- app/checkout/page.tsx inserts one `orders` row with the whole cart as
-- a JSONB `items` array, then calls decrementStockForOrder() (lib/
-- stock-api.ts) AFTER the order is already created — a non-atomic
-- read-then-write against the *pre-existing*, non-vendor stock columns
-- (products.stock_quantity / product_variant_sizes.stock_quantity),
-- fired-and-forgotten (`.catch(() => {})`), so a failure there doesn't
-- even block the order. `order_items` itself has existed since the
-- original schema but has always been empty in practice.
--
-- This migration gives `order_items` real purpose and closes the two
-- specific race/trust gaps the vendor flow introduces:
--   1. Vendor stock (products.available_quantity /
--      product_variant_units.available_quantity, both from Phase 2A)
--      must be checked+decremented atomically, not read-then-write.
--   2. vendor_id / barcode / variant_unit_id on an order item must be
--      looked up SERVER-SIDE from the product row at order time, never
--      trusted from client input (this DB runs with the anon key
--      doing direct table writes — same trust model as the rest of
--      this schema).
--
-- The `place_order_with_items()` RPC below is the mechanism for both.
-- Wiring app/checkout/page.tsx to actually CALL it instead of its
-- current raw `.from('orders').insert(...)` + decrementStockForOrder()
-- is explicitly Phase 3B/3C territory per your own sequencing (you
-- asked for "koi vendor/admin UI abhi nahi" — this is the checkout
-- order-placement code path, not a new page, but it's still live
-- customer-facing behavior, so I've left it untouched here and just
-- built the safe primitive it should call). The existing non-vendor
-- decrementStockForOrder() path is completely unaffected by this
-- migration — nothing here changes behavior for products that aren't
-- vendor-sourced.
-- ---------------------------------------------------------------------

-- ============================================================
-- 1. vendors — missed-order counter (Phase 4C performance view reads this)
-- ============================================================

ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS missed_order_count integer NOT NULL DEFAULT 0;

-- ============================================================
-- 2. order_items — vendor/barcode/variant copy + fulfillment stage
-- ============================================================

ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS vendor_id uuid REFERENCES vendors(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS variant_unit_id uuid REFERENCES product_variant_units(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS barcode text,
  ADD COLUMN IF NOT EXISTS stage text NOT NULL DEFAULT 'placed',
  ADD COLUMN IF NOT EXISTS stage_updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS vendor_accept_deadline timestamptz,
  ADD COLUMN IF NOT EXISTS vendor_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS liability text;

ALTER TABLE order_items DROP CONSTRAINT IF EXISTS order_items_stage_check;
ALTER TABLE order_items ADD CONSTRAINT order_items_stage_check
  CHECK (stage IN (
    'placed', 'vendor_accepted', 'picked_from_vendor', 'received_at_warehouse',
    'packed', 'shipped_to_customer', 'delivered', 'cancelled', 'returned',
    'quality_hold'
  ));

ALTER TABLE order_items DROP CONSTRAINT IF EXISTS order_items_liability_check;
ALTER TABLE order_items ADD CONSTRAINT order_items_liability_check
  CHECK (liability IS NULL OR liability IN ('vendor', 'own'));
-- Actual liability logic (set on pickup-leg damage vs post-warehouse
-- damage) is Phase 3C — this migration only adds the column, as asked.

CREATE INDEX IF NOT EXISTS idx_order_items_vendor_id ON order_items(vendor_id);
CREATE INDEX IF NOT EXISTS idx_order_items_stage ON order_items(stage);
-- Partial index — this is exactly what the Part 3A timeout job scans.
CREATE INDEX IF NOT EXISTS idx_order_items_accept_deadline
  ON order_items(vendor_accept_deadline)
  WHERE stage = 'placed' AND vendor_id IS NOT NULL;

COMMENT ON COLUMN order_items.vendor_id IS
  'Internal sourcing only, copied from products.vendor_id at order-placement time via place_order_with_items(). Never select in customer-facing frontend queries.';

-- stage_updated_at auto-touch (same pattern as Phase 2A's quantity timestamp)
CREATE OR REPLACE FUNCTION touch_order_item_stage_timestamp()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.stage IS DISTINCT FROM OLD.stage THEN
    NEW.stage_updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_order_items_touch_stage ON order_items;
CREATE TRIGGER trg_order_items_touch_stage
  BEFORE UPDATE ON order_items
  FOR EACH ROW EXECUTE FUNCTION touch_order_item_stage_timestamp();

-- ------------------------------------------------------------
-- Guardrail — order_items already has a fully-open anon UPDATE policy
-- (`anon_update_order_items ... USING (true)`, inherited from the
-- original schema, needed for guest checkout on the *other* columns).
-- That means, without this trigger, anyone with the anon key could
-- directly flip stage/vendor_id/barcode/liability on any order item.
-- Nothing in the app currently updates these columns from the browser
-- (order_items has never been written to at all, per the note at the
-- top of this file), but Phase 3B/3C WILL add vendor/admin routes that
-- update `stage` — those must go through the SERVICE ROLE client
-- (same pattern as Phase 2A's guard_vendor_product_fields), same as
-- every other admin/vendor-privileged route in this repo.
-- ------------------------------------------------------------

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
    THEN
      RAISE EXCEPTION 'Only admin/vendor-authorized backend routes can change order fulfillment fields';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_order_item_fulfillment ON order_items;
CREATE TRIGGER trg_guard_order_item_fulfillment
  BEFORE UPDATE ON order_items
  FOR EACH ROW EXECUTE FUNCTION guard_order_item_fulfillment_fields();

-- ============================================================
-- 3. Config — vendor accept-timeout hours, stored in the existing
--    key/value `settings` table (same pattern as loyalty_program,
--    email_provider, etc. in lib/settings-api.ts). Editable later
--    from an admin settings screen without a migration.
-- ============================================================

INSERT INTO settings (key, value)
VALUES ('vendor_order_settings', jsonb_build_object('accept_timeout_hours', 12))
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- 4. RACE-CONDITION-SAFE stock decrement
--    Single atomic UPDATE ... WHERE available_quantity >= qty.
--    Postgres guarantees this check+decrement happens as one atomic
--    row operation — two concurrent callers for the same row can NEVER
--    both succeed past 0, unlike the app's current
--    read-then-write decrementStockForOrder() pattern.
-- ============================================================

CREATE OR REPLACE FUNCTION decrement_variant_unit_stock(p_variant_unit_id uuid, p_quantity integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows integer;
BEGIN
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Invalid quantity';
  END IF;

  UPDATE product_variant_units
  SET available_quantity = available_quantity - p_quantity
  WHERE id = p_variant_unit_id
    AND available_quantity >= p_quantity;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    RAISE EXCEPTION 'INSUFFICIENT_STOCK: variant % does not have % unit(s) available', p_variant_unit_id, p_quantity;
  END IF;
END;
$$;

-- Same pattern for a vendor product with no variants (Phase 2A's
-- `products.available_quantity`, used when only one default variant exists).
CREATE OR REPLACE FUNCTION decrement_product_vendor_stock(p_product_id uuid, p_quantity integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows integer;
BEGIN
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Invalid quantity';
  END IF;

  UPDATE products
  SET available_quantity = available_quantity - p_quantity
  WHERE id = p_product_id
    AND vendor_id IS NOT NULL
    AND available_quantity >= p_quantity;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    RAISE EXCEPTION 'INSUFFICIENT_STOCK: product % does not have % unit(s) available', p_product_id, p_quantity;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION decrement_variant_unit_stock(uuid, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION decrement_product_vendor_stock(uuid, integer) TO anon, authenticated;

-- ============================================================
-- 5. place_order_with_items — the atomic RPC that should replace
--    checkout's raw `.from('orders').insert(...)` call (Phase 3B/3C
--    wiring). Everything below runs in ONE Postgres function call,
--    i.e. one transaction: if ANY item's stock check fails, the
--    exception aborts the whole call — the order row, every
--    order_item, and every decrement made so far in this call are all
--    rolled back together. Nothing is left half-created.
--
--    p_order: jsonb matching the `orders` insert your checkout page
--             already builds (user_id, total_amount, payment_method,
--             shipping_address, customer_name/email/phone, session_id,
--             subtotal, shipping_charge, gst_amount, coupon_*,
--             gift_card_*, loyalty_*, reseller_* — all optional/nullable).
--    p_items: jsonb array of { product_id, product_name, size,
--             quantity, price, variant_unit_id (nullable — pass this
--             when the cart line is a specific vendor color/size) }.
--
--    vendor_id / barcode are NEVER taken from p_items — always looked
--    up fresh from `products` inside this function, so a tampered
--    client payload can't forge which vendor an order line is
--    attributed to.
-- ============================================================

CREATE OR REPLACE FUNCTION place_order_with_items(p_order jsonb, p_items jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id uuid;
  v_item jsonb;
  v_product_id uuid;
  v_variant_unit_id uuid;
  v_quantity integer;
  v_vendor_id uuid;
  v_barcode text;
  v_timeout_hours integer;
  v_deadline timestamptz;
BEGIN
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Cannot place an order with no items';
  END IF;

  SELECT coalesce((value->>'accept_timeout_hours')::integer, 12)
  INTO v_timeout_hours
  FROM settings WHERE key = 'vendor_order_settings';
  v_timeout_hours := coalesce(v_timeout_hours, 12);

  INSERT INTO orders (
    user_id, items, total_amount, status, payment_method, shipping_address,
    customer_name, customer_email, customer_phone, session_id, subtotal,
    shipping_charge, gst_amount, coupon_code, coupon_discount,
    gift_card_code, gift_card_discount, loyalty_points_redeemed,
    loyalty_discount, is_reseller_order, reseller_id,
    reseller_margin_percent, reseller_base_cost, reseller_profit,
    reseller_brand_name
  )
  VALUES (
    NULLIF(p_order->>'user_id', '')::uuid,
    coalesce(p_order->'items', '[]'::jsonb),
    (p_order->>'total_amount')::integer,
    coalesce(p_order->>'status', 'pending'),
    coalesce(p_order->>'payment_method', 'cod'),
    p_order->'shipping_address',
    p_order->>'customer_name',
    p_order->>'customer_email',
    p_order->>'customer_phone',
    p_order->>'session_id',
    (p_order->>'subtotal')::integer,
    coalesce((p_order->>'shipping_charge')::integer, 0),
    coalesce((p_order->>'gst_amount')::integer, 0),
    NULLIF(p_order->>'coupon_code', ''),
    coalesce((p_order->>'coupon_discount')::integer, 0),
    NULLIF(p_order->>'gift_card_code', ''),
    coalesce((p_order->>'gift_card_discount')::integer, 0),
    coalesce((p_order->>'loyalty_points_redeemed')::integer, 0),
    coalesce((p_order->>'loyalty_discount')::integer, 0),
    coalesce((p_order->>'is_reseller_order')::boolean, false),
    NULLIF(p_order->>'reseller_id', '')::uuid,
    (p_order->>'reseller_margin_percent')::numeric,
    (p_order->>'reseller_base_cost')::integer,
    (p_order->>'reseller_profit')::integer,
    NULLIF(p_order->>'reseller_brand_name', '')
  )
  RETURNING id INTO v_order_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::uuid;
    v_quantity := (v_item->>'quantity')::integer;
    v_variant_unit_id := NULLIF(v_item->>'variant_unit_id', '')::uuid;

    SELECT vendor_id, barcode INTO v_vendor_id, v_barcode
    FROM products WHERE id = v_product_id;

    -- Atomic check+decrement, vendor stock only. Non-vendor items
    -- (vendor_id IS NULL) are untouched here — checkout's existing
    -- decrementStockForOrder() continues to own that legacy path.
    IF v_variant_unit_id IS NOT NULL THEN
      PERFORM decrement_variant_unit_stock(v_variant_unit_id, v_quantity);
    ELSIF v_vendor_id IS NOT NULL THEN
      PERFORM decrement_product_vendor_stock(v_product_id, v_quantity);
    END IF;

    v_deadline := CASE WHEN v_vendor_id IS NOT NULL
                        THEN now() + (v_timeout_hours || ' hours')::interval
                        ELSE NULL END;

    INSERT INTO order_items (
      order_id, product_id, product_name, size, quantity, price,
      vendor_id, variant_unit_id, barcode, stage, vendor_accept_deadline
    ) VALUES (
      v_order_id,
      v_product_id,
      v_item->>'product_name',
      v_item->>'size',
      v_quantity,
      (v_item->>'price')::integer,
      v_vendor_id,
      v_variant_unit_id,
      v_barcode,
      'placed',
      v_deadline
    );
  END LOOP;

  RETURN v_order_id;
END;
$$;

GRANT EXECUTE ON FUNCTION place_order_with_items(jsonb, jsonb) TO anon, authenticated;

-- ============================================================
-- 6. Restock helper — used by the accept-timeout cron (Part 4 below)
--    when a vendor misses their accept window, and safe to reuse
--    later for cancellations/returns in Phase 3C.
-- ============================================================

CREATE OR REPLACE FUNCTION restock_order_item(p_order_item_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item record;
BEGIN
  SELECT * INTO v_item FROM order_items WHERE id = p_order_item_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_item.variant_unit_id IS NOT NULL THEN
    UPDATE product_variant_units
    SET available_quantity = available_quantity + v_item.quantity
    WHERE id = v_item.variant_unit_id;
  ELSIF v_item.vendor_id IS NOT NULL THEN
    UPDATE products
    SET available_quantity = available_quantity + v_item.quantity
    WHERE id = v_item.product_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION restock_order_item(uuid) TO service_role;

-- NOTE (known gap, matching the one already flagged in the Phase 2A
-- migration): order_items' original anon SELECT policy is fully open
-- (`USING (true)`), inherited from the pre-vendor schema for guest
-- order lookup. That means vendor_id/barcode on every order item are,
-- in principle, readable by anyone querying the Supabase REST API
-- directly with the anon key — same class of gap as `products`, not
-- introduced by this migration. Properly closing it means reworking
-- the original open orders/order_items policies (used by guest
-- checkout + order lookup by session_id across this whole app), which
-- is bigger than Phase 3A's scope — flagging for its own reviewed pass.
