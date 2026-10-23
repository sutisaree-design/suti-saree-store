-- ============================================================
-- PII LEAK FIX — Part 2, Step 1 (safe to deploy immediately)
--
-- contact_messages: the only readers are app/api/admin/contact-messages
-- and app/api/admin/notifications, both already gated by
-- verifyAdminToken() + getSupabaseAdmin() (service role, bypasses RLS).
-- No browser code reads/writes this table with the anon key. Locking
-- SELECT/UPDATE here changes nothing about how the app behaves.
--
-- subscribers: this table is not referenced anywhere in the app code
-- (only `newsletter_subscribers` is actively used — that one is handled
-- separately in Part 2, Step 3, after its admin-panel caller is moved
-- server-side). Safe to lock immediately.
-- ============================================================

-- ---------- contact_messages ----------
DROP POLICY IF EXISTS "anon_select_contact_messages" ON contact_messages;
DROP POLICY IF EXISTS "anon_update_contact_messages" ON contact_messages;

-- Keep public INSERT — the /api/contact form still needs to accept
-- submissions from anonymous visitors.
-- (anon_insert_contact_messages policy is untouched.)

CREATE POLICY "admin_select_contact_messages" ON contact_messages FOR SELECT
  TO service_role USING (true);

CREATE POLICY "admin_update_contact_messages" ON contact_messages FOR UPDATE
  TO service_role USING (true) WITH CHECK (true);

-- ---------- subscribers (legacy/unused table) ----------
DROP POLICY IF EXISTS "anon_select_subscribers" ON subscribers;

CREATE POLICY "admin_select_subscribers" ON subscribers FOR SELECT
  TO service_role USING (true);
