-- ============================================================
-- SECURITY FIX — reviews UPDATE/DELETE
-- `anon_admin_update_reviews` / `anon_admin_delete_reviews` (from
-- 20260717000000_full_feature_schema.sql) were FOR UPDATE / FOR DELETE,
-- USING (true) [WITH CHECK (true)] — meaning ANY anon/authenticated caller
-- could approve, hide, or permanently delete ANY OTHER customer's review
-- directly with the public anon key (fake-approve their own low-quality
-- review, hide a competitor's product's good reviews, or delete reviews
-- outright).
--
-- Two legitimate features actually rely on being able to UPDATE a review
-- row without going through the admin panel:
--   1. Auto-publish — 5s after a customer submits their own review, the
--      browser flips is_approved to true itself (scheduleAutoPublish /
--      approveReview in lib/reviews-api.ts).
--   2. Self-edit — a customer editing their own review's title/comment
--      (updateMyReview in lib/reviews-api.ts).
-- Both of these only ever touch a row where reviews.user_id = the caller's
-- own auth.uid(), so a "own row only" policy covers them with no code
-- change needed for either flow.
--
-- Admin moderation (approve/reject/delete ANY review from the moderation
-- panel) has been moved server-side to app/api/admin/reviews/route.ts,
-- gated by the existing admin-session cookie check, using the service
-- role — see lib/reviews-api.ts (approveReviewAdmin / rejectReviewAdmin /
-- deleteReviewAdmin).
-- ============================================================

DROP POLICY IF EXISTS "anon_admin_update_reviews" ON reviews;
DROP POLICY IF EXISTS "anon_admin_delete_reviews" ON reviews;

CREATE POLICY "customers_update_own_review" ON reviews FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "admin_update_reviews" ON reviews FOR UPDATE
  TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "admin_delete_reviews" ON reviews FOR DELETE
  TO service_role USING (true);

-- ------------------------------------------------------------
-- NOTE (not fixed by this migration, flagging for awareness):
-- `anon_select_all_reviews` (20260717020000_fix_admin_reviews_rls.sql)
-- lets anon/authenticated read EVERY review including unapproved/pending
-- ones (author name + rating + comment), not just is_approved = true. That
-- was flagged for the admin moderation panel's own read needs, but it also
-- means an unapproved review is technically fetchable by anyone before an
-- admin ever sees it. Low severity (no financial/PII-beyond-name impact)
-- but worth tightening in a follow-up if you want it closed.
-- ------------------------------------------------------------
