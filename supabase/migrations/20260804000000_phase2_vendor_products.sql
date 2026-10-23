-- ---------------------------------------------------------------------
-- Phase 2 — Vendor Product Listing
--
-- IMPORTANT NAMING NOTE: this codebase already has a `product_variants`
-- table (from 20260717000000_full_feature_schema.sql) used for
-- customer-facing COLOUR pages with their own SEO slug. That table is
-- unrelated to vendor stock/barcode tracking and is NOT touched here.
-- The new per-unit stock/barcode table introduced below is called
-- `product_variant_units` to avoid any confusion or collision with it.
-- ---------------------------------------------------------------------

-- ============================================================
-- 1. New columns on `products` for vendor sourcing
-- ============================================================

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS vendor_id uuid REFERENCES vendors(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approval_status text,
  ADD COLUMN IF NOT EXISTS barcode text,
  ADD COLUMN IF NOT EXISTS vendor_expected_price numeric(10, 2),
  ADD COLUMN IF NOT EXISTS ai_suggested_price numeric(10, 2),
  ADD COLUMN IF NOT EXISTS final_price numeric(10, 2),
  ADD COLUMN IF NOT EXISTS available_quantity integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS quantity_last_updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS rejection_reason text,
  ADD COLUMN IF NOT EXISTS is_dead_stock boolean NOT NULL DEFAULT false;

-- approval_status: every existing row (admin-added catalog, pre-Phase-2)
-- is backfilled to 'live' so nothing currently on the site disappears.
-- New vendor submissions start at 'pending_review' (Part 2 sets this).
UPDATE products SET approval_status = 'live' WHERE approval_status IS NULL;

ALTER TABLE products ALTER COLUMN approval_status SET NOT NULL;
ALTER TABLE products ALTER COLUMN approval_status SET DEFAULT 'live';

ALTER TABLE products DROP CONSTRAINT IF EXISTS products_approval_status_check;
ALTER TABLE products ADD CONSTRAINT products_approval_status_check
  CHECK (approval_status IN ('draft', 'pending_review', 'awaiting_stock', 'live', 'rejected'));

ALTER TABLE products DROP CONSTRAINT IF EXISTS products_available_quantity_check;
ALTER TABLE products ADD CONSTRAINT products_available_quantity_check
  CHECK (available_quantity >= 0);

-- final_price: backfill from the existing `price` column so every
-- current row has a sane value, then make it required going forward.
UPDATE products SET final_price = price WHERE final_price IS NULL;
ALTER TABLE products ALTER COLUMN final_price SET NOT NULL;

-- barcode is only ever populated for vendor-sourced products (internal
-- use only — never selected in customer-facing queries, see the
-- accompanying products-api.ts / products-api-server.ts change).
CREATE UNIQUE INDEX IF NOT EXISTS products_barcode_unique_idx
  ON products (barcode) WHERE barcode IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_products_vendor_id ON products(vendor_id);
CREATE INDEX IF NOT EXISTS idx_products_approval_status ON products(approval_status);

COMMENT ON COLUMN products.vendor_id IS
  'Internal sourcing only. NEVER select this column in customer-facing frontend queries or API responses — admin panel / order-processing backend only.';

-- ============================================================
-- 2. product_variant_units — per-variant stock + barcode
--    (color/size combinations of a vendor product). Deliberately a
--    NEW table, distinct from the existing `product_variants`
--    (customer-facing colour SEO pages) — see note at top of file.
-- ============================================================

CREATE TABLE IF NOT EXISTS product_variant_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,

  -- e.g. "Color: Red" or "Size: M" or "Color: Red / Size: M"
  variant_label text NOT NULL,

  barcode text NOT NULL,
  available_quantity integer NOT NULL DEFAULT 0 CHECK (available_quantity >= 0),
  quantity_last_updated_at timestamptz NOT NULL DEFAULT now(),

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (barcode)
);

CREATE INDEX IF NOT EXISTS idx_variant_units_product_id ON product_variant_units(product_id);

COMMENT ON TABLE product_variant_units IS
  'Vendor stock-keeping units. Order/barcode/QC must be tracked HERE at variant level, not on products.available_quantity, whenever a product has more than one colour/size.';

-- ============================================================
-- 3. Barcode auto-generation
--    Format: AH-V{first 6 hex chars of vendor id}-{4-digit sequence}
--    e.g. "AH-V3F9A21-0007". Sequence is per-vendor, tracked in a
--    small counter table so it survives concurrent inserts safely.
-- ============================================================

CREATE TABLE IF NOT EXISTS vendor_barcode_counters (
  vendor_id uuid PRIMARY KEY REFERENCES vendors(id) ON DELETE CASCADE,
  next_seq integer NOT NULL DEFAULT 1
);

