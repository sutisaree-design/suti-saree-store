# Hidden Product Sources — kya naya hai

Admin-only feature: product kahan se (kis WhatsApp supplier se) source hua,
uska buy price, aur order aane par woh product kis source ka tha — sab kuch
sirf admin ko dikhega. Frontend, Google Merchant Center, ya koi bhi bot ise
kabhi nahi dekh sakta.

## Deploy steps

1. **Supabase migration**: `supabase/migrations/20260910000000_hidden_product_sources.sql`
   apne Supabase project (SQL editor ya CLI) me run karo. Ye 2 naye tables
   banata hai — `product_sources` aur `product_sourcing` — dono par RLS
   enabled hai lekin **koi bhi anon/authenticated policy nahi hai**, matlab
   sirf service-role (admin API) access kar sakta hai. Isse zyada locked-down
   kuch nahi ho sakta — frontend anon key se query karega to kuch nahi milega.
2. Files replace/push karo (niche list).
3. `/admin` panel kholo → left sidebar me **Sourcing → Product Sources**
   naya section dikhega. Wahan se "Add New" button se sources add karo
   (name, WhatsApp name, WhatsApp number, date/time, notes).
4. Product **Add/Edit** dialog me, Price field ke neeche ek naya
   "Admin-only" box dikhega — wahan **Product Source dropdown** aur
   **Buy Price** field hai. Yahi save hote hi `product_sourcing` table me
   store ho jaata hai (products table me kabhi nahi, taaki customer-facing
   queries me kabhi na aaye).
5. **Orders panel** me ab har row ke product name ke neeche ek chhota
   amber tag dikhega — "Source: <name> · <whatsapp number>" — agar us
   product ka source assign kiya gaya ho.
6. Product Sources panel me kisi bhi source pe "N products" button click
   karke uske saare assigned products (buy price ke saath) dekh sakte ho.

## Files changed/added
- `supabase/migrations/20260910000000_hidden_product_sources.sql` (new)
- `lib/product-sources-api.ts` (new) — client fetch helpers
- `app/api/admin/product-sources/route.ts` (new) — list + create
- `app/api/admin/product-sources/[id]/route.ts` (new) — detail (+linked products) / edit / delete
- `app/api/admin/product-sources/product/[productId]/route.ts` (new) — per-product get/save
- `components/admin/product-sources-panel.tsx` (new) — the admin UI
- `components/admin/admin-shell.tsx` — new "Product Sources" nav item
- `app/admin/page.tsx` — registers the new panel
- `components/admin/products-panel.tsx` — Source dropdown + Buy Price field in the product form
- `components/admin/orders-panel.tsx` — source tag shown per order row
- `lib/orders-api.ts` — `fetchOrders()` now attaches hidden `_item_sources` per order

Verified: `tsc --noEmit` clean, `next lint` clean on all changed files.
