# Part 2 — Wire real blur previews into the product gallery, admin-managed

Requires Part 1 already applied (needs lib/blur-preview.ts,
lib/blur-preview-backfill.ts, and app/api/admin/blur-preview-backfill/route.ts
to exist in the repo).

Files in this zip — all MODIFIED existing files, overwrite when prompted:
- app/product/[slug]/page.tsx           (fetches real blur previews server-side)
- app/product/[slug]/product-detail.tsx (threads the blurPreviews prop through)
- components/product/product-gallery.tsx (uses a real preview per-image where
  available, generic shimmer fallback otherwise — main stage, desktop rail,
  lightbox photo, lightbox thumbnail strip)
- components/admin/settings-panel.tsx    (updated "Blur Placeholder" card copy
  + new "Generate Real Photo Previews" backfill card underneath it, wired to
  Part 1's /api/admin/blur-preview-backfill endpoint)

WHAT CHANGED, BEHAVIOR-WISE
- Blur Placeholder toggle semantics are unchanged: OFF = no placeholder,
  exactly as before.
- ON now automatically shows a REAL per-image preview wherever one has been
  generated (new upload, or backfilled), and falls back to the existing
  generic shimmer for any image that doesn't have one yet. No new manual
  toggle — this is fully automatic.
- A product with zero rows in image_blur_previews behaves identically to
  before this change (generic shimmer, no regression).

WHAT TO DO AFTER UNZIPPING
1. `npx tsc --noEmit` — verified 0 new errors locally.
2. git add -A && git commit -m "Part 2: wire real blur previews into gallery + admin" && git push
3. In Admin > Settings, use the new "Generate Real Photo Previews" card to
   backfill existing product/variant images (optional — nothing breaks if
   you never run it, every image just keeps using the generic shimmer).
