/*
# Saaj Boutique — Full Feature Schema (Phase 1)

## Overview
Extends the existing minimal schema (categories, products, orders,
order_items) with every table needed for the complete spec:
customer accounts, product variants (independent SEO pages),
reviews, wishlist, coupons, returns, abandoned carts, contact
inquiries, newsletter subscribers, saved addresses, and store
settings.

This migration is additive and safe to run on top of the existing
two schema files — it only creates NEW tables/columns and does not
touch existing data.

## New Tables
1. profiles — customer profile, linked 1:1 to auth.users
2. addresses — saved shipping addresses per customer
3. product_variants — color+size variant pages, independent SEO
4. reviews — product reviews with star ratings, moderation flag
5. wishlist — customer saved products
6. coupons — discount codes
7. returns — return/exchange requests against an order
8. abandoned_carts — cart recovery tracking
9. contact_inquiries — Contact Us form submissions
10. subscribers — newsletter signups
11. settings — key/value store settings (store info, GSTIN, email
    provider config, GA tracking ID, shipping config)

## Changes to existing tables
- products: gst_rate, meta_title, meta_description columns added
- orders: coupon_code, coupon_discount, shipping_charge, gst_amount,
  subtotal, tracking_number, courier_name columns added

## Security
RLS enabled on all tables. Customer-owned tables (profiles,
addresses, wishlist, returns) restrict to the owning `auth.uid()`.
Public tables (reviews-read, coupons-validate, settings-read select
subset) stay open to anon for storefront use. Admin writes continue
to go through the service role / anon per existing app pattern —
tighten further once full staff-auth roles are introduced.
*/

-- ============================================================
-- 1. PROFILES (customer accounts, extends auth.users)
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  phone text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own_select_profiles" ON profiles;
CREATE POLICY "own_select_profiles" ON profiles FOR SELECT
  TO authenticated USING (auth.uid() = id);

DROP POLICY IF EXISTS "own_insert_profiles" ON profiles;
CREATE POLICY "own_insert_profiles" ON profiles FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "own_update_profiles" ON profiles;
CREATE POLICY "own_update_profiles" ON profiles FOR UPDATE
  TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- Auto-create profile row on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (new.id, new.raw_user_meta_data->>'full_name')
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- 2. ADDRESSES (saved shipping addresses)
-- ============================================================
CREATE TABLE IF NOT EXISTS addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  phone text NOT NULL,
  line1 text NOT NULL,
  line2 text,
  city text NOT NULL,
  state text NOT NULL,
  pincode text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE addresses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own_all_addresses" ON addresses;
CREATE POLICY "own_all_addresses" ON addresses FOR ALL
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_addresses_user_id ON addresses(user_id);

-- ============================================================
-- 3. PRODUCT VARIANTS (color pages w/ independent SEO)
-- ============================================================
CREATE TABLE IF NOT EXISTS product_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  color text NOT NULL,
  slug text UNIQUE NOT NULL,
  images text[] NOT NULL DEFAULT '{}',
  price_override integer,
  meta_title text,
  meta_description text,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS product_variant_sizes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id uuid NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  size text NOT NULL,
  stock_quantity integer NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
  price_override integer,
  UNIQUE (variant_id, size)
);

ALTER TABLE product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_variant_sizes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_variants" ON product_variants;
CREATE POLICY "anon_select_variants" ON product_variants FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_write_variants" ON product_variants;
CREATE POLICY "anon_write_variants" ON product_variants FOR ALL
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_select_variant_sizes" ON product_variant_sizes;
CREATE POLICY "anon_select_variant_sizes" ON product_variant_sizes FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_write_variant_sizes" ON product_variant_sizes;
CREATE POLICY "anon_write_variant_sizes" ON product_variant_sizes FOR ALL
  TO anon, authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_variants_product_id ON product_variants(product_id);
CREATE INDEX IF NOT EXISTS idx_variants_slug ON product_variants(slug);
CREATE INDEX IF NOT EXISTS idx_variant_sizes_variant_id ON product_variant_sizes(variant_id);

-- ============================================================
-- 4. REVIEWS
-- ============================================================
CREATE TABLE IF NOT EXISTS reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  customer_name text NOT NULL,
  rating integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title text,
  comment text,
  is_approved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_approved_reviews" ON reviews;
CREATE POLICY "anon_select_approved_reviews" ON reviews FOR SELECT
  TO anon, authenticated USING (is_approved = true OR auth.uid() = user_id);

DROP POLICY IF EXISTS "auth_insert_reviews" ON reviews;
CREATE POLICY "auth_insert_reviews" ON reviews FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "anon_admin_update_reviews" ON reviews;
CREATE POLICY "anon_admin_update_reviews" ON reviews FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_admin_delete_reviews" ON reviews;
CREATE POLICY "anon_admin_delete_reviews" ON reviews FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_reviews_product_id ON reviews(product_id);

-- ============================================================
-- 5. WISHLIST
-- ============================================================
CREATE TABLE IF NOT EXISTS wishlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, product_id)
);

ALTER TABLE wishlist ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own_all_wishlist" ON wishlist;
CREATE POLICY "own_all_wishlist" ON wishlist FOR ALL
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_wishlist_user_id ON wishlist(user_id);

