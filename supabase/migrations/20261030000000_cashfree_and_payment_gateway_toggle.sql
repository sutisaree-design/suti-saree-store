-- Cashfree Payments + admin on/off toggle for payment gateways.
--
-- RUN THIS BEFORE deploying the storefront change (Supabase > SQL editor).
--
-- DESIGN NOTES
--  * Cashfree orders reuse the existing orders.razorpay_payment_id / razorpay_refund_id
--    columns to hold the gateway payment / refund id. Every downstream feature that already
--    keys off "was this order paid online" (Delhivery prepaid check, cancel+refund, returns,
--    GST report, admin orders panel) therefore keeps working with zero changes.
--  * orders.payment_gateway says WHICH gateway took the money ('razorpay' | 'cashfree'),
--    orders.cashfree_order_id is the order id we created at Cashfree (needed for refunds).
--  * Gateway on/off flags live in settings.key = 'payment_gateways' (public-read so checkout
--    can hide the online option, admin-write only through /api/admin/settings/payment-gateways).

-- 1) Orders ---------------------------------------------------------------------------------
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_gateway   text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cashfree_order_id text;

CREATE INDEX IF NOT EXISTS idx_orders_cashfree_order_id ON orders (cashfree_order_id)
  WHERE cashfree_order_id IS NOT NULL;

-- Existing online orders were all Razorpay.
UPDATE orders SET payment_gateway = 'razorpay'
 WHERE payment_gateway IS NULL AND razorpay_order_id IS NOT NULL;

-- 2) Default settings row (behaviour unchanged: Razorpay on, Cashfree off) -------------------
INSERT INTO settings (key, value)
VALUES (
  'payment_gateways',
  '{"online_enabled": true, "razorpay_enabled": true, "cashfree_enabled": false, "default_gateway": "razorpay"}'::jsonb
)
ON CONFLICT (key) DO NOTHING;

-- 3) Lock writes: anon / logged-in customers must never be able to flip gateways ------------
--    A RESTRICTIVE policy is AND-ed with the existing permissive ones, so we don't have to
--    touch (or risk breaking) the existing anon_write_settings policy.
DROP POLICY IF EXISTS "block_client_insert_payment_gateways" ON settings;
DROP POLICY IF EXISTS "block_client_update_payment_gateways" ON settings;
DROP POLICY IF EXISTS "block_client_delete_payment_gateways" ON settings;

CREATE POLICY "block_client_insert_payment_gateways" ON settings AS RESTRICTIVE FOR INSERT
  TO anon, authenticated WITH CHECK (key <> 'payment_gateways');
CREATE POLICY "block_client_update_payment_gateways" ON settings AS RESTRICTIVE FOR UPDATE
  TO anon, authenticated USING (key <> 'payment_gateways') WITH CHECK (key <> 'payment_gateways');
CREATE POLICY "block_client_delete_payment_gateways" ON settings AS RESTRICTIVE FOR DELETE
  TO anon, authenticated USING (key <> 'payment_gateways');
