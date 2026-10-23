/*
# Boutique — initial schema (single-tenant, no auth)

## Overview
Creates the data model for an Indian ethnic wear e-commerce storefront.
The app has no sign-in screen, so all policies use `TO anon, authenticated`
and the anon-key frontend can read/write all catalog and order data.
Admin CRUD also runs through the anon key — acceptable for a frontend-only
demo without authentication. When you later add admin auth, tighten the
write policies to `authenticated` with an ownership/role check.

## New Tables

### categories
- `id` (uuid, primary key)
- `name` (text, not null) — display name e.g. "Silk Sarees"
- `slug` (text, unique, not null) — URL-safe key
- `description` (text, optional)
- `created_at` (timestamptz, default now)

### products
- `id` (uuid, primary key)
- `name` (text, not null)
- `slug` (text, unique, not null) — URL-safe
- `description` (text, optional)
- `price` (integer, not null) — in paise-free INR (whole rupees)
- `mrp` (integer, optional) — original price for discount display
- `category_id` (uuid, FK -> categories.id, nullable)
- `category_name` (text, nullable) — denormalized for convenience
- `fabric` (text, optional)
- `origin` (text, optional)
- `colors` (text[], default '{}') — e.g. {"Maroon","Gold"}
- `sizes` (text[], default '{Free Size}')
- `images` (text[], default '{}') — Storage public URLs
- `stock_quantity` (integer, not null, default 0)
- `rating` (numeric(2,1), default 4.5)
- `reviews` (integer, default 0)
- `featured` (boolean, default false)
- `in_stock` (boolean, default true) — derived from stock_quantity > 0 but stored for convenience
- `created_at` (timestamptz, default now())
- `updated_at` (timestamptz, default now())

### orders
- `id` (uuid, primary key)
- `user_id` (uuid, nullable — no auth yet, so nullable; will be populated when auth is added)
- `items` (jsonb, not null) — snapshot of cart items at purchase time
- `total_amount` (integer, not null) — INR whole rupees
- `status` (text, default 'pending') — pending, confirmed, shipped, delivered, cancelled
- `shipping_address` (jsonb, optional) — full address snapshot
- `customer_name` (text, optional)
- `customer_email` (text, optional)
- `customer_phone` (text, optional)
- `created_at` (timestamptz, default now)

### order_items
- `id` (uuid, primary key)
- `order_id` (uuid, FK -> orders.id ON DELETE CASCADE)
- `product_id` (uuid, FK -> products.id ON DELETE SET NULL)
- `product_name` (text, not null) — snapshot at purchase time
- `size` (text, optional)
- `quantity` (integer, not null, check quantity > 0)
- `price` (integer, not null) — unit price snapshot in INR
- `created_at` (timestamptz, default now())

## Indexes
- products.slug (unique)
- products.category_id
- products.featured
- products.category_name
- categories.slug (unique)
- orders.created_at
- order_items.order_id
- order_items.product_id

## Security
- RLS enabled on every table.
- All policies use `TO anon, authenticated` (single-tenant, no auth screen).
- SELECT, INSERT, UPDATE, DELETE split into 4 separate policies per table.
- `USING (true)` is acceptable here because the catalog and orders are
  intentionally public/shared for this demo (no user accounts).

## Storage
- Creates a public bucket `product-images` for admin uploads.
- Public read allowed; writes allowed for anon + authenticated (demo).
  Tighten to authenticated once admin auth is added.

## Important Notes
1. The app has NO sign-in screen, so `anon` MUST be listed on every policy
   or the anon-key frontend will see an empty table.
2. `in_stock` is stored as a boolean for quick filtering; keep it in sync
   with `stock_quantity` from the admin panel.
3. Orders store a JSONB `items` snapshot so historical orders remain intact
   even if a product is later edited or deleted.
4. `order_items.product_id` is ON DELETE SET NULL (not CASCADE) so deleting
   a product does not erase order history.
*/

