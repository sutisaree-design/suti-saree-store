-- ============================================================
-- Lower the default affiliate commission from 10% to 5%.
--
-- Only changes the column DEFAULT, which applies to NEW affiliate
-- rows going forward (app/api/affiliate/route.ts inserts without
-- specifying commission_percent, so it picks up whatever the column
-- default is). Deliberately does NOT touch existing affiliates' rates
-- — an admin may have already customised a specific affiliate's %,
-- and that should not be silently overwritten by this migration.
-- ============================================================

ALTER TABLE affiliates ALTER COLUMN commission_percent SET DEFAULT 5;
