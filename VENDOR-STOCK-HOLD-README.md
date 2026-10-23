# Vendor Stock-Hold Timer + Return-to-Vendor 2x/RTO — Kya Naya Hai

## Tumne kya maanga tha
1. Vendor ka same product 2 baar return/RTO ho to admin panel me "Return
   to Vendor" option aaye, reason ke saath.
2. Admin ke notifications me pending task + kitne din se pending hai, dono dikhein.
3. Agar vendor ka koi item pehli baar return/RTO ho aur uske baad us
   product ka koi naya (repeat) order 15 din ke andar na aaye, to us
   item ko bhi vendor ko wapas karne ka flow chale.
4. Vendor apne panel me khud set kar sake ki stock kitne din warehouse
   me hold rahega — minimum/default 15 din, manually max 30 din tak.
5. Admin ko har vendor ka set kiya hua din dikhe, aur dono (admin +
   vendor) ko live countdown dikhe — deadline tak green, deadline nikalne
   ke baad red + kitne din overdue hai wo bhi.
6. Admin ke vendor setup panel ko zaroorat ho to redesign karo.
7. Zaroorat pade to vendor ke Add Product page par bhi ye info dikhe.

## Jo pehle se bana hua tha (verify karke pata chala)
- COD 2nd-return/RTO block (15 din) — already production-ready.
- "Same product 2x return → send back to vendor + clawback" — already
  bana hua tha (`products.return_count`/`return_threshold` +
  `return_to_vendor_queue`, reason `returned_2x_consent`) — **lekin
  sirf customer ke normal return flow se count hota tha, RTO se nahi**,
  aur admin UI me is reason ko render hi nahi kiya jaata tha (silently
  invisible).
- "Vendor Ops" admin panel (screenshot wala) already Return to Vendor /
  Restock / Performance / Stale Inventory tabs ke saath maujood tha.
- Admin notification bell already ek generic feed hai.

## Ab kya add/fix hua

### 1. RTO bhi "2x return" counter me count hota hai
`bump_product_return_threshold()` naam ka shared function bana ke
`check_vendor_return_threshold()` (customer returns) ka poora logic
usme daal diya — behavior wahi hai jo pehle tha. Ek naya trigger
`trg_orders_check_rto_return_threshold` add kiya jo `orders.delivery_status`
ke `rto_delivered` banne par usi function ko call karta hai. Matlab ab
"return ya RTO" dono milaake 2 ho jaaye to bhi flag lagta hai.

### 2. Admin UI me `returned_2x_consent` ab dikhta hai
`components/admin/vendor-ops-panel.tsx` ke Return to Vendor tab me ab
"Same product returned/RTO 2x" ka alag group hai, top par (sabse
urgent), reason label ke saath.

### 3. Naya: Stock Hold Timer system (point 3, 4, 5)
- **`vendors.stock_hold_days`** — naya column, default 15, CHECK (15–30).
  Sirf `update_vendor_stock_hold_days()` RPC se badalta hai (vendor
  khud, apne account ke liye) — same trust pattern jo bank-update
  request ke liye already hai.
- **`vendor_return_holds`** — naya table. Jaise hi koi order_item
  `returned` stage me jaata hai YA uska order `rto_delivered` hota hai,
  ek hold row ban jaati hai: `returned_at`, `hold_days` (us waqt ka
  vendor ka setting), `hold_deadline`.
- **`run_vendor_return_hold_scan()`** — naya daily-cron function:
  - naye returned/RTO items ke liye hold khol deta hai
  - agar deadline se pehle usi product ka koi naya order aa jaaye
    (matlab dobara demand hai), hold `resolved_resold` ho jaata hai —
    kuch nahi hota
  - agar deadline nikal jaaye aur koi naya order na aaya ho, hold
    `flagged` ho jaata hai AUR `return_to_vendor_queue` me naya row
    (reason `unsold_after_return`) daal diya jaata hai — same jagah jaha
    baaki return-to-vendor cases already dikhte hain.
