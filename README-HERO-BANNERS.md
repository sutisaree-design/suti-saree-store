# Hero Banner Carousel — Changed/New Files

Feature: Admin can upload multiple hero banner images (recommended: all the
same pixel size), which auto-rotate as a carousel on the homepage. Each
banner can optionally link somewhere on click, but the link is never shown
as visible text on top of the image.

## How to apply
Copy every file in this zip into your repo at the same relative path
(overwrite the 5 modified files, add the 7 new ones), then:

```bash
git add -A
git commit -m "Add hero banner carousel (admin upload, size check, links)"
git push
```

Finally run the new migration against your Supabase project:
`supabase/migrations/20260908020000_hero_banners.sql`
(via `supabase db push`, or paste it into the SQL editor).

## New files
- `supabase/migrations/20260908020000_hero_banners.sql` — new `hero_banners` table (position, image_url, link_url, is_active), same RLS pattern as `homepage_tiles`.
- `lib/hero-banners-api.ts` — admin CRUD, image upload (reuses the `product-images` bucket), `readImageDimensions`/`readRemoteImageDimensions` helpers for the size-mismatch warning, and the public fetch helper.
- `app/api/admin/hero-banners/route.ts` (GET/POST), `.../[id]/route.ts` (PATCH/DELETE), `.../reorder/route.ts` (PATCH) — admin API routes.
- `components/admin/hero-banners-panel.tsx` — admin UI: list with reorder/active-toggle/edit/delete, add/edit dialog with image upload + live dimension-mismatch warning + optional link field (with a note it's never shown as text on the image).
- `components/home/hero-banner-carousel.tsx` — the homepage carousel: auto-advance every 5s (pauses on hover), swipe on mobile, dots, prev/next arrows (2+ banners only), each slide wrapped in a `Link` only if `link_url` is set, no text overlay ever.

## Modified files
- `components/admin/admin-shell.tsx` — added `hero-banners` to `AdminSection`, added the "Hero Banners" nav item under Marketing.
- `app/admin/page.tsx` — imported and registered `HeroBannersPanel`.
- `lib/home-data-server.ts` — added `heroBanners: HeroBanner[]` to `HomeData`, added a server-safe `fetchHeroBanners()`, wired it into `fetchHomeData()`'s `Promise.all`.
- `app/page.tsx` — passes `heroBanners={homeData.heroBanners}` to `HomeClient`.
- `app/home-client.tsx` — accepts `heroBanners` prop; renders the carousel when 1+ active banners exist, otherwise falls back to the existing single legacy banner (Admin > Settings site banner), otherwise the static "Drape Yourself…" hero — fully backward-compatible.

`npx tsc --noEmit` passes with zero errors after these changes.