-- ---------- categories ----------
CREATE TABLE IF NOT EXISTS categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_categories" ON categories;
CREATE POLICY "anon_select_categories" ON categories FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_categories" ON categories;
CREATE POLICY "anon_insert_categories" ON categories FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_categories" ON categories;
CREATE POLICY "anon_update_categories" ON categories FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_categories" ON categories;
CREATE POLICY "anon_delete_categories" ON categories FOR DELETE
  TO anon, authenticated USING (true);

-- ---------- products ----------
CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  description text,
  price integer NOT NULL CHECK (price >= 0),
  mrp integer CHECK (mrp IS NULL OR mrp >= 0),
  category_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  category_name text,
  fabric text,
  origin text,
  colors text[] NOT NULL DEFAULT '{}',
  sizes text[] NOT NULL DEFAULT '{Free Size}',
  images text[] NOT NULL DEFAULT '{}',
  stock_quantity integer NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
  rating numeric(2,1) NOT NULL DEFAULT 4.5,
  reviews integer NOT NULL DEFAULT 0,
  featured boolean NOT NULL DEFAULT false,
  in_stock boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_products" ON products;
CREATE POLICY "anon_select_products" ON products FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_products" ON products;
CREATE POLICY "anon_insert_products" ON products FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_products" ON products;
CREATE POLICY "anon_update_products" ON products FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_products" ON products;
CREATE POLICY "anon_delete_products" ON products FOR DELETE
  TO anon, authenticated USING (true);

-- ---------- orders ----------
CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  total_amount integer NOT NULL CHECK (total_amount >= 0),
  status text NOT NULL DEFAULT 'pending',
  shipping_address jsonb,
  customer_name text,
  customer_email text,
  customer_phone text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_orders" ON orders;
CREATE POLICY "anon_select_orders" ON orders FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_orders" ON orders;
CREATE POLICY "anon_insert_orders" ON orders FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_orders" ON orders;
CREATE POLICY "anon_update_orders" ON orders FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_orders" ON orders;
CREATE POLICY "anon_delete_orders" ON orders FOR DELETE
  TO anon, authenticated USING (true);

-- ---------- order_items ----------
CREATE TABLE IF NOT EXISTS order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  product_name text NOT NULL,
  size text,
  quantity integer NOT NULL CHECK (quantity > 0),
  price integer NOT NULL CHECK (price >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_order_items" ON order_items;
CREATE POLICY "anon_select_order_items" ON order_items FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_order_items" ON order_items;
CREATE POLICY "anon_insert_order_items" ON order_items FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_order_items" ON order_items;
CREATE POLICY "anon_update_order_items" ON order_items FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_order_items" ON order_items;
CREATE POLICY "anon_delete_order_items" ON order_items FOR DELETE
  TO anon, authenticated USING (true);

-- ---------- indexes ----------
CREATE INDEX IF NOT EXISTS idx_products_category_id ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_category_name ON products(category_name);
CREATE INDEX IF NOT EXISTS idx_products_featured ON products(featured);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON order_items(product_id);

-- ---------- updated_at trigger for products ----------
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_products_touch_updated_at ON products;
CREATE TRIGGER trg_products_touch_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ---------- Storage bucket for product images ----------
INSERT INTO storage.buckets (id, name, public)
VALUES ('product-images', 'product-images', true)
ON CONFLICT (id) DO NOTHING;

-- Public read for product-images bucket
DROP POLICY IF EXISTS "anon_read_product_images" ON storage.objects;
CREATE POLICY "anon_read_product_images" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'product-images');

-- Allow anon + authenticated to upload (demo without admin auth).
-- Tighten to `TO authenticated` once admin auth is introduced.
DROP POLICY IF EXISTS "anon_insert_product_images" ON storage.objects;
CREATE POLICY "anon_insert_product_images" ON storage.objects
  FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id = 'product-images');

DROP POLICY IF EXISTS "anon_update_product_images" ON storage.objects;
CREATE POLICY "anon_update_product_images" ON storage.objects
  FOR UPDATE TO anon, authenticated
  USING (bucket_id = 'product-images') WITH CHECK (bucket_id = 'product-images');

DROP POLICY IF EXISTS "anon_delete_product_images" ON storage.objects;
CREATE POLICY "anon_delete_product_images" ON storage.objects
  FOR DELETE TO anon, authenticated
  USING (bucket_id = 'product-images');
