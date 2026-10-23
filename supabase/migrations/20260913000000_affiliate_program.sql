-- ============================================================
-- Affiliate program
--
-- Reseller system (20260728000000 onwards) lets a customer mark up
-- the store's price and resell under their own margin. This is a
-- DIFFERENT model: a customer applies to become an "affiliate", gets
-- approved by the admin, and is given a unique referral code/link.
-- When someone else places an order after landing on the site via
-- that link, the affiliate earns a cash commission (% of the order
-- subtotal) — they never see or touch pricing themselves.
--
-- Payout lifecycle mirrors reseller_payouts exactly (see
-- 20260803140000_reseller_payout_system.sql and
-- 20260803150000_reseller_payout_return_window.sql), just renamed:
--
--   pending_delivery -> in_return_window -> eligible -> paid
--                                         \-> void   (RTO / cancelled /
--                                             refunded / a return filed
--                                             during the window)
--
-- 'in_return_window' only advances to 'eligible' via
-- promote_affiliate_payouts_after_return_window(), meant to be run
-- daily by a cron job (mirrors runResellerPayoutWindowJob) — wiring
-- that cron job itself is a later step, this migration just adds the
-- function so it's ready to be called.
-- ============================================================

-- ---------- affiliates ----------
CREATE TABLE IF NOT EXISTS affiliates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  code text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'suspended')),
  commission_percent numeric NOT NULL DEFAULT 10,
  payout_upi_id text,
  payout_account_holder text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE affiliates ENABLE ROW LEVEL SECURITY;

-- Same permissive pattern as reseller_profiles — actual gating happens
-- server-side (auth.uid() checked against user_id in the API routes),
-- these policies just mirror the existing convention in this repo.
DROP POLICY IF EXISTS "anon_select_affiliates" ON affiliates;
CREATE POLICY "anon_select_affiliates" ON affiliates FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_affiliates" ON affiliates;
CREATE POLICY "anon_insert_affiliates" ON affiliates FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_affiliates" ON affiliates;
CREATE POLICY "anon_update_affiliates" ON affiliates FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_affiliates" ON affiliates;
CREATE POLICY "anon_delete_affiliates" ON affiliates FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_affiliates_user_id ON affiliates(user_id);
CREATE INDEX IF NOT EXISTS idx_affiliates_code ON affiliates(code);
CREATE INDEX IF NOT EXISTS idx_affiliates_status ON affiliates(status);

DROP TRIGGER IF EXISTS trg_affiliates_touch_updated_at ON affiliates;
CREATE TRIGGER trg_affiliates_touch_updated_at
  BEFORE UPDATE ON affiliates
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ---------- affiliate_payouts: one row per payout run an admin makes ----------
CREATE TABLE IF NOT EXISTS affiliate_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id uuid NOT NULL REFERENCES affiliates(id) ON DELETE CASCADE,
  total_amount integer NOT NULL DEFAULT 0,
  order_count integer NOT NULL DEFAULT 0,
  payment_reference text,
  notes text,
  paid_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_affiliate_payouts_affiliate_id ON affiliate_payouts(affiliate_id);

ALTER TABLE affiliate_payouts ENABLE ROW LEVEL SECURITY;

-- Same "affiliate reads only their own rows" pattern as
-- reseller_payouts — no INSERT/UPDATE policy for anon/authenticated at
-- all, this table is written only by the admin payout route via the
-- service role.
DROP POLICY IF EXISTS "own_select_affiliate_payouts" ON affiliate_payouts;
CREATE POLICY "own_select_affiliate_payouts" ON affiliate_payouts FOR SELECT
  TO authenticated USING (
    affiliate_id IN (SELECT id FROM affiliates WHERE user_id = auth.uid())
  );

-- ---------- orders: affiliate columns ----------
ALTER TABLE orders ADD COLUMN IF NOT EXISTS is_affiliate_order boolean NOT NULL DEFAULT false;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS affiliate_id uuid REFERENCES affiliates(id) ON DELETE SET NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS affiliate_code text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS affiliate_commission_percent numeric;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS affiliate_commission_amount integer;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS affiliate_payout_status text
  CHECK (affiliate_payout_status IN ('pending_delivery', 'in_return_window', 'eligible', 'paid', 'void'));
