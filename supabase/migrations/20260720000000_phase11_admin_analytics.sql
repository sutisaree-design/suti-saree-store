/*
# Phase 11 — Admin Analytics Dashboard

## Overview
Adds everything needed for the admin analytics dashboard:
1. Customer behaviour tracking (page views, product views, add-to-cart,
   checkout starts, purchases) via a single `activity_events` table.
2. Wholesale / bulk pricing tiers per product.
3. A low-stock threshold on products so the dashboard can raise alerts.

This migration is additive — it only creates new tables/columns and does
not touch existing data. It follows the same security model as the rest
of this project: single-tenant demo, no staff-role auth, so RLS policies
use `TO anon, authenticated USING (true)` like every other table here.

## New Tables

### activity_events
Generic event log used to reconstruct customer behaviour: which pages a
visitor looked at, which products they viewed, whether they added to
cart, started checkout, and whether they eventually purchased.
- `id` (uuid, pk)
- `session_id` (text, not null) — random id generated client-side and kept
  in sessionStorage for the life of a browser tab/visit
- `user_id` (uuid, nullable) — set when the visitor is a logged-in customer
- `event_type` (text) — 'page_view' | 'product_view' | 'add_to_cart' |
  'checkout_start' | 'purchase'
- `page_path` (text, nullable) — e.g. /shop, /product/silk-saree
- `product_id` (uuid, nullable, FK -> products, ON DELETE SET NULL)
- `order_id` (uuid, nullable, FK -> orders, ON DELETE SET NULL)
- `metadata` (jsonb) — free-form extra detail (email, cart value, etc.)
- `created_at` (timestamptz)

### wholesale_pricing
Bulk/wholesale price tiers per product — "buy N or more, pay ₹X each".
- `id` (uuid, pk)
- `product_id` (uuid, FK -> products, ON DELETE CASCADE)
- `min_quantity` (integer) — minimum units to unlock this tier
- `unit_price` (integer) — price per unit (INR) at this tier
- `label` (text, nullable) — optional display label e.g. "Wholesale"
- `created_at` (timestamptz)

## Changes to existing tables
- products: `low_stock_threshold` (integer, default 5) — the dashboard
  flags any product at or below this stock level.

## Notes / limitations
- There is no staff-login/identity system in this app (see existing
  schema notes), so behaviour is stitched together best-effort using
  `session_id` (every visit) and `user_id`/`email` (once known, e.g. at
  checkout or in a logged-in account). This is enough to show "what did
  this customer look at / do" without over-building an auth system that
  isn't part of the app.
*/

-- ============================================================
-- 1. ACTIVITY EVENTS (customer behaviour tracking)
-- ============================================================
CREATE TABLE IF NOT EXISTS activity_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type text NOT NULL CHECK (
    event_type IN ('page_view', 'product_view', 'add_to_cart', 'checkout_start', 'purchase')
  ),
  page_path text,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  order_id uuid REFERENCES orders(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE activity_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_insert_activity_events" ON activity_events;
CREATE POLICY "anon_insert_activity_events" ON activity_events FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_select_activity_events" ON activity_events;
CREATE POLICY "anon_select_activity_events" ON activity_events FOR SELECT
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_activity_events_created_at ON activity_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_events_session_id ON activity_events(session_id);
CREATE INDEX IF NOT EXISTS idx_activity_events_user_id ON activity_events(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_events_event_type ON activity_events(event_type);
CREATE INDEX IF NOT EXISTS idx_activity_events_product_id ON activity_events(product_id);

-- ============================================================
-- 2. WHOLESALE / BULK PRICING TIERS
-- ============================================================
CREATE TABLE IF NOT EXISTS wholesale_pricing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  min_quantity integer NOT NULL CHECK (min_quantity >= 2),
  unit_price integer NOT NULL CHECK (unit_price >= 0),
  label text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, min_quantity)
);

ALTER TABLE wholesale_pricing ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_wholesale_pricing" ON wholesale_pricing;
CREATE POLICY "anon_select_wholesale_pricing" ON wholesale_pricing FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_write_wholesale_pricing" ON wholesale_pricing;
CREATE POLICY "anon_write_wholesale_pricing" ON wholesale_pricing FOR ALL
  TO anon, authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_wholesale_pricing_product_id ON wholesale_pricing(product_id);

-- ============================================================
-- 3. LOW STOCK THRESHOLD ON PRODUCTS
-- ============================================================
ALTER TABLE products ADD COLUMN IF NOT EXISTS low_stock_threshold integer NOT NULL DEFAULT 5;

-- ============================================================
-- 4. SESSION ID ON ORDERS
-- ============================================================
-- Links a placed order back to the same browser session_id used in
-- activity_events, so Admin > Customers can show "pages this customer
-- visited before ordering" even for guest (non-logged-in) checkouts.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS session_id text;
CREATE INDEX IF NOT EXISTS idx_orders_session_id ON orders(session_id);
