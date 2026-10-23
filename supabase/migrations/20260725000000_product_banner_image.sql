-- Superseded: the per-product banner idea was replaced with a single
-- site-wide banner, which is stored as a row in the existing generic
-- `settings` table (key = 'site_banner') — no new column/table needed
-- for that. This just drops the column if an earlier version of this
-- migration already added it; a no-op otherwise.
ALTER TABLE products
  DROP COLUMN IF EXISTS banner_url;