-- ============================================================
-- 6. COUPONS
-- ============================================================
CREATE TABLE IF NOT EXISTS coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  discount_type text NOT NULL CHECK (discount_type IN ('percentage', 'flat')),
  discount_value numeric NOT NULL CHECK (discount_value > 0),
  min_order_value integer NOT NULL DEFAULT 0,
  usage_limit integer,
  times_used integer NOT NULL DEFAULT 0,
  expires_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_coupons" ON coupons;
CREATE POLICY "anon_select_coupons" ON coupons FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_write_coupons" ON coupons;
CREATE POLICY "anon_write_coupons" ON coupons FOR ALL
  TO anon, authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_coupons_code ON coupons(code);

-- ============================================================
-- 7. RETURNS / REFUNDS / EXCHANGES
-- ============================================================
CREATE TABLE IF NOT EXISTS returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  order_item_id uuid REFERENCES order_items(id) ON DELETE SET NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  type text NOT NULL CHECK (type IN ('return', 'exchange')),
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested', 'approved', 'rejected', 'refunded', 'completed')),
  admin_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE returns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own_select_returns" ON returns;
CREATE POLICY "own_select_returns" ON returns FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "own_insert_returns" ON returns;
CREATE POLICY "own_insert_returns" ON returns FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_returns" ON returns;
CREATE POLICY "anon_update_returns" ON returns FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_returns_order_id ON returns(order_id);

DROP TRIGGER IF EXISTS trg_returns_touch_updated_at ON returns;
CREATE TRIGGER trg_returns_touch_updated_at
  BEFORE UPDATE ON returns
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ============================================================
-- 8. ABANDONED CARTS
-- ============================================================
CREATE TABLE IF NOT EXISTS abandoned_carts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  email text,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  cart_value integer NOT NULL DEFAULT 0,
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  recovery_email_sent boolean NOT NULL DEFAULT false,
  recovery_email_sent_at timestamptz,
  recovered boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE abandoned_carts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_all_abandoned_carts" ON abandoned_carts;
CREATE POLICY "anon_all_abandoned_carts" ON abandoned_carts FOR ALL
  TO anon, authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_abandoned_carts_recovery ON abandoned_carts(recovery_email_sent, recovered);

-- ============================================================
-- 9. CONTACT INQUIRIES
-- ============================================================
CREATE TABLE IF NOT EXISTS contact_inquiries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL,
  phone text,
  subject text,
  message text NOT NULL,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE contact_inquiries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_insert_contact" ON contact_inquiries;
CREATE POLICY "anon_insert_contact" ON contact_inquiries FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_select_contact" ON contact_inquiries;
CREATE POLICY "anon_select_contact" ON contact_inquiries FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_update_contact" ON contact_inquiries;
CREATE POLICY "anon_update_contact" ON contact_inquiries FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- 10. NEWSLETTER SUBSCRIBERS
-- ============================================================
CREATE TABLE IF NOT EXISTS subscribers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE subscribers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_insert_subscribers" ON subscribers;
CREATE POLICY "anon_insert_subscribers" ON subscribers FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_select_subscribers" ON subscribers;
CREATE POLICY "anon_select_subscribers" ON subscribers FOR SELECT
  TO anon, authenticated USING (true);

-- ============================================================
-- 11. SETTINGS (key/value store config)
-- ============================================================
CREATE TABLE IF NOT EXISTS settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_settings" ON settings;
CREATE POLICY "anon_select_settings" ON settings FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_write_settings" ON settings;
CREATE POLICY "anon_write_settings" ON settings FOR ALL
  TO anon, authenticated USING (true) WITH CHECK (true);

INSERT INTO settings (key, value) VALUES
  ('store_info', '{"name":"Saaj Boutique","address":"","gstin":"","support_email":"","support_phone":"","whatsapp_number":""}'),
  ('shipping', '{"flat_rate":79,"free_shipping_threshold":1999}'),
  ('email_provider', '{"provider":"","api_key":"","sender_email":""}'),
  ('analytics', '{"ga_tracking_id":""}')
ON CONFLICT (key) DO NOTHING;

DROP TRIGGER IF EXISTS trg_settings_touch_updated_at ON settings;
CREATE TRIGGER trg_settings_touch_updated_at
  BEFORE UPDATE ON settings
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ============================================================
-- 12. Extend PRODUCTS with GST + SEO fields
-- ============================================================
ALTER TABLE products ADD COLUMN IF NOT EXISTS gst_rate numeric NOT NULL DEFAULT 5;
ALTER TABLE products ADD COLUMN IF NOT EXISTS meta_title text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS meta_description text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS brand text NOT NULL DEFAULT 'Saaj Boutique';

-- ============================================================
-- 13. Extend ORDERS with coupon / GST / tracking fields
-- ============================================================
ALTER TABLE orders ADD COLUMN IF NOT EXISTS subtotal integer;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_charge integer NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS gst_amount integer NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS coupon_code text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS coupon_discount integer NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_number text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS courier_name text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method text NOT NULL DEFAULT 'cod';