ALTER TABLE orders ADD COLUMN IF NOT EXISTS affiliate_payout_delivered_at timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS affiliate_payout_return_window_ends_at timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS affiliate_payout_eligible_at timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS affiliate_payout_id uuid
  REFERENCES affiliate_payouts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orders_affiliate_id ON orders(affiliate_id);
CREATE INDEX IF NOT EXISTS idx_orders_affiliate_payout_status ON orders(affiliate_payout_status)
  WHERE is_affiliate_order = true;

-- ---------- trigger: initialize payout status on a new affiliate order ----------
CREATE OR REPLACE FUNCTION init_affiliate_payout_status()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.is_affiliate_order IS TRUE AND NEW.affiliate_payout_status IS NULL THEN
    NEW.affiliate_payout_status := 'pending_delivery';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_init_affiliate_payout_status ON orders;
CREATE TRIGGER trg_init_affiliate_payout_status
  BEFORE INSERT ON orders
  FOR EACH ROW EXECUTE FUNCTION init_affiliate_payout_status();

-- ---------- trigger: delivery moves an order into the return window ----------
-- Goes straight from pending_delivery -> in_return_window (not
-- straight to eligible) since this program launches with the
-- return-window rule already in place — no old "immediate eligible"
-- behaviour to migrate away from, unlike the reseller system.
CREATE OR REPLACE FUNCTION sync_affiliate_payout_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_return_window_days integer;
BEGIN
  IF NEW.is_affiliate_order IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  -- Never touch a payout that's already been paid out — any refund/RTO
  -- discovered after the fact is a manual clawback matter for the
  -- admin, not something this trigger should silently reverse.
  IF NEW.affiliate_payout_status = 'paid' THEN
    RETURN NEW;
  END IF;

  IF NEW.delivery_status IN ('rto_initiated', 'rto_delivered')
     OR NEW.status IN ('cancelled', 'failed')
     OR NEW.refund_status = 'refunded' THEN
    NEW.affiliate_payout_status := 'void';
    RETURN NEW;
  END IF;

  IF (NEW.delivery_status = 'delivered' OR NEW.status = 'delivered')
     AND (NEW.affiliate_payout_status = 'pending_delivery' OR NEW.affiliate_payout_status IS NULL) THEN
    SELECT coalesce((value->>'return_window_days')::integer, 7)
    INTO v_return_window_days
    FROM settings WHERE key = 'fulfillment_settings';
    v_return_window_days := coalesce(v_return_window_days, 7);

    NEW.affiliate_payout_status := 'in_return_window';
    NEW.affiliate_payout_delivered_at := now();
    NEW.affiliate_payout_return_window_ends_at := now() + (v_return_window_days || ' days')::interval;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_affiliate_payout_status ON orders;
CREATE TRIGGER trg_sync_affiliate_payout_status
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION sync_affiliate_payout_status();

-- ---------- trigger: a return filed during the window voids the payout ----------
CREATE OR REPLACE FUNCTION void_affiliate_payout_on_return()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IN ('requested', 'approved', 'refunded', 'completed') THEN
    UPDATE orders
    SET affiliate_payout_status = 'void'
    WHERE id = NEW.order_id
      AND is_affiliate_order = true
      AND affiliate_payout_status IN ('pending_delivery', 'in_return_window', 'eligible');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_void_affiliate_payout_on_return ON returns;
CREATE TRIGGER trg_void_affiliate_payout_on_return
  AFTER INSERT OR UPDATE ON returns
  FOR EACH ROW EXECUTE FUNCTION void_affiliate_payout_on_return();

