-- ============================================================
-- SECURITY FIX: re-close the ₹1/free-order hole that regressed, and
-- stop anon/authenticated from writing orders/order_items directly.
-- ============================================================
-- PROBLEM #1 (price regression):
--   20260726150000_fix_order_price_manipulation.sql made
--   place_order_with_items() recompute price/subtotal/total from the
--   `products` table, ignoring whatever the client sent.
--   20260805000000_phase3a_order_fulfillment_safety.sql then did
--   `CREATE OR REPLACE FUNCTION place_order_with_items(...)` again for
--   an unrelated reason (atomic stock decrement) and, in doing so,
--   silently dropped the price-recompute logic: it went back to
--   trusting (p_order->>'total_amount')::integer and
--   (v_item->>'price')::integer straight from the client. Since
--   Postgres migrations apply in order, the later file wins — so the
--   fix was effectively undone from 2026-08-05 onward even though the
--   original fix migration is still sitting in the repo looking
--   "applied". Verified by re-reading both files directly; this is
--   not a hypothetical.
--
-- FIX #1: same as before — every line item's price is looked up fresh
-- from `products`, and subtotal/total are rebuilt from that, never
-- from client input. This version also keeps phase3a's atomic
-- transaction / stock-decrement / vendor_accept_deadline behavior, so
-- nothing from that migration is lost — only the price trust is
-- re-closed.
--
-- PROBLEM #2 (write RLS):
--   anon_update_orders / anon_delete_orders / anon_update_order_items /
--   anon_delete_order_items (20260716132537_boutique_schema.sql) allow
--   ANY visitor holding the public anon key to update or delete ANY
--   row in `orders` / `order_items` — including flipping status to
--   'paid' without ever paying, or deleting someone else's order.
--   Verified every remaining write path in the app codebase
--   (admin routes, vendor routes, lib/orders-api.ts) already uses the
--   service-role client (getSupabaseAdmin()), which bypasses RLS
--   entirely — so dropping these anon/authenticated policies does not
--   break any of those. The only browser-side writes to these tables
--   were the two `orders` status updates in app/checkout/page.tsx,
--   which this change set moves behind new server routes
--   (/api/razorpay/verify-payment, /api/razorpay/mark-failed) that use
--   the service-role client after verifying the payment signature
--   server-side.
--
-- FIX #2: drop the anon/authenticated UPDATE and DELETE policies on
-- orders and order_items. SELECT and INSERT policies are left as-is
-- here (SELECT still needs a separate pass to stop the customer PII
-- leak — flagging as a known follow-up, not silently fixed by this
-- migration).
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

-- ---- Lock down direct writes to orders / order_items ----
DROP POLICY IF EXISTS "anon_update_orders" ON orders;
DROP POLICY IF EXISTS "anon_delete_orders" ON orders;
DROP POLICY IF EXISTS "anon_update_order_items" ON order_items;
DROP POLICY IF EXISTS "anon_delete_order_items" ON order_items;
