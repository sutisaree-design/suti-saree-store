# Part 1 — Promotions (BOGO) admin panel

## New files (just drop these in, same paths)
- `supabase/migrations/20260905000000_promotions_bogo.sql`
- `lib/promotions-api.ts`
- `app/api/admin/promotions/route.ts`
- `app/api/admin/promotions/[id]/route.ts`
- `components/admin/promotions-panel.tsx`

## Modified files (REPLACE your existing ones with these)
- `components/admin/admin-shell.tsx` — added `'promotions'` to `AdminSection`,
  imported the `Percent` icon, added a "Promotions" nav item under Marketing
  (right below Coupons). No other lines touched.
- `app/admin/page.tsx` — imported `PromotionsPanel` and registered it in the
  `PANELS` map right below `coupons`. No other lines touched.

## Apply + run
```bash
# from your repo root, after copying these files into place:
npx supabase db push          # or however you normally run migrations
npm run dev
```
Then open `/admin?section=promotions` (or click "Promotions" in the sidebar,
under Marketing) and create a test BOGO promotion.

Nothing in the cart, checkout, or homepage was touched in this part — that's
Parts 2–4.

```bash
git add -A && git commit -m "Part 1: Promotions (BOGO) admin panel"
git push
```
