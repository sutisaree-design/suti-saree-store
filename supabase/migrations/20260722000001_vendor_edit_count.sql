-- Add edit count tracking to products table.
-- Incremented by /api/vendor/products/[id] (PATCH) each time a vendor re-submits
-- an existing listing. Shown in Admin > Products > Vendor Submissions panel.
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS vendor_edit_count integer NOT NULL DEFAULT 0;
