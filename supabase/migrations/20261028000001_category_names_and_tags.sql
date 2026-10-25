-- Ek product kai categories me ho sakta hai (WooCommerce jaisa).
-- category_name / category_id = PRIMARY category (purana code chalta rahe).
ALTER TABLE products ADD COLUMN IF NOT EXISTS category_names text[] NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS idx_products_category_names ON products USING gin (category_names);

-- Tags: /product-tag/<slug>/
CREATE TABLE IF NOT EXISTS tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS product_tags (
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (product_id, tag_id)
);
CREATE INDEX IF NOT EXISTS idx_product_tags_tag ON product_tags(tag_id);

ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_tags ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public_read_tags" ON tags;
CREATE POLICY "public_read_tags" ON tags FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "public_read_product_tags" ON product_tags;
CREATE POLICY "public_read_product_tags" ON product_tags FOR SELECT TO anon, authenticated USING (true);
