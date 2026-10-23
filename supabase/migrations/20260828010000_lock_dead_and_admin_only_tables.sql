-- ============================================================
-- SECURITY FIX — Category A: safe to deploy immediately, zero code
-- changes required. Every table/policy below was checked against the
-- actual app code (not just assumed): nothing legitimate reads or writes
-- these with the anon key, so closing them changes no working behaviour.
-- ============================================================

-- ---------- contact_inquiries (dead table) ----------
-- No file in app/, lib/, or components/ references `contact_inquiries`
-- anywhere. It predates the newer `contact_messages` table (which handles
-- the live /api/contact form) and is simply unused. Currently
-- anon_select_contact / anon_update_contact (USING (true)) let anyone read
-- or edit every legacy inquiry (name/email/message) with the anon key.
DROP POLICY IF EXISTS "anon_select_contact" ON contact_inquiries;
DROP POLICY IF EXISTS "anon_update_contact" ON contact_inquiries;

CREATE POLICY "admin_select_contact_inquiries" ON contact_inquiries FOR SELECT
  TO service_role USING (true);

CREATE POLICY "admin_update_contact_inquiries" ON contact_inquiries FOR UPDATE
  TO service_role USING (true) WITH CHECK (true);

-- (anon_insert_contact is left untouched in case anything still points a
-- legacy form at this table — inserts are low-risk either way.)

-- ---------- activity_events (SELECT only) ----------
-- lib/track-api.ts inserts with the anon key from every visitor's browser
-- (anonymous behaviour tracking) — that INSERT policy stays, it's meant to
-- be public. But `anon_select_activity_events` (USING (true)) also let
-- anyone read every tracked event for every visitor. The only real readers
-- are app/api/admin/analytics and app/api/admin/customers, both already on
-- getSupabaseAdmin() (service role, bypasses RLS) — no browser code reads
-- this table, so SELECT can be locked with no behaviour change.
DROP POLICY IF EXISTS "anon_select_activity_events" ON activity_events;

CREATE POLICY "admin_select_activity_events" ON activity_events FOR SELECT
  TO service_role USING (true);

-- ---------- returns (UPDATE only) ----------
-- `anon_update_returns` (USING (true)) let ANY anon/authenticated caller
-- change the status of ANY return request — including marking their own
-- return "approved"/"refunded" (fraud risk). The only place returns are
-- updated is app/api/admin/returns/[id]/route.ts, already on
-- getSupabaseAdmin() (service role). Customer-facing reads/inserts
-- (own_select_returns / own_insert_returns, already scoped to the
-- requesting user) are untouched.
DROP POLICY IF EXISTS "anon_update_returns" ON returns;

CREATE POLICY "admin_update_returns" ON returns FOR UPDATE
  TO service_role USING (true) WITH CHECK (true);

-- ---------- email_automation_log (SELECT + WRITE) ----------
-- `anon_select_email_automation_log` / `anon_write_email_automation_log`
-- (USING (true)) let anyone read or forge entries in the welcome/win-back
-- email send-log with the anon key — including inserting a fake "already
-- emailed" row to suppress a real automated email to a customer, or
-- reading who has/hasn't received which lifecycle email. The only code
-- that touches this table is lib/cron-jobs.ts, already on
-- getSupabaseAdmin() (service role). No browser code reads or writes it,
-- so this can be locked to service_role entirely.
DROP POLICY IF EXISTS "anon_select_email_automation_log" ON email_automation_log;
DROP POLICY IF EXISTS "anon_write_email_automation_log" ON email_automation_log;

CREATE POLICY "admin_all_email_automation_log" ON email_automation_log FOR ALL
  TO service_role USING (true) WITH CHECK (true);
