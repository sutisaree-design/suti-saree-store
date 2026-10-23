-- ============================================================
-- SECURITY FIX: server-side price recomputation for checkout
-- ============================================================
-- PROBLEM: place_order_with_items() previously trusted the item
-- `price` and order `total_amount`/`subtotal` fields exactly as sent
-- by the browser. Since the checkout page computes these client-side
-- (app/checkout/page.tsx: `price: i.product.price`), anyone could
-- open dev tools / call the RPC directly and submit any price they
-- wanted (e.g. price: 1 for a real product), then pay that
-- attacker-chosen amount via Razorpay and have it "verified" (the
-- Razorpay verification step only checks the payment signature, not
-- that the amount matches the real product price).
--
-- FIX: this function now looks up the authoritative price from the
-- `products` table for every line item and rebuilds subtotal/total
-- from that, ignoring whatever price the client sent. The `items`
-- JSON snapshot stored on the order is also corrected to match, so
-- invoices/emails/admin views show the real price.
--
-- SAFE TO APPLY: this only changes what happens *inside* the existing
-- SECURITY DEFINER function. It does not touch RLS policies, so it
-- cannot break anything that currently works. Recommended to test in
-- a staging/dev Supabase project first, same as any DB migration.
--
-- KNOWN REMAINING GAP (flagging honestly, not fixed by this pass):
-- coupon_discount / gift_card_discount / loyalty_discount are still
-- taken from the client. Closing that fully means re-validating the
-- coupon code / gift card code / loyalty balance against their real
-- tables inside this same function — recommended as the next pass,
-- since it needs the same care as this one (don't want to silently
-- break a working discount flow without testing).
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
  v_shipping integer;
  v_gst integer;
  v_coupon_discount integer;
  v_gift_card_discount integer;
  v_loyalty_discount integer;
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

  v_total := greatest(
    v_computed_subtotal + v_shipping + v_gst
      - v_coupon_discount - v_gift_card_discount - v_loyalty_discount,
    0
  );

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
