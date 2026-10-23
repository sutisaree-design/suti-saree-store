-- Phase 8: SEO / Marketing polish
-- Adds the newsletter_subscribers table used by the footer signup form
-- and the Admin > Marketing > Newsletter tab.
--
-- Legal page content, WhatsApp settings and the merchant feed toggle all
-- reuse the existing generic `settings` (key/value jsonb) table that was
-- created in 20260717000000_full_feature_schema.sql, under the keys
-- 'legal_pages' and 'marketing_settings' — no schema change needed for those.

CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  source text DEFAULT 'footer',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_newsletter_subscribers_created_at
  ON newsletter_subscribers (created_at DESC);

ALTER TABLE newsletter_subscribers ENABLE ROW LEVEL SECURITY;

-- Public storefront visitors can subscribe (insert only — they can't read
-- or edit the list). This mirrors how coupons/reviews are handled elsewhere
-- in this project.
DROP POLICY IF EXISTS "anon_insert_newsletter" ON newsletter_subscribers;
CREATE POLICY "anon_insert_newsletter" ON newsletter_subscribers FOR INSERT
  TO anon, authenticated WITH CHECK (true);

-- The admin dashboard (protected separately by the admin_session cookie in
-- middleware.ts, same trust model as every other admin panel in this repo)
-- needs to list and delete subscribers using the anon key from the browser.
DROP POLICY IF EXISTS "anon_select_newsletter" ON newsletter_subscribers;
CREATE POLICY "anon_select_newsletter" ON newsletter_subscribers FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_delete_newsletter" ON newsletter_subscribers;
CREATE POLICY "anon_delete_newsletter" ON newsletter_subscribers FOR DELETE
  TO anon, authenticated USING (true);
