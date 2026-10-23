# Variant SEO fix — unique title/description/content per colour

## Problem this fixes
Colour variants had different **URLs** but could end up with the same (or
blank) `<title>`, meta description, and — worse — the exact same visible
page description as every other colour of the same product (and as the
base product). That reads as duplicate content to Google, which lines up
with most `/product/...` URLs sitting stuck as **"Discovered - currently
not indexed"** in Search Console.

## What changed
| File | What it does |
|---|---|
| `lib/variant-seo-content.ts` | **New.** Deterministic generator — no AI call, no API key needed — that builds a unique meta title, meta description, and an on-page "style note" per colour, using search-intent keyword phrases for Indian ethnic wear (handloom saree online, silk saree for wedding, cotton saree for daily wear, etc.). Seeded from product name + colour, so it's reproducible, not random. |
| `supabase/migrations/20260902000000_variant_seo_style_note.sql` | **New.** Adds a `style_note` column to `product_variants`. |
| `lib/variants-api.ts` | Adds `style_note` to the variant type + create/update calls. |
| `app/api/admin/variants/route.ts` | If meta title/description/style note are left blank when a variant is created, the server auto-fills them using the real product's fabric/category — every variant is guaranteed unique SEO fields even if nobody touches the form. |
| `app/api/admin/variants/[id]/route.ts` | Allows `style_note` to be edited. |
| `components/admin/product-variants-manager.tsx` | Adds Meta Title / Meta Description / Style Note fields to the Add/Edit Variant dialog, plus an **"Auto-generate"** button. |
| `app/product/[slug]/page.tsx` | **Bug fix:** variant pages with no `meta_description` used to fall back to the *base product's* description — identical across every colour. Now falls back to unique generated copy instead. Also fixed the same issue in the JSON-LD structured data. |
| `app/product/[slug]/product-detail.tsx` | Renders the colour's `style_note` visibly in the Description tab — real on-page content difference, not just a meta tag. |

## How to apply
1. Copy these files into your repo at the same relative paths (they overwrite the originals).
2. Run the migration against your Supabase project:
   - **Dashboard:** SQL Editor → paste the contents of `supabase/migrations/20260902000000_variant_seo_style_note.sql` → Run.
   - **CLI:** `supabase db push` (if you use the Supabase CLI + migrations workflow).
3. Commit and push:
   ```
   git add .
   git commit -m "Fix duplicate SEO content across colour variants; add auto-generated per-colour meta/content"
   git push
   ```
4. After deploy, open any product with multiple colours in the admin panel → edit a variant → click **Auto-generate** in the new SEO box to preview the generated copy (or just leave it blank and it will auto-fill on save).

## What this does NOT do
- It doesn't force Google to index faster — that still depends on crawl budget/backlinks/domain age, as discussed earlier.
- It doesn't touch the base product's own description/meta fields — only colour-variant-specific fields.
- Existing already-published variants won't get the new fields until you re-save them (edit → save) in the admin panel, since the auto-fill only runs on create/when fields are blank at save time. If you want every existing variant backfilled in bulk, that would need a one-off script — let me know if you want that too.
