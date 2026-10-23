-- Social auto-publish (Facebook Page + Instagram) tracking columns.
-- social_posted_at / social_post_ids let us avoid re-posting the same
-- product twice (e.g. if the vendor edits it after it already went live).
alter table products
  add column if not exists social_posted_at timestamptz,
  add column if not exists social_post_ids jsonb default '{}'::jsonb;

comment on column products.social_posted_at is
  'When this product was last auto-posted to Facebook/Instagram. Null = not posted yet.';
comment on column products.social_post_ids is
  'e.g. {"facebook_post_id": "...", "instagram_media_id": "..."} — returned by the Graph API, kept for debugging/audit.';
