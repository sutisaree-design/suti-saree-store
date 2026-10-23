-- ============================================================
-- Online payment discount: an extra % off (configured in
-- Admin > Settings > Online Payment Discount, stored under the
-- 'payment_discount' settings key) applied to an order's total ONLY
-- when the customer pays online instead of COD.
--
-- This adds the column that stores how much was actually discounted on
-- each order (for the order confirmation/admin views/invoices), and
-- re-defines place_order_with_items() — copied from
-- 20260821000000_fix_order_price_regression_and_lock_writes.sql, the
-- latest version at the time of writing — to fold that discount into
-- the authoritative, server-recomputed total. Nothing else about that
-- function's price-manipulation protections changes: product prices are
-- still looked up fresh from `products`, never trusted from the client.
-- ============================================================

ALTER TABLE orders ADD COLUMN IF NOT EXISTS online_payment_discount integer NOT NULL DEFAULT 0;

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
BEGIN
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Cannot place an order with no items';
  END IF;

  SELECT coalesce((value->>'accept_timeout_hours')::integer, 12)
  INTO v_timeout_hours
  FROM settings WHERE key = 'vendor_order_settings';
  v_timeout_hours := coalesce(v_timeout_hours, 12);

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
  -- Only ever honoured when payment_method = 'online' — the checkout UI
  -- already only computes/sends a non-zero value in that case, but we
  -- clamp here too so a tampered COD request can't sneak in a discount.
  v_payment_discount := CASE
    WHEN coalesce(p_order->>'payment_method', 'cod') = 'online'
    THEN greatest(coalesce((p_order->>'online_payment_discount')::integer, 0), 0)
    ELSE 0
  END;

  v_total := greatest(
    v_computed_subtotal + v_shipping + v_gst
      - v_coupon_discount - v_gift_card_discount - v_loyalty_discount - v_payment_discount,
    0
  );

  INSERT INTO orders (
    user_id, items, total_amount, status, payment_method, shipping_address,
    customer_name, customer_email, customer_phone, session_id, subtotal,
    shipping_charge, gst_amount, coupon_code, coupon_discount,
    gift_card_code, gift_card_discount, loyalty_points_redeemed,
    loyalty_discount, online_payment_discount, is_reseller_order, reseller_id,
    reseller_margin_percent, reseller_base_cost, reseller_profit,
    reseller_brand_name
  )
  VALUES (
    NULLIF(p_order->>'user_id', '')::uuid,
    v_items_snapshot,
    v_total,
    coalesce(p_order->>'status', 'pending'),
    coalesce(p_order->>'payment_method', 'cod'),
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
    NULLIF(p_order->>'reseller_brand_name', '')
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
      v_unit_price, -- authoritative server price, never the client-supplied one
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
