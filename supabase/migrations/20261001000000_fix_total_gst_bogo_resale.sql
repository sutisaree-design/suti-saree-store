-- ============================================================
-- Fix: order total_amount did not match what the customer was shown
-- at checkout. Three separate causes, all in place_order_with_items():
--
-- 1. GST WAS ADDED ON TOP OF A GST-INCLUSIVE PRICE
--    Every price in this store is GST-inclusive -- app/checkout/page.tsx
--    extracts `tax` purely for display/invoice ("Tax (5% GST, included)")
--    and deliberately does NOT add it to the total, and Admin > Products
--    says the same ("already included in price"). But this function did:
--
--      v_total := v_computed_subtotal + v_shipping + v_gst - ...
--
--    So the row's total_amount came out ~4.76% (at 5% GST) higher than
--    the "Pay Rs X" the shopper actually agreed to. Since
--    /api/razorpay/create-order reads total_amount from this row as the
--    authoritative amount, the customer was CHARGED that inflated amount,
--    and COD orders were booked at it too.
--    Fix: gst_amount is still stored on the row (invoices need it), but
--    it is no longer added into total_amount.
--
-- 2. BOGO DISCOUNT DID NOT EXIST SERVER-SIDE
--    computeBogoDiscount() in lib/cart-context.tsx reduces the total the
--    shopper sees, but no bogo_discount was ever sent to, or computed by,
--    this function -- so on any cart with a live Buy-X-Get-Y promotion the
--    customer was again charged more than the page showed.
--    Fix: the discount is recomputed HERE, from the promotions table and
--    the authoritative product prices, using the exact same algorithm as
--    computeBogoDiscount() (qualifying units expanded one-per-unit, sorted
--    cheapest-first, walked in chunks of buy_qty+get_qty, only a FULL chunk
--    qualifies, the cheapest get_qty units in each chunk get
--    free_item_discount_percent% off, summed across promotions, rounded
--    once at the end). Nothing is trusted from the client, same as the
--    coupon/gift-card/loyalty handling already does.
--
-- 3. RESELLER ORDERS IGNORED THE RESELLER'S SELLING PRICE
--    A resale order is meant to be booked at the price the reseller typed
--    in (payableTotal), with their margin on top of the cost. This function
--    overwrote total_amount with its own cost-side total, so every resale
--    order was placed at cost and the reseller earned nothing.
--    Fix: for is_reseller_order, the client's total_amount is honoured but
--    only UPWARDS -- it can never be lower than the recomputed cost, so it
--    still can't be used to underpay.
--
-- Also adds orders.bogo_discount so the applied amount is auditable on the
-- row, the same way coupon_discount / gift_card_discount already are.
-- ============================================================

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS bogo_discount integer NOT NULL DEFAULT 0;

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

  -- ---- BOGO (recomputed server-side) ----
  v_promo record;
  v_buy_qty integer;
  v_get_qty integer;
  v_group_size integer;
  v_discount_pct numeric;
  v_units integer[];
  v_unit_count integer;
  v_idx integer;
  v_j integer;
  v_bogo_raw numeric := 0;
  v_bogo_discount integer := 0;

  -- ---- gift card ----
  v_gift_card_code text;
  v_gift_card record;
  v_gift_card_id uuid;
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

  -- ---- reseller ----
  v_is_reseller boolean := false;
  v_client_total integer := 0;
  v_reseller_base_cost integer;
  v_reseller_profit integer;
  v_reseller_margin_percent numeric;

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
  -- Stored on the row for the invoice only. NOT added to the total: every
  -- price in this store is already GST-inclusive (see header note 1).
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

  -- ---- BOGO: recomputed here, mirroring computeBogoDiscount() ----
  -- A coupon and a BOGO promo can both be live at once; the client
  -- subtracts them independently from the subtotal, so we do the same.
  FOR v_promo IN
    SELECT id, buy_qty, get_qty, free_item_discount_percent, scope, collection_id
    FROM promotions
    WHERE is_active
      AND offer_type = 'buy_x_get_y'
      AND (starts_at IS NULL OR starts_at <= now())
      AND (ends_at IS NULL OR ends_at >= now())
  LOOP
    v_buy_qty := greatest(coalesce(v_promo.buy_qty, 1), 1);
    v_get_qty := greatest(coalesce(v_promo.get_qty, 1), 1);
    v_group_size := v_buy_qty + v_get_qty;
    v_discount_pct := least(100, greatest(0, coalesce(v_promo.free_item_discount_percent, 100)));

    -- Every qualifying UNIT (a line of quantity 3 contributes 3 entries),
    -- priced from `products`, cheapest first.
    SELECT coalesce(array_agg(u.price ORDER BY u.price), ARRAY[]::integer[])
    INTO v_units
    FROM (
      SELECT pr.price AS price
      FROM jsonb_array_elements(p_items) AS it
      JOIN products pr ON pr.id = (it->>'product_id')::uuid
      CROSS JOIN generate_series(1, greatest((it->>'quantity')::integer, 0)) AS g
      WHERE v_promo.scope = 'all'
         OR (
           v_promo.scope = 'collection'
           AND v_promo.collection_id IS NOT NULL
           AND EXISTS (
             SELECT 1 FROM collection_products cp
             WHERE cp.collection_id = v_promo.collection_id
               AND cp.product_id = pr.id
           )
         )
    ) u;

    v_unit_count := coalesce(array_length(v_units, 1), 0);
    v_idx := 1;
    -- Only a FULL group of (buy_qty + get_qty) units qualifies; a partial
    -- trailing group earns nothing.
    WHILE v_idx + v_group_size - 1 <= v_unit_count LOOP
      FOR v_j IN v_idx .. (v_idx + v_get_qty - 1) LOOP
        v_bogo_raw := v_bogo_raw + (v_units[v_j] * v_discount_pct / 100.0);
      END LOOP;
      v_idx := v_idx + v_group_size;
    END LOOP;
  END LOOP;

  -- Rounded once, after summing across every promotion -- same as the
  -- single Math.round() at the end of computeBogoDiscount().
  v_bogo_discount := least(greatest(round(v_bogo_raw)::integer, 0), v_running_subtotal);
  v_running_subtotal := greatest(v_running_subtotal - v_bogo_discount, 0);

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
      v_gift_card_id := v_gift_card.id;
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

  -- NOTE: v_gst is deliberately NOT part of this sum -- prices are
  -- GST-inclusive, so adding it would charge the tax twice (header note 1).
  v_total := greatest(
    v_computed_subtotal + v_shipping
      - v_coupon_discount - v_bogo_discount - v_gift_card_discount
      - v_loyalty_discount - v_payment_discount,
    0
  );

  -- ---- Reseller: book the order at the reseller's own selling price ----
  v_is_reseller := coalesce((p_order->>'is_reseller_order')::boolean, false);
  v_client_total := greatest(coalesce(round((p_order->>'total_amount')::numeric)::integer, 0), 0);
  IF v_is_reseller AND v_client_total > v_total THEN
    -- Only ever adjusts UPWARDS from the recomputed cost, so this can't be
    -- used to pay less than the goods actually cost.
    v_reseller_base_cost := v_total;
    v_reseller_profit := v_client_total - v_total;
    v_reseller_margin_percent := CASE
      WHEN v_total > 0 THEN round((v_reseller_profit::numeric / v_total) * 100, 1)
      ELSE NULL
    END;
    v_total := v_client_total;
  ELSIF v_is_reseller THEN
    v_reseller_base_cost := v_total;
    v_reseller_profit := 0;
    v_reseller_margin_percent := 0;
  END IF;

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
    shipping_charge, gst_amount, coupon_code, coupon_discount, bogo_discount,
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
    v_bogo_discount,
    v_gift_card_code,
    v_gift_card_discount,
    v_points_redeemed,
    v_loyalty_discount,
    v_payment_discount,
    v_is_reseller,
    NULLIF(p_order->>'reseller_id', '')::uuid,
    v_reseller_margin_percent,
    v_reseller_base_cost,
    v_reseller_profit,
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

  -- Uses v_gift_card_id (plain uuid, always safe to read) instead of
  -- v_gift_card.id -- see 20260930040000.
  IF v_gift_card_discount > 0 AND v_gift_card_id IS NOT NULL THEN
    UPDATE gift_cards SET balance = balance - v_gift_card_discount WHERE id = v_gift_card_id;
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
