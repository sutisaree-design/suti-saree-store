-- ---------------------------------------------------------------------
-- Real per-image LQIP blur previews (Part 1 of the real-blur-ai feature).
--
-- 100% additive: a brand-new, fully independent table. Does NOT touch
-- products.images / product_variants.images in any way, so nothing that
-- already reads those columns can break.
--
-- image_url is the canonical /media/... URL (see lib/media-url.ts) as
-- stored in products.images[] / product_variants.images[] — used as the
-- primary key so a whole gallery's worth of previews can be fetched with
-- a single indexed `WHERE image_url = ANY($1)` lookup, and so the same
-- image URL reused across a base product and a colour variant naturally
-- de-duplicates to one row.
-- ---------------------------------------------------------------------

create table if not exists image_blur_previews (
  image_url text primary key,
  blur_data_url text not null,
  created_at timestamptz not null default now()
);

alter table image_blur_previews enable row level security;

-- Read-only for anon/authenticated (storefront needs to read these to
-- render galleries); writes only ever happen server-side via the
-- service-role client (upload routes + admin backfill route).
drop policy if exists "anon_select_blur_previews" on image_blur_previews;
create policy "anon_select_blur_previews" on image_blur_previews for select
  to anon, authenticated using (true);
