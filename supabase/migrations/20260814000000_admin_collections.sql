-- ---------------------------------------------------------------------
-- Admin-managed collections
--
-- Separate from the auto-generated per-vendor "<Vendor>'s Collection"
-- (see 20260813000000_vendor_public_storefront.sql). These are curated
-- groups of products (e.g. "Diwali Specials", "New Arrivals") that only
-- the admin creates and manages from Admin > Collections, and that get
-- their own public page at /collection/[slug] -- the same URL space the
-- vendor collection pages live in, just a different source table.
--
-- Fully locked down: no RLS policies are added for `anon` or
-- `authenticated` on either table, so only the service-role client can
-- touch them. That's intentional -- every read/write goes through
-- /api/admin/collections/* (gated by requireAdmin()) for management, and
-- through /api/collection/[slug] (also service-role) for the public
-- page, exactly mirroring how vendor collections are locked down.
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS collection_products (
  collection_id uuid NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (collection_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_collection_products_product ON collection_products(product_id);
CREATE INDEX IF NOT EXISTS idx_collection_products_collection ON collection_products(collection_id, position);
CREATE INDEX IF NOT EXISTS idx_collections_slug ON collections(slug);

ALTER TABLE collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE collection_products ENABLE ROW LEVEL SECURITY;
-- No policies -- service-role only (see note above).
