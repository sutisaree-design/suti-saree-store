-- ============================================================
-- CREDENTIAL LEAK FIX — Part 3
-- APPLY THIS ONLY AFTER the Part 3 code changes are deployed:
--   - components/admin/settings-panel.tsx now calls
--     /api/admin/settings/email instead of reading/writing
--     `settings` directly with the anon key.
--   - components/admin/marketing-panel.tsx now calls
--     /api/admin/settings/social-publish instead of reading/writing
--     `settings` directly with the anon key.
--   - lib/social-publish-api.ts already used the service role, no
--     change needed there.
--
-- Every other `settings` key (store_info, shipping, site_banner,
-- ai_chat, social_links, seo_settings, marketing_settings,
-- analytics_settings, fulfillment_settings, legal_pages,
-- vendor_settlement_settings) is read directly by storefront pages
-- with the anon key and must stay publicly readable — this migration
-- does NOT touch those, it only closes off the two keys that hold
-- live secrets.
-- ============================================================

DROP POLICY IF EXISTS "anon_select_settings" ON settings;
DROP POLICY IF EXISTS "anon_write_settings" ON settings;

-- Public/anon can read and write every settings key EXCEPT the two
-- that hold live credentials.
CREATE POLICY "anon_select_settings" ON settings FOR SELECT
  TO anon, authenticated
  USING (key NOT IN ('email_provider', 'social_publish'));

CREATE POLICY "anon_write_settings" ON settings FOR ALL
  TO anon, authenticated
  USING (key NOT IN ('email_provider', 'social_publish'))
  WITH CHECK (key NOT IN ('email_provider', 'social_publish'));

-- The service role (used by the new admin routes and by
-- lib/social-publish-api.ts) can always read/write every key,
-- including the two secret ones.
CREATE POLICY "admin_all_settings" ON settings FOR ALL
  TO service_role USING (true) WITH CHECK (true);

-- ------------------------------------------------------------
-- NOTE (not fixed by this migration, flagging for awareness):
-- every OTHER settings key is still writable by anon, not just
-- readable — e.g. `store_info`, `shipping`, `site_banner` could
-- currently be overwritten by anyone with the public anon key
-- (defacement risk, not a secret leak). If you want that closed
-- too, say so and it can be handled as a separate, smaller step —
-- it typically means moving each admin "save" call in
-- settings-panel.tsx / marketing-panel.tsx behind an admin-token
-- route the same way this migration did for email/social.
-- ------------------------------------------------------------
