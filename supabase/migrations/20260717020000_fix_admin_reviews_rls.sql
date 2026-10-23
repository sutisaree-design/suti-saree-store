/*
  Fix: Admin Review Moderation showed "0 pending / 0 total" even though
  reviews existed in the table.

  Root cause: the SELECT policy on `reviews` only allowed a row to be
  read if it was approved, or if it belonged to the currently
  authenticated user (`auth.uid() = user_id`). The admin dashboard is
  a custom cookie-based login (not Supabase Auth), so it calls Supabase
  with the plain anon key and never satisfies either condition -- every
  pending review was invisible to it.

  Fix: widen the SELECT policy to match the same pattern already used
  for UPDATE/DELETE on this table (`USING (true)`), so any client with
  the anon key can read all rows. The public storefront is unaffected
  because it already filters explicitly with `.eq('is_approved', true)`
  in application code (see lib/reviews-api.ts -> fetchApprovedReviews).
*/

DROP POLICY IF EXISTS "anon_select_approved_reviews" ON reviews;
CREATE POLICY "anon_select_all_reviews" ON reviews FOR SELECT
  TO anon, authenticated USING (true);
