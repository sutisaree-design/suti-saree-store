-- ============================================================
-- Review display settings (storefront Reviews section)
--
-- The storefront reads settings.key = 'review_display_settings' with the
-- public anon key (display preferences only, nothing secret), which the
-- existing "anon_select_settings" policy already allows.
--
-- Writes must only come from the admin API route (service role, which
-- bypasses RLS). The existing anon write policy on `settings` is broad, so
-- add RESTRICTIVE policies (they AND with the existing permissive ones)
-- that stop anon/authenticated clients from inserting, updating or
-- deleting THIS one key. Every other settings key is untouched.
-- ============================================================

DROP POLICY IF EXISTS "review_display_settings_block_insert" ON settings;
CREATE POLICY "review_display_settings_block_insert" ON settings
  AS RESTRICTIVE FOR INSERT TO anon, authenticated
  WITH CHECK (key <> 'review_display_settings');

DROP POLICY IF EXISTS "review_display_settings_block_update" ON settings;
CREATE POLICY "review_display_settings_block_update" ON settings
  AS RESTRICTIVE FOR UPDATE TO anon, authenticated
  USING (key <> 'review_display_settings')
  WITH CHECK (key <> 'review_display_settings');

DROP POLICY IF EXISTS "review_display_settings_block_delete" ON settings;
CREATE POLICY "review_display_settings_block_delete" ON settings
  AS RESTRICTIVE FOR DELETE TO anon, authenticated
  USING (key <> 'review_display_settings');
