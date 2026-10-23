-- ---------------------------------------------------------------------
-- Vendor public storefront ("<Vendor Name>'s Collection")
--
-- Reverses the Phase 1 "vendors are never shown on the customer-facing
-- site" decision for approved vendors ONLY, and only for the handful of
-- fields that are safe to expose publicly (business name + a slug for
-- the URL). Every sensitive column on `vendors` (phone, email, PAN,
-- bank details, pending_bank_update, admin_note, ...) stays exactly as
-- locked-down as before -- nothing about the base table's RLS changes.
--
-- Adds:
--   vendors.storefront_slug   -- URL-safe handle, e.g. /store/aruhi-weaves
--   vendors.show_public_rating -- admin-only toggle (Admin > Vendors).
--     When true, the public storefront page and the "<Vendor>'s
--     Collection" widget on product pages show an aggregate
--     rating/review count for the vendor. When false, the same pages
--     still show the vendor's product listing, just without that
--     rating summary block.
--
-- `vendor_public_profiles` is a VIEW, not a relaxed policy on `vendors`
-- itself -- it only ever exposes the columns listed below, and only for
-- approved vendors. This is what public pages/embeds should query.
-- ---------------------------------------------------------------------

ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS storefront_slug text UNIQUE,
  ADD COLUMN IF NOT EXISTS show_public_rating boolean NOT NULL DEFAULT true;

-- Backfill a slug for every vendor that doesn't have one yet, derived
-- from business_name (lowercased, non-alphanumerics -> hyphens), with a
-- short suffix of the vendor id to guarantee uniqueness.
UPDATE vendors
SET storefront_slug = lower(regexp_replace(business_name, '[^a-zA-Z0-9]+', '-', 'g'))
                       || '-' || left(id::text, 6)
WHERE storefront_slug IS NULL;

CREATE INDEX IF NOT EXISTS idx_vendors_storefront_slug ON vendors(storefront_slug);

-- Public, safe-columns-only view. security_invoker so it runs with the
-- caller's own (anon/authenticated) privileges rather than the view
-- owner's -- there's no elevated data here to leak either way, but this
-- keeps it consistent with the rest of the schema's RLS posture.
CREATE OR REPLACE VIEW vendor_public_profiles
WITH (security_invoker = true) AS
SELECT
  id,
  business_name,
  storefront_slug,
  show_public_rating,
  created_at
FROM vendors
WHERE status = 'approved';

GRANT SELECT ON vendor_public_profiles TO anon, authenticated;
