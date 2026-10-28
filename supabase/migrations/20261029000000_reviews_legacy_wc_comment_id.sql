-- Old WooCommerce site ke reviews import karne ke liye.
-- legacy_wc_comment_id = purane wp_comments.comment_ID. Isse dobara import
-- chalane par duplicate review nahi banta (scripts/import-legacy-reviews.mjs).
-- Plain (non-partial) unique index: NULL kai baar allowed hai, isliye normal
-- reviews par koi asar nahi.

ALTER TABLE reviews ADD COLUMN IF NOT EXISTS legacy_wc_comment_id bigint;

CREATE UNIQUE INDEX IF NOT EXISTS reviews_legacy_wc_comment_id_uidx
  ON reviews (legacy_wc_comment_id);
