-- ============================================================
-- Why this migration exists
--
-- place_order_with_items() has been redefined by several migrations
-- in a row, each one with CREATE OR REPLACE FUNCTION (which replaces
-- the ENTIRE body), each branched off a different earlier copy:
--
--   20260911000000  adds the return/RTO risk COD gate
--   20260912120000  branched off 20260901000000 (BEFORE the COD gate)
--                   -> fixes price manipulation, but silently drops
--                      the COD gate
--   20260913000000  (affiliate_program) branched off 20260911000000
--                   (BEFORE the price-manipulation fix)
--                   -> adds affiliate commission handling, but
--                      silently REVERTS the price-manipulation fix
--                      (coupon/gift-card/loyalty/online-payment
--                      discounts go back to being trusted from the
--                      client instead of recomputed server-side)
--   20260915010000  branched off 20260912120000 (BEFORE the affiliate
--                   program) -> restores the COD gate and keeps the
--                   price-manipulation fix, but silently drops the
--                   affiliate commission handling added in 20260913
--
-- Net effect of the migrations as currently written: whichever one
-- was applied last wins completely, and it's impossible to get the
-- price-manipulation fix, the COD risk gate, AND affiliate handling
-- all at once. This migration is the merge: it keeps all three,
-- so no future CREATE OR REPLACE in this chain undoes another.
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
  v_unit_price integer;
  v_computed_subtotal integer := 0;
  v_distinct_products integer := 0;
  v_shipping integer;
  v_gst integer;
  v_user_id uuid;
  v_payment_method text;

  -- ---- return/RTO risk gate ----
  v_phone text;
  v_risk_total integer;
  v_blocked_until timestamptz;

  -- ---- coupon ----
  v_coupon_code text;
  v_coupon record;
  v_coupon_discount integer := 0;

  -- ---- gift card ----
  v_gift_card_code text;
  v_gift_card record;
  v_client_gift_card_discount integer;
  v_gift_card_discount integer := 0;

  -- ---- loyalty ----
  v_loyalty_settings jsonb;
  v_redeem_value numeric;
  v_min_redeem integer;
  v_client_points integer;
  v_user_balance integer;
  v_max_points_by_subtotal integer;
  v_points_redeemed integer := 0;
  v_loyalty_discount integer := 0;

  -- ---- online payment discount ----
  v_discount_setting jsonb;
  v_payment_discount_percent numeric;
  v_payment_discount integer := 0;

  -- ---- affiliate ----
  v_affiliate_code text;
  v_affiliate_id uuid;
  v_affiliate_commission_percent numeric;
  v_is_affiliate_order boolean := false;
  v_affiliate_commission_amount integer;

  v_running_subtotal integer;
  v_total integer;
  v_items_snapshot jsonb := '[]'::jsonb;
