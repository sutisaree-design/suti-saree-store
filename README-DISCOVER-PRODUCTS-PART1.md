# Discover Products — Part 1 (Backend + Admin Panel)

This zip contains only the NEW and CHANGED files for Part 1. Extract it
into the root of your local `E-Commerce-ethnic` folder, overwriting when
asked — it will drop files into their correct paths automatically.

## New files
- `supabase/migrations/20260930030000_discover_products.sql`
- `lib/discover-products-api.ts`
- `app/api/admin/discover-products/route.ts`
- `app/api/admin/discover-products/[id]/route.ts`
- `app/api/admin/discover-products/reorder/route.ts`
- `components/admin/discover-products-panel.tsx`

## Modified files (small additions only — safe to overwrite)
- `components/admin/admin-shell.tsx` — added a "Discover Products" sidebar
  nav entry under Marketing, and the `'discover-products'` section type.
- `app/admin/page.tsx` — registered the new panel in the `PANELS` map.

## After extracting

1. **Run the migration** against your Supabase project (Supabase Studio →
   SQL editor → paste the contents of the new `.sql` file → Run). This
   creates the `discover_picks` table.
2. `git add -A && git commit -m "Add Discover Products section (Part 1: backend + admin)" && git push`
3. Redeploy (Netlify will pick it up automatically on push, based on
   `netlify.toml` in the repo).
4. Open `/admin` → sidebar → Marketing → **Discover Products**. You should
   see:
   - A "Section Settings" card (enable/disable, title, subtitle, Auto/Manual
     mode, sort, page size, filter chip toggles).
   - A "Manual Picks" card where you can search your catalog and add
     products, reorder them, toggle them active/inactive, or remove them.

## What this part does NOT do yet

This is backend + admin only. The homepage does **not** show the new
section yet, and clicking a product still goes to the normal product page
— that's Part 2 (storefront section + same-page Quick View), which
consumes the `lib/discover-products-api.ts` functions and API routes built
here. Give the other AI the "PART 2" prompt next.

## Verified before packaging
- `npx tsc --noEmit` → 0 errors across the whole repo with these files
  added.
- Confirmed `products.id` is `uuid` in existing migrations, matched in the
  new table's foreign key.
- Followed the exact same admin-auth / RLS / revalidatePath conventions as
  the existing `homepage_tiles` feature, so it fits the codebase's existing
  security model.
