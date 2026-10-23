-- ---------------------------------------------------------------------
-- Phase 3B — Vendor Dashboard: Masked Orders, Accept/Reject, Manual
-- Courier Trigger (schema additions only — UI/API lives in app code).
--
-- Builds on 20260805000000_phase3a_order_fulfillment_safety.sql. Adds:
--   1. order_items.pickup_requested_at — set when the vendor taps
--      "Request Pickup" (surfaces as an admin task/notification; the
--      actual courier booking stays manual per your instructions).
--   2. order_items.pickup_photo_url — the vendor's handoff photo,
--      uploaded when they mark the item picked_from_vendor. First of
--      the three photo-proof steps described in Phase 3B/3C (the other
--      two — warehouse-receiving and final-packed — are admin-side,
--      Phase 3C).
--   3. Both new columns are added to the existing guard trigger from
--      Phase 3A so only the service-role client (i.e. the vendor/admin
--      API routes, never a direct browser write) can set them.
--   4. A public storage bucket for these handoff photos, same simple
--      pattern as the existing `review-images` bucket.
-- ---------------------------------------------------------------------

-- ============================================================
-- 1. order_items — new columns
-- ============================================================

ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS pickup_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS pickup_photo_url text;

COMMENT ON COLUMN order_items.pickup_requested_at IS
  'Set when the vendor taps "Request Pickup" on their dashboard (Phase 3B). Courier booking itself stays manual — this only creates an admin-visible task via the /api/admin/notifications feed.';
COMMENT ON COLUMN order_items.pickup_photo_url IS
  'Vendor-uploaded handoff photo, saved when stage moves vendor_accepted -> picked_from_vendor. First of three photo-proof steps (the other two are admin-side, Phase 3C).';

-- ============================================================
-- 2. Extend the Phase 3A guard trigger to also protect the two new
--    columns above — same reasoning as the rest of this function:
--    order_items has a fully-open anon UPDATE policy inherited from
--    the pre-vendor schema, so without this a vendor could otherwise
--    fake their own pickup-request timestamp or photo directly via the
--    anon key. Full CREATE OR REPLACE of the Phase 3A function body,
--    now including pickup_requested_at / pickup_photo_url.
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
    THEN
      RAISE EXCEPTION 'Only admin/vendor-authorized backend routes can change order fulfillment fields';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
-- Trigger itself (trg_guard_order_item_fulfillment) already exists from
-- Phase 3A and points at this function by name — no need to recreate it.

-- ============================================================
-- 3. Storage bucket for pickup / warehouse / packed handoff photos.
--    Public read (so an admin or vendor can just open the URL), insert
--    restricted to logged-in users — identical pattern to the existing
--    `review-images` bucket (20260726000000_product_video_review_photos.sql).
--    Which vendor may write which specific order-item's photo_url is
--    enforced at the application layer (the API route checks
--    order_items.vendor_id = the caller's own vendor id before saving
--    the uploaded URL), not by a storage policy.
-- ============================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('order-fulfillment-photos', 'order-fulfillment-photos', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "anon_read_order_fulfillment_photos" ON storage.objects;
CREATE POLICY "anon_read_order_fulfillment_photos" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'order-fulfillment-photos');

DROP POLICY IF EXISTS "auth_insert_order_fulfillment_photos" ON storage.objects;
CREATE POLICY "auth_insert_order_fulfillment_photos" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'order-fulfillment-photos');

-- ============================================================
-- 4. Helpful index — the vendor "My Orders" page's main query is
--    "my order_items, most recent first" (app-layer already filters
--    vendor_id via an explicit .eq(), this just speeds it up).
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_order_items_vendor_created
  ON order_items(vendor_id, created_at DESC)
  WHERE vendor_id IS NOT NULL;
