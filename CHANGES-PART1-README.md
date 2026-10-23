# Part 1 — Real LQIP blur-preview backend

Files in this zip, unzip directly into your `E-Commerce-ethnic` repo root
(overwrite when prompted for the 3 existing files):

NEW FILES
- supabase/migrations/20260930020000_image_blur_previews.sql   (new table, run this migration in Supabase)
- lib/blur-preview.ts                                          (generateBlurDataUrl, getBlurPreviews, storeBlurPreview)
- lib/blur-preview-backfill.ts                                 (backfill engine for the ~900 existing images)
- app/api/admin/blur-preview-backfill/route.ts                 (GET/POST admin API, same shape as image-resize-backfill)

MODIFIED FILES (existing routes, blur-preview call added, everything else untouched)
- app/api/upload-image/route.ts
- app/api/admin/import-image/route.ts
- app/api/upload-review-photo/route.ts

WHAT TO DO AFTER UNZIPPING
1. Run the new migration against your Supabase project (via the Supabase
   dashboard SQL editor, or `supabase db push` / your usual migration flow).
2. `npx tsc --noEmit` — verified 0 new errors locally.
3. git add -A && git commit -m "Part 1: real per-image blur preview backend" && git push
4. New uploads/imports (product, variant, review photos) will now get a
   real blur preview automatically. To backfill existing images, call
   POST /api/admin/blur-preview-backfill with {"action":"start"}, then
   repeatedly POST {"action":"run-batch"} until GET shows status "done"
   (Part 2 will wire this to an actual button in the admin Settings panel,
   same as "Generate Responsive Image Sizes").

Nothing here touches products.images / product_variants.images, the
generic shimmer placeholder, or any existing upload behavior — this is
purely additive, exactly as PART-1-PROMPT-real-blur-backend.md specified.