-- ---------- function: promote orders whose return window has closed ----------
-- Meant to be run daily (a lib/cron-jobs.ts wiring + daily-jobs route
-- call is a separate step, same as the reseller
-- promote_reseller_payouts_after_return_window equivalent).
CREATE OR REPLACE FUNCTION promote_affiliate_payouts_after_return_window()
RETURNS TABLE (order_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE orders
  SET affiliate_payout_status = 'eligible',
      affiliate_payout_eligible_at = now()
  WHERE is_affiliate_order = true
    AND affiliate_payout_status = 'in_return_window'
    AND affiliate_payout_return_window_ends_at IS NOT NULL
    AND affiliate_payout_return_window_ends_at <= now()
  RETURNING id;
END;
$$;

GRANT EXECUTE ON FUNCTION promote_affiliate_payouts_after_return_window() TO service_role;

-- ------------------------------------------------------------
-- place_order_with_items() — copied from 20260911000000 (the latest
-- version at the time of writing) with ONE addition: if p_order
-- carries an 'affiliate_code', it is looked up server-side (never
-- trusting a client-supplied commission amount) against an APPROVED
-- affiliate, and if found the order is stamped as an affiliate order
-- with a commission computed from the authoritative subtotal.
-- Everything else (price recomputation, stock decrement, return-risk
-- COD gate, etc.) is untouched.
-- ------------------------------------------------------------
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
  v_unit_price integer;
  v_computed_subtotal integer := 0;
  v_shipping integer;
  v_gst integer;
  v_coupon_discount integer;
  v_gift_card_discount integer;
  v_loyalty_discount integer;
  v_payment_discount integer;
  v_total integer;
  v_items_snapshot jsonb := '[]'::jsonb;
  v_phone text;
  v_payment_method text;
  v_risk_total integer;
  v_blocked_until timestamptz;
  v_affiliate_code text;
  v_affiliate_id uuid;
  v_affiliate_commission_percent numeric;
  v_is_affiliate_order boolean := false;
  v_affiliate_commission_amount integer;
BEGIN
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Cannot place an order with no items';
  END IF;

  SELECT coalesce((value->>'accept_timeout_hours')::integer, 12)
  INTO v_timeout_hours
  FROM settings WHERE key = 'vendor_order_settings';
  v_timeout_hours := coalesce(v_timeout_hours, 12);

  -- ---- Return/RTO risk gate: COD only, 15-day cooldown ----
  v_phone := NULLIF(trim(p_order->>'customer_phone'), '');
  v_payment_method := coalesce(p_order->>'payment_method', 'cod');
  IF v_phone IS NOT NULL AND v_payment_method = 'cod' THEN
    SELECT (return_count + rto_count), blocked_until
    INTO v_risk_total, v_blocked_until
    FROM customer_return_risk
    WHERE phone = v_phone;

    IF v_blocked_until IS NOT NULL AND now() < v_blocked_until THEN
      RAISE EXCEPTION 'COD_BLOCKED_RETURN_RISK: This phone number has % past return/RTO order(s). COD is paused until %. Please choose online payment to place this order.',
        coalesce(v_risk_total, 0), to_char(v_blocked_until, 'DD Mon YYYY');
    END IF;
  END IF;

  -- ---- Pass 1: recompute authoritative prices, never trust the client ----
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::uuid;
    v_quantity := (v_item->>'quantity')::integer;

    IF v_product_id IS NULL OR v_quantity IS NULL OR v_quantity <= 0 THEN
      RAISE EXCEPTION 'Invalid order item: missing product_id or quantity';
    END IF;

    SELECT price INTO v_unit_price FROM products WHERE id = v_product_id;
    IF v_unit_price IS NULL THEN
      RAISE EXCEPTION 'Product % not found (or has no price)', v_product_id;
    END IF;

    v_computed_subtotal := v_computed_subtotal + (v_unit_price * v_quantity);
    v_items_snapshot := v_items_snapshot || jsonb_build_array(v_item || jsonb_build_object('price', v_unit_price));
  END LOOP;

  v_shipping := greatest(coalesce((p_order->>'shipping_charge')::integer, 0), 0);
  v_gst := greatest(coalesce((p_order->>'gst_amount')::integer, 0), 0);
  v_coupon_discount := greatest(coalesce((p_order->>'coupon_discount')::integer, 0), 0);
  v_gift_card_discount := greatest(coalesce((p_order->>'gift_card_discount')::integer, 0), 0);
  v_loyalty_discount := greatest(coalesce((p_order->>'loyalty_discount')::integer, 0), 0);
  v_payment_discount := CASE
    WHEN v_payment_method = 'online'
    THEN greatest(coalesce((p_order->>'online_payment_discount')::integer, 0), 0)
    ELSE 0
  END;

  v_total := greatest(
    v_computed_subtotal + v_shipping + v_gst
      - v_coupon_discount - v_gift_card_discount - v_loyalty_discount - v_payment_discount,
    0
  );

  -- ---- Affiliate lookup: server-side only, never trust a client commission ----
  v_affiliate_code := NULLIF(trim(p_order->>'affiliate_code'), '');
  IF v_affiliate_code IS NOT NULL THEN
    SELECT id, commission_percent
    INTO v_affiliate_id, v_affiliate_commission_percent
    FROM affiliates
    WHERE code = v_affiliate_code AND status = 'approved';

    IF v_affiliate_id IS NOT NULL THEN
      v_is_affiliate_order := true;
      v_affiliate_commission_amount := round(v_computed_subtotal * v_affiliate_commission_percent / 100.0);
    ELSE
      -- Unknown/unapproved code: silently ignore rather than failing
      -- the whole order placement over a stale/expired referral link.
      v_affiliate_code := NULL;
    END IF;
  END IF;

  INSERT INTO orders (
    user_id, items, total_amount, status, payment_method, shipping_address,
    customer_name, customer_email, customer_phone, session_id, subtotal,
    shipping_charge, gst_amount, coupon_code, coupon_discount,
    gift_card_code, gift_card_discount, loyalty_points_redeemed,
    loyalty_discount, online_payment_discount, is_reseller_order, reseller_id,
    reseller_margin_percent, reseller_base_cost, reseller_profit,
    reseller_brand_name, is_affiliate_order, affiliate_id, affiliate_code,
    affiliate_commission_percent, affiliate_commission_amount
  )
  VALUES (
    NULLIF(p_order->>'user_id', '')::uuid,
    v_items_snapshot,
    v_total,
    coalesce(p_order->>'status', 'pending'),
    v_payment_method,
    p_order->'shipping_address',
    p_order->>'customer_name',
    p_order->>'customer_email',
    p_order->>'customer_phone',
    p_order->>'session_id',
    v_computed_subtotal,
    v_shipping,
    v_gst,
    NULLIF(p_order->>'coupon_code', ''),
    v_coupon_discount,
    NULLIF(p_order->>'gift_card_code', ''),
    v_gift_card_discount,
    coalesce((p_order->>'loyalty_points_redeemed')::integer, 0),
    v_loyalty_discount,
    v_payment_discount,
    coalesce((p_order->>'is_reseller_order')::boolean, false),
    NULLIF(p_order->>'reseller_id', '')::uuid,
    (p_order->>'reseller_margin_percent')::numeric,
    (p_order->>'reseller_base_cost')::integer,
    (p_order->>'reseller_profit')::integer,
    NULLIF(p_order->>'reseller_brand_name', ''),
    v_is_affiliate_order,
    v_affiliate_id,
    v_affiliate_code,
    v_affiliate_commission_percent,
    v_affiliate_commission_amount
  )
  RETURNING id INTO v_order_id;

  -- ---- Pass 2: stock decrement + order_items, using the same authoritative price ----
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::uuid;
    v_quantity := (v_item->>'quantity')::integer;
    v_variant_unit_id := NULLIF(v_item->>'variant_unit_id', '')::uuid;

    SELECT vendor_id, barcode, price INTO v_vendor_id, v_barcode, v_unit_price
    FROM products WHERE id = v_product_id;

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
      v_unit_price,
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