- Daily cron (`/api/cron/daily-jobs`) me wire kar diya — koi naya Vercel
  cron nahi banaya (Hobby 2-cron limit ke andar). Manual test ke liye
  `/api/cron/vendor-return-hold-scan`.

### 4. Green → Red countdown (point 5)
- Admin: Vendor Ops ka naya tab **"Stock Hold Timers"** — har active
  (holding) aur overdue (flagged) hold ek row me, deadline tak hara
  badge ("X din baaki"), deadline nikalne ke baad laal badge ("X din
  overdue").
- Return to Vendor tab ke `unsold_after_return` rows par bhi wahi laal
  overdue badge dikhta hai (row me `hold_deadline` carry hota hai).
- Vendor: naya widget **`components/vendor/stock-hold-timers.tsx`** —
  My Orders aur Add Product page dono par, same green/red logic, sirf
  apne items ke liye.

### 5. Admin ke vendor card par vendor ka set kiya hua din (point 5, 6)
`components/admin/vendors-panel.tsx` — jo panel already achha designed
tha usko poora redesign nahi kiya (jaisa bola tha, "agar bana hua he to
thik"), bas har approved vendor ke card me ek line add ki:
"Stock hold window: **N din** (vendor-set, 15–30 range)".

### 6. Admin notifications — pending task + days (point 2)
`app/api/admin/notifications/route.ts` — har pending
`return_to_vendor_queue` row ab ek notification hai, message me hi
"X din se pending" already bana hua hai (reason label ke saath). Bell
icon aur unread badge automatically kaam karte hain (existing polling
mechanism), koi naya UI nahi banana pada.

### 7. Vendor Settings page (point 4)
Naya **`/vendor/dashboard/settings`** page + sidebar me "Settings" link.
Ek slider (15–30 din) + save button — `update_vendor_stock_hold_days()`
RPC ko call karta hai.

## Setup / deploy steps
1. **Supabase migration**: `supabase/migrations/20260912000000_vendor_stock_hold_and_unsold_return.sql`
   apne Supabase project (SQL editor ya CLI) par run karo.
2. Koi naya env var nahi chahiye.
3. Files push/deploy karo.
4. Ek baar Admin → Vendor Ops → "Stock Hold Timers" tab aur Vendor →
   Settings page khol ke dekh lena.

## Files changed/added
- `supabase/migrations/20260912000000_vendor_stock_hold_and_unsold_return.sql` (new)
- `lib/vendor-api.ts` — `stock_hold_days` on `VendorProfile`, `StockHoldRow`
  type, `hold_deadline` on `ReturnToVendorRow`, new fetch/update helpers
- `lib/cron-jobs.ts` — `runVendorStockHoldScanJob()` added
- `app/api/cron/daily-jobs/route.ts` — wired the new job
- `app/api/cron/vendor-return-hold-scan/route.ts` (new) — manual trigger
- `app/api/vendor/settings/route.ts` (new) — GET/PATCH stock_hold_days
- `app/api/vendor/stock-holds/route.ts` (new) — vendor's own timers
- `app/api/admin/vendor-ops/route.ts` — `hold_deadline` on return-to-vendor
  rows + new `type=stock-holds`
- `app/api/admin/notifications/route.ts` — pending Return-to-Vendor tasks
- `components/admin/notification-bell.tsx` — icon for the new type
- `components/admin/vendor-ops-panel.tsx` — new reason groups + new
  "Stock Hold Timers" tab + green/red countdown badges
- `components/admin/vendors-panel.tsx` — per-vendor hold-days display
- `components/vendor/sidebar-nav.tsx` — Settings link
- `components/vendor/stock-hold-settings.tsx` (new) — the 15–30 slider
- `components/vendor/stock-hold-timers.tsx` (new) — vendor's countdown widget
- `app/vendor/dashboard/settings/page.tsx` (new)
- `app/vendor/dashboard/add-product/page.tsx` — widget added
- `app/vendor/dashboard/orders/page.tsx` — widget added

Verified: `tsc --noEmit` clean; `next lint` on every changed file shows
only pre-existing unescaped-apostrophe warnings unrelated to this change
(confirmed via `git diff` — none of those lines were touched here).