ALTER TABLE vendor_barcode_counters ENABLE ROW LEVEL SECURITY;
-- No policies granted on purpose: only reachable via the SECURITY
-- DEFINER function below, or the service-role admin client.

-- generate_vendor_barcode: the ONLY supported way to mint a new
-- product-level barcode for a vendor. Re-checks that the caller is
-- that vendor (mirrors the pattern used by request_vendor_bank_update
-- in the Phase 1 migration) so one vendor's session can't be used to
-- burn through another vendor's sequence numbers.
CREATE OR REPLACE FUNCTION generate_vendor_barcode(p_vendor_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_seq integer;
  v_short text;
BEGIN
  IF auth.role() <> 'service_role' THEN
    IF NOT EXISTS (
      SELECT 1 FROM vendors WHERE id = p_vendor_id AND user_id = auth.uid()
    ) THEN
      RAISE EXCEPTION 'Not authorized to generate a barcode for this vendor';
    END IF;
  END IF;

  INSERT INTO vendor_barcode_counters (vendor_id) VALUES (p_vendor_id)
    ON CONFLICT (vendor_id) DO NOTHING;

  UPDATE vendor_barcode_counters
  SET next_seq = next_seq + 1
  WHERE vendor_id = p_vendor_id
  RETURNING next_seq - 1 INTO v_seq;

  v_short := upper(left(replace(p_vendor_id::text, '-', ''), 6));

  RETURN 'AH-V' || v_short || '-' || lpad(v_seq::text, 4, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION generate_vendor_barcode(uuid) TO authenticated;

-- Auto-fill products.barcode on insert if the vendor didn't supply one
-- (the add-product form in Part 2 won't — this is the source of truth).
CREATE OR REPLACE FUNCTION set_product_barcode()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.barcode IS NULL AND NEW.vendor_id IS NOT NULL THEN
    NEW.barcode := generate_vendor_barcode(NEW.vendor_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_products_set_barcode ON products;
CREATE TRIGGER trg_products_set_barcode
  BEFORE INSERT ON products
  FOR EACH ROW EXECUTE FUNCTION set_product_barcode();

-- Auto-fill product_variant_units.barcode as "{parent barcode}-V{n}"
-- if not supplied.
CREATE OR REPLACE FUNCTION set_variant_unit_barcode()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_base text;
  v_count integer;
BEGIN
  IF NEW.barcode IS NULL THEN
    SELECT barcode INTO v_base FROM products WHERE id = NEW.product_id;
    SELECT count(*) INTO v_count FROM product_variant_units WHERE product_id = NEW.product_id;
    NEW.barcode := coalesce(v_base, 'AH-V0000-0000') || '-V' || (v_count + 1);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_variant_units_set_barcode ON product_variant_units;
CREATE TRIGGER trg_variant_units_set_barcode
  BEFORE INSERT ON product_variant_units
  FOR EACH ROW EXECUTE FUNCTION set_variant_unit_barcode();

-- ============================================================
-- 4. quantity_last_updated_at — auto-touch whenever quantity changes
--    (Phase 4 stale-inventory alerts will read this later).
-- ============================================================

CREATE OR REPLACE FUNCTION touch_quantity_timestamp()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.available_quantity IS DISTINCT FROM OLD.available_quantity THEN
    NEW.quantity_last_updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_products_touch_quantity ON products;
CREATE TRIGGER trg_products_touch_quantity
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION touch_quantity_timestamp();

DROP TRIGGER IF EXISTS trg_variant_units_touch_quantity ON product_variant_units;
CREATE TRIGGER trg_variant_units_touch_quantity
  BEFORE UPDATE ON product_variant_units
  FOR EACH ROW EXECUTE FUNCTION touch_quantity_timestamp();

DROP TRIGGER IF EXISTS trg_variant_units_touch_updated_at ON product_variant_units;
CREATE TRIGGER trg_variant_units_touch_updated_at
  BEFORE UPDATE ON product_variant_units
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ============================================================
-- 5. Guardrail — only the admin (service role) may change the fields
--    that decide what goes live and at what price. Vendors submit via
--    RLS-authenticated sessions (never service role), so this blocks
--    a vendor from ever setting their own approval_status/final_price/
--    ai_suggested_price/vendor_id/barcode directly, even if they call
--    the Supabase table API directly instead of going through our app.
-- ============================================================

CREATE OR REPLACE FUNCTION guard_vendor_product_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN
    IF NEW.approval_status IS DISTINCT FROM OLD.approval_status
       OR NEW.final_price IS DISTINCT FROM OLD.final_price
       OR NEW.ai_suggested_price IS DISTINCT FROM OLD.ai_suggested_price
       OR NEW.vendor_id IS DISTINCT FROM OLD.vendor_id
       OR NEW.barcode IS DISTINCT FROM OLD.barcode
    THEN
      RAISE EXCEPTION 'Only admin can change approval_status, final_price, ai_suggested_price, vendor_id or barcode';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_vendor_product_fields ON products;
CREATE TRIGGER trg_guard_vendor_product_fields
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION guard_vendor_product_fields();

-- NOTE: this trigger means Part 5 (admin "Vendor Submissions" approve/
-- reject/final_price edit) MUST be built as a server route using
-- getSupabaseAdmin() (service role), same pattern as every other
-- /api/admin/* route in this repo — NOT the existing client-side
-- updateProduct() in lib/products-api.ts, which runs with the
-- browser's authenticated/anon key and would now be rejected by this
-- trigger for these specific columns. This will be called out again
-- in Part 5.

-- ============================================================
-- 6. RLS for product_variant_units
--    Vendors may only ever touch variant rows that hang off one of
--    their OWN products. Admin/order-processing use the service role
--    (bypasses RLS) exactly like every other admin table in this repo.
-- ============================================================

ALTER TABLE product_variant_units ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own_select_variant_units" ON product_variant_units;
CREATE POLICY "own_select_variant_units" ON product_variant_units FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM products p
      JOIN vendors v ON v.id = p.vendor_id
      WHERE p.id = product_variant_units.product_id
        AND v.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "own_insert_variant_units" ON product_variant_units;
CREATE POLICY "own_insert_variant_units" ON product_variant_units FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM products p
      JOIN vendors v ON v.id = p.vendor_id
      WHERE p.id = product_variant_units.product_id
        AND v.user_id = auth.uid()
        AND p.approval_status IN ('draft', 'pending_review')
    )
  );

DROP POLICY IF EXISTS "own_update_variant_units" ON product_variant_units;
CREATE POLICY "own_update_variant_units" ON product_variant_units FOR UPDATE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM products p
      JOIN vendors v ON v.id = p.vendor_id
      WHERE p.id = product_variant_units.product_id
        AND v.user_id = auth.uid()
    )
  );

-- Intentionally no DELETE policy for `authenticated` — a vendor
-- removing a variant entirely (not just zeroing its quantity) should
-- go through an admin-reviewed path later, not a raw table delete.

-- ============================================================
-- 7. RLS for products — vendor insert/select of their OWN rows
--
--    IMPORTANT — KNOWN GAP, left as-is intentionally in this
--    migration, flagged for a dedicated follow-up:
--    The pre-existing policy "anon_select_products ... USING (true)"
--    (from the original schema, by design — see its own comment:
--    "no auth, anon-key frontend can read/write all catalog data")
--    already grants EVERYONE (including anon) SELECT on every row and
--    every column of `products`. Postgres RLS policies are additive
--    (OR'd), so adding a narrower vendor-only SELECT policy below does
--    NOT restrict that pre-existing open policy — it only adds an
--    extra way in. Right now, this means:
--      - a vendor's draft/pending_review/awaiting_stock rows are, in
--        principle, readable by anyone hitting the Supabase REST API
--        directly (not through our app's UI) with the anon key,
--      - and so is the new `vendor_id` / `barcode` / pricing data on
--        every row, if someone queries those columns explicitly.
--    Our own customer-facing app code never does this (see the
--    accompanying products-api.ts / products-api-server.ts change,
--    which now selects an explicit safe column list and can be scoped
--    to approval_status = 'live'). Properly closing this at the
--    database level requires reworking the original open `products`
--    policies (used by the whole existing admin panel + shop), which
--    touches functionality well outside vendor listings — recommend
--    doing that as its own reviewed change, not silently inside this
--    migration.
-- ============================================================

DROP POLICY IF EXISTS "own_select_vendor_products" ON products;
CREATE POLICY "own_select_vendor_products" ON products FOR SELECT
  TO authenticated USING (
    vendor_id IN (SELECT id FROM vendors WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "own_insert_vendor_products" ON products;
CREATE POLICY "own_insert_vendor_products" ON products FOR INSERT
  TO authenticated WITH CHECK (
    vendor_id IN (SELECT id FROM vendors WHERE user_id = auth.uid())
    AND approval_status IN ('draft', 'pending_review')
  );

DROP POLICY IF EXISTS "own_update_vendor_products" ON products;
CREATE POLICY "own_update_vendor_products" ON products FOR UPDATE
  TO authenticated USING (
    vendor_id IN (SELECT id FROM vendors WHERE user_id = auth.uid())
  );
-- (trg_guard_vendor_product_fields above still applies on top of this
-- and blocks the privileged columns regardless of this USING clause.)
