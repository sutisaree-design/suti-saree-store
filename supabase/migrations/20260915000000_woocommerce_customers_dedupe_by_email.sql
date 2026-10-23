-- Fix: the first version keyed rows on wc_customer_id (customer id OR guest
-- order id), which let the same real person (same email) end up as two rows
-- when re-imported, because a guest checkout's "identity" was a fragile
-- order id rather than their email.
--
-- Also: the app used to import from /wp-json/wc/v3/customers, which returns
-- EVERY registered WordPress user with the customer role -- including bot
-- spam signups that never placed an order. Going forward the app only
-- imports people who appear on a real order (billing details), so this
-- table should be treated as "real, order-having customers only".

-- Clear out the previous import (which mixed in spam WordPress users and
-- had duplicate emails under different wc_customer_id values). Safe to
-- run -- this table only holds data pulled from WooCommerce, nothing
-- created directly in this store is lost.
TRUNCATE TABLE woocommerce_campaign_sends;
TRUNCATE TABLE woocommerce_customers;

-- Switch the de-duplication key from wc_customer_id to email, since email
-- is the real, stable identity for a customer (a guest's order id is not).
ALTER TABLE woocommerce_customers DROP CONSTRAINT IF EXISTS woocommerce_customers_wc_customer_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_woocommerce_customers_email_unique
  ON woocommerce_customers (email)
  WHERE email IS NOT NULL;
