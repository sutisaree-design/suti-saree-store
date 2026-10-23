-- ============================================================
-- SECURITY FIX — blog_posts INSERT/UPDATE/DELETE
-- `anon_insert_blog_posts` / `anon_update_blog_posts` /
-- `anon_delete_blog_posts` (20260820000000_blog_posts.sql) let ANY
-- anon/authenticated caller create, rewrite, or delete ANY blog post
-- directly with the public anon key — a website-defacement risk (anyone
-- could replace or wipe every post on /blog).
--
-- All admin-panel writes to this table have been moved to new server-side
-- routes (app/api/admin/blog-posts, app/api/admin/blog-posts/[id]) using
-- the service-role client + the existing admin session cookie check — see
-- lib/blog-api.ts. Nothing else in the app writes to this table with the
-- anon key, so dropping these policies changes no working behaviour, only
-- closes the hole.
--
-- SELECT stays open to anon/authenticated: public /blog pages read
-- published posts directly with the anon key.
-- ============================================================

DROP POLICY IF EXISTS "anon_insert_blog_posts" ON blog_posts;
DROP POLICY IF EXISTS "anon_update_blog_posts" ON blog_posts;
DROP POLICY IF EXISTS "anon_delete_blog_posts" ON blog_posts;

CREATE POLICY "admin_write_blog_posts" ON blog_posts FOR ALL
  TO service_role USING (true) WITH CHECK (true);

-- ------------------------------------------------------------
-- NOTE (not fixed by this migration, flagging for awareness):
-- `anon_select_blog_posts` has no `published = true` filter, so an
-- unpublished draft post is technically readable by anyone with the anon
-- key today (app code filters this correctly for the public /blog pages,
-- but the DB itself doesn't enforce it). Low severity — no PII/financial
-- impact, just an early look at an unreleased draft — but worth tightening
-- in a follow-up (e.g. `USING (published = true OR auth.role() =
-- 'service_role')`) if you want it closed.
-- ------------------------------------------------------------
