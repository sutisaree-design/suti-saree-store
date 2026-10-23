-- ---------------------------------------------------------------------
-- Phase 3C — Admin: Stock Receiving, QC + Tag Removal, Final Pack/Ship.
--
-- Builds on 20260805000000_phase3a_order_fulfillment_safety.sql and
-- 20260806000000_phase3b_vendor_order_dashboard.sql. This is the admin
-- half of the stage machine those two migrations already defined:
--
--   picked_from_vendor --[receive]--> received_at_warehouse
--                                            |
--                                        [QC checklist]
--                                        /            \
--                              (pass, ready to pack)  (fail)
--                              received_at_warehouse   quality_hold
--                                     |
--                                  [pack]
--                                     v
--                                  packed
--                                     |
--                                  [ship]
--                                     v
--                            shipped_to_customer
--
-- No new storage bucket/policy here on purpose: the admin panel has no
-- Supabase Auth session (see lib/admin-auth.ts — a separate signed
-- cookie), so instead of adding a broader anon-insert storage policy
-- (which would let *anyone* with the public anon key write to this
-- bucket), all three admin-side photo uploads (warehouse-receiving,
-- packed) go through a server API route using the SERVICE ROLE client
-- (lib/supabase-admin.ts), which bypasses storage RLS entirely. The
-- existing `order-fulfillment-photos` bucket + policies from Phase 3B
-- are reused as-is.
-- ---------------------------------------------------------------------

-- ============================================================
-- 1. order_items — receiving, QC, packing, shipping columns
-- ============================================================

ALTER TABLE order_items
  -- Receiving (barcode scan + second photo-proof)
  ADD COLUMN IF NOT EXISTS warehouse_received_photo_url text,
  ADD COLUMN IF NOT EXISTS received_at timestamptz,
  -- Quality check + mandatory tag removal
  ADD COLUMN IF NOT EXISTS qc_defect_found boolean,
  ADD COLUMN IF NOT EXISTS qc_color_match boolean,
  ADD COLUMN IF NOT EXISTS qc_fabric_check text,
  ADD COLUMN IF NOT EXISTS qc_tag_removed boolean,
  ADD COLUMN IF NOT EXISTS qc_condition_notes text,
  ADD COLUMN IF NOT EXISTS qc_checked_at timestamptz,
  -- Final pack (third photo-proof)
  ADD COLUMN IF NOT EXISTS packed_photo_url text,
  ADD COLUMN IF NOT EXISTS packed_at timestamptz,
  -- Final courier leg — booked manually outside the app (courier's own
  -- site/app), same "manual for now" pattern as the Phase 3B pickup leg.
  -- These two fields just record what the admin booked, after the fact.
  ADD COLUMN IF NOT EXISTS shipped_courier_name text,
  ADD COLUMN IF NOT EXISTS shipped_tracking_number text,
  ADD COLUMN IF NOT EXISTS shipped_at timestamptz;

ALTER TABLE order_items DROP CONSTRAINT IF EXISTS order_items_qc_fabric_check_check;
ALTER TABLE order_items ADD CONSTRAINT order_items_qc_fabric_check_check
  CHECK (qc_fabric_check IS NULL OR qc_fabric_check IN ('yes', 'no', 'not_checked'));

COMMENT ON COLUMN order_items.qc_tag_removed IS
  'Mandatory at the QC step per the vendor agreement: any vendor woven label/sticker/tag must be removed and replaced with the Aruhi Handlooms tag before an item can be packed. The pack action (app/api/admin/fulfillment/[id]/route.ts) refuses to proceed while this is not true.';
COMMENT ON COLUMN order_items.qc_defect_found IS
  'If true at the receiving/QC step, this is pickup-leg damage (vendor -> warehouse), so liability is set to "vendor" here. Post-warehouse damage is a delivery-leg risk and defaults liability to "own" instead (see the ship action).';

-- ============================================================
-- 2. Extend the fulfillment guard trigger (Phase 3A, extended in 3B)
--    to also protect every column added above. Full CREATE OR REPLACE
--    of the function body — the trigger itself already exists and
--    points at this function by name, no need to recreate it.
-- ============================================================

CREATE OR REPLACE FUNCTION guard_order_item_fulfillment_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN
    IF NEW.stage IS DISTINCT FROM OLD.stage
       OR NEW.vendor_id IS DISTINCT FROM OLD.vendor_id
       OR NEW.variant_unit_id IS DISTINCT FROM OLD.variant_unit_id
       OR NEW.barcode IS DISTINCT FROM OLD.barcode
       OR NEW.liability IS DISTINCT FROM OLD.liability
       OR NEW.vendor_accept_deadline IS DISTINCT FROM OLD.vendor_accept_deadline
       OR NEW.vendor_accepted_at IS DISTINCT FROM OLD.vendor_accepted_at
       OR NEW.pickup_requested_at IS DISTINCT FROM OLD.pickup_requested_at
       OR NEW.pickup_photo_url IS DISTINCT FROM OLD.pickup_photo_url
       OR NEW.warehouse_received_photo_url IS DISTINCT FROM OLD.warehouse_received_photo_url
       OR NEW.received_at IS DISTINCT FROM OLD.received_at
       OR NEW.qc_defect_found IS DISTINCT FROM OLD.qc_defect_found
       OR NEW.qc_color_match IS DISTINCT FROM OLD.qc_color_match
       OR NEW.qc_fabric_check IS DISTINCT FROM OLD.qc_fabric_check
       OR NEW.qc_tag_removed IS DISTINCT FROM OLD.qc_tag_removed
       OR NEW.qc_condition_notes IS DISTINCT FROM OLD.qc_condition_notes
       OR NEW.qc_checked_at IS DISTINCT FROM OLD.qc_checked_at
       OR NEW.packed_photo_url IS DISTINCT FROM OLD.packed_photo_url
       OR NEW.packed_at IS DISTINCT FROM OLD.packed_at
       OR NEW.shipped_courier_name IS DISTINCT FROM OLD.shipped_courier_name
       OR NEW.shipped_tracking_number IS DISTINCT FROM OLD.shipped_tracking_number
       OR NEW.shipped_at IS DISTINCT FROM OLD.shipped_at
    THEN
      RAISE EXCEPTION 'Only admin/vendor-authorized backend routes can change order fulfillment fields';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- ============================================================
-- 3. Helpful index — the admin fulfillment queue's main query is
--    "every vendor-sourced order item, most recently updated first"
--    (app/api/admin/fulfillment/route.ts groups by stage client-side).
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_order_items_vendor_stage_updated
  ON order_items(stage, stage_updated_at DESC)
  WHERE vendor_id IS NOT NULL;

-- NOTE: invoice/packing-slip vendor-masking (Phase 3C point 5) needs no
-- schema change — lib/invoice-pdf.ts already builds its PDF from only
-- product_name/size/quantity/price + the store's own name/GSTIN and has
-- no vendor field to begin with, so there is nothing to strip. Verified
-- while building this migration; see README-PHASE3C.md for the full note.