BEGIN
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Cannot place an order with no items';
  END IF;

  v_user_id := NULLIF(p_order->>'user_id', '')::uuid;
  v_payment_method := coalesce(p_order->>'payment_method', 'cod');

  SELECT coalesce((value->>'accept_timeout_hours')::integer, 12)
  INTO v_timeout_hours
  FROM settings WHERE key = 'vendor_order_settings';
  v_timeout_hours := coalesce(v_timeout_hours, 12);

  -- ---- Return/RTO risk gate: COD only, 15-day cooldown ----
  v_phone := NULLIF(trim(p_order->>'customer_phone'), '');
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
  SELECT count(DISTINCT (item->>'product_id')) INTO v_distinct_products
  FROM jsonb_array_elements(p_items) AS item;

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
  v_running_subtotal := v_computed_subtotal;

  -- ---- Coupon: look the code up ourselves, never trust the discount amount ----
  v_coupon_code := NULLIF(p_order->>'coupon_code', '');
  IF v_coupon_code IS NOT NULL THEN
    SELECT * INTO v_coupon FROM coupons WHERE lower(code) = lower(v_coupon_code);

    IF FOUND
      AND v_coupon.is_active
      AND (v_coupon.expires_at IS NULL OR v_coupon.expires_at > now())
      AND (v_coupon.usage_limit IS NULL OR v_coupon.times_used < v_coupon.usage_limit)
      AND v_running_subtotal >= v_coupon.min_order_value
    THEN
      -- Same formula as computeCouponDiscount() in lib/coupons-api.ts.
      v_coupon_discount := CASE
        WHEN v_coupon.discount_type = 'percentage'
          THEN round(v_running_subtotal * v_coupon.discount_value / 100)
        ELSE round(v_coupon.discount_value) * greatest(1, v_distinct_products)
      END;
      v_coupon_discount := least(greatest(v_coupon_discount, 0), v_running_subtotal);

      UPDATE coupons SET times_used = times_used + 1 WHERE id = v_coupon.id;
    ELSE
      v_coupon_code := NULL;
      v_coupon_discount := 0;
    END IF;
  END IF;
  v_running_subtotal := greatest(v_running_subtotal - v_coupon_discount, 0);

  -- ---- Gift card: validate against the real balance, never the client's number ----
  v_gift_card_code := NULLIF(p_order->>'gift_card_code', '');
  v_client_gift_card_discount := greatest(coalesce((p_order->>'gift_card_discount')::integer, 0), 0);
  IF v_gift_card_code IS NOT NULL AND v_client_gift_card_discount > 0 THEN
    SELECT * INTO v_gift_card FROM gift_cards WHERE lower(code) = lower(v_gift_card_code);

    IF FOUND
      AND v_gift_card.status = 'active'
      AND (v_gift_card.expires_at IS NULL OR v_gift_card.expires_at > now())
      AND v_gift_card.balance > 0
    THEN
      v_gift_card_discount := least(v_client_gift_card_discount, v_gift_card.balance, v_running_subtotal);
    ELSE
      v_gift_card_code := NULL;
      v_gift_card_discount := 0;
    END IF;
  ELSE
    v_gift_card_code := NULL;
    v_gift_card_discount := 0;
  END IF;
  v_running_subtotal := greatest(v_running_subtotal - v_gift_card_discount, 0);

  -- ---- Loyalty points: only from THIS user's real balance/settings ----
  v_client_points := greatest(coalesce((p_order->>'loyalty_points_redeemed')::integer, 0), 0);
  IF v_user_id IS NOT NULL AND v_client_points > 0 THEN
    SELECT value INTO v_loyalty_settings FROM settings WHERE key = 'loyalty_program';
    IF coalesce((v_loyalty_settings->>'enabled')::boolean, true) THEN
      v_redeem_value := coalesce((v_loyalty_settings->>'redeem_value_per_point')::numeric, 0.5);
      v_min_redeem := coalesce((v_loyalty_settings->>'min_redeem_points')::integer, 100);

      SELECT coalesce(loyalty_balance, 0) INTO v_user_balance FROM profiles WHERE id = v_user_id;
      v_user_balance := coalesce(v_user_balance, 0);

      v_max_points_by_subtotal := CASE
        WHEN v_redeem_value > 0 THEN floor(v_running_subtotal / v_redeem_value)::integer
        ELSE 0
      END;

      v_points_redeemed := least(v_client_points, v_user_balance, v_max_points_by_subtotal);
      IF v_points_redeemed < v_min_redeem THEN
        v_points_redeemed := 0;
      END IF;
      v_loyalty_discount := round(v_points_redeemed * v_redeem_value);

      IF v_points_redeemed > 0 THEN
        INSERT INTO loyalty_points_ledger (user_id, points, type, reason)
        VALUES (v_user_id, -v_points_redeemed, 'redeem', 'Redeemed at checkout');
      END IF;
    END IF;
  END IF;
  v_running_subtotal := greatest(v_running_subtotal - v_loyalty_discount, 0);

  -- ---- Online payment discount: recompute from Settings, only for 'online' ----
  IF v_payment_method = 'online' THEN
    SELECT value INTO v_discount_setting FROM settings WHERE key = 'payment_discount';
    v_payment_discount_percent := CASE
      WHEN coalesce((v_discount_setting->>'enabled')::boolean, false)
        THEN greatest(coalesce((v_discount_setting->>'percent')::numeric, 0), 0)
      ELSE 0
    END;
    v_payment_discount := round(v_running_subtotal * v_payment_discount_percent / 100);
  ELSE
    v_payment_discount := 0;
  END IF;

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
    v_user_id,
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
    v_coupon_code,
    v_coupon_discount,
    v_gift_card_code,
    v_gift_card_discount,
    v_points_redeemed,
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

  IF v_points_redeemed > 0 THEN
    UPDATE loyalty_points_ledger
    SET order_id = v_order_id
    WHERE user_id = v_user_id AND order_id IS NULL AND type = 'redeem' AND points = -v_points_redeemed
    AND id = (
      SELECT id FROM loyalty_points_ledger
      WHERE user_id = v_user_id AND order_id IS NULL AND type = 'redeem' AND points = -v_points_redeemed
      ORDER BY created_at DESC LIMIT 1
    );
  END IF;

  IF v_gift_card_discount > 0 AND v_gift_card.id IS NOT NULL THEN
    UPDATE gift_cards SET balance = balance - v_gift_card_discount WHERE id = v_gift_card.id;
  END IF;

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
