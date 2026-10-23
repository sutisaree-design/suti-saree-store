-- ---------------------------------------------------------------------
-- Clean up vendor storefront slugs.
--
-- The original vendor_public_storefront migration backfilled every
-- vendor's `storefront_slug` as `<slugified-name>-<6-char-id>`,
-- unconditionally -- even when nothing else was using the plain name.
-- That's harmless for correctness (any unique slug works) but worse for
-- SEO/readability than it needs to be, and app/api/admin/vendors PUT now
-- assigns clean, name-derived slugs (only suffixed on an actual clash)
-- to every vendor approved from here on. This migration brings existing
-- vendors in line with that same rule, one-time.
--
-- Only rewrites a slug when:
--   1. It still looks like the auto-generated `<name>-<6 hex chars>`
--      pattern (so a vendor who intentionally customised their own slug
--      afterwards is left untouched), AND
--   2. The plain name-derived slug isn't already taken by another vendor
--      or an admin-curated collection (both share the /collection/[slug]
--      URL space).
--
-- NOTE: this changes the public URL for any vendor it touches. If a
-- vendor's storefront link has already been shared/indexed externally,
-- that old link will 404 after this runs -- there's no redirect layer
-- for /collection/[slug] today. Skip this migration (or add a redirect)
-- if that matters for your launch.
-- ---------------------------------------------------------------------

DO $$
DECLARE
  v RECORD;
  clean_slug text;
BEGIN
  FOR v IN
    SELECT id, business_name, storefront_slug
    FROM vendors
    WHERE storefront_slug IS NOT NULL
  LOOP
    clean_slug := lower(regexp_replace(v.business_name, '[^a-zA-Z0-9]+', '-', 'g'));
    clean_slug := trim(both '-' from clean_slug);

    CONTINUE WHEN clean_slug = '';
    -- Only touch slugs that still match the old auto-generated pattern.
    CONTINUE WHEN v.storefront_slug !~ ('^' || clean_slug || '-[0-9a-f]{6}$');
    -- Already clean (shouldn't happen given the check above, but safe).
    CONTINUE WHEN v.storefront_slug = clean_slug;
    -- Leave it if the clean slug is taken by someone else.
    CONTINUE WHEN EXISTS (
      SELECT 1 FROM vendors WHERE storefront_slug = clean_slug AND id <> v.id
    );
    CONTINUE WHEN EXISTS (
      SELECT 1 FROM collections WHERE slug = clean_slug
    );

    UPDATE vendors SET storefront_slug = clean_slug WHERE id = v.id;
  END LOOP;
END $$;
