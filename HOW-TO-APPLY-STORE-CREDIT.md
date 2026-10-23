# Store Credit — Header Integration (v2 — mobile fix)

Ye zip me sirf naye/changed files hain (poora repo nahi). In files ko apne
repo ke **same relative paths** par copy/replace kar do, phir commit + push.

## Files in this zip

| File | Kya hai |
|---|---|
| `supabase/migrations/20260928000000_store_credit.sql` | Naya `store_credits` (balance) + `store_credit_ledger` (history) table, RLS ke saath |
| `lib/store-credit-api.ts` | Client-side functions: balance fetch, history, redeem, admin adjust |
| `app/api/store-credit/redeem/route.ts` | Checkout par balance apply karne wala server route |
| `app/api/admin/store-credit/route.ts` | Admin panel se customer ko credit issue/adjust karne wala route |
| `app/account/store-credit/page.tsx` | Customer-facing `/account/store-credit` page (balance + history) |
| `app/account/page.tsx` | **Fix**: `/account` dashboard (Welcome back / stats / Shopping list) me Store Credit stat-tile + list item add kiya |
| `components/header.tsx` | **Fix**: Header me Wallet icon ab mobile par bhi dikhta hai (chhota badge), desktop par icon + ₹amount |
| `components/account/account-nav.tsx` | Account sidebar me "Store Credit" link add kiya |
| `store-credit.patch` | Same changes ek single git patch ke roop me (`git apply store-credit.patch`) |

### V2 me kya fix hua
Pehle version me header ka Wallet icon `sm:flex` class ki wajah se **sirf
desktop par** dikhta tha, mobile par ghayab tha — tumhare screenshots
mobile view ke the isliye top pe kuch nahi dikh raha tha. Ab mobile par
ek chhota ₹ badge (cart count jaisa) dikhega, desktop par icon + pura
₹ amount text.

Saath hi `/account` dashboard page (Welcome back card + "0 Orders / 81
Reward Points" wala) apni **alag** links list use karta hai
(`account-nav.tsx` wali nahi) — usme Store Credit missing tha, wo bhi
add kar diya: ab ek teesra stat-tile ("Store Credit ₹...") aur Shopping
section me ek naya row dikhega.

## Apply karne ke 2 tareeke

### Option A — Files copy karke (simple, GUI se bhi)
1. Zip extract karo.
2. Har file ko apne local repo me **usi path** par paste/replace karo
   (e.g. `components/header.tsx` → `E-Commerce-ethnic\components\header.tsx`).
3. `git add -A && git commit -m "Fix store credit visibility on mobile + account dashboard" && git push`

### Option B — Patch apply karke (terminal)
```bash
cd E-Commerce-ethnic
git apply --check store-credit.patch   # dry run, error na aaye to next line chalao
git apply store-credit.patch
git add -A
git commit -m "Fix store credit visibility on mobile + account dashboard"
git push
```

## Deploy se pehle zaroori step

⚠️ **Supabase migration run karna mat bhoolna**, warna balance/header errors
throw karega (table exist hi nahi karega):

```bash
supabase db push
```
(ya Supabase Dashboard → SQL Editor me `20260928000000_store_credit.sql`
ka content paste karke run karo.)

## Deploy ke baad kahan-kahan dikhega

1. **Header top row (mobile + desktop)** — logged-in user ko Wallet icon
   dikhega, saath me balance (mobile: chhota badge, desktop: ₹ amount text).
2. **Header hamburger / mobile menu** — "Store Credit" row me ₹ badge.
3. **`/account` dashboard** — top stats me 3rd tile "Store Credit ₹X" aur
   Shopping section me ek row.
4. **`/account/store-credit`** — full balance + history page.
5. **Account sidebar (desktop)** — "Store Credit" link.

## Abhi tak jo wire nahi hua

- **Admin UI** — abhi koi tab nahi hai jaha se admin GUI se credit issue kar
  sake. Backend route (`POST /api/admin/store-credit`, body: `{ email, amount,
  reason }`) ready hai, usse curl/Postman se ya ek chhota admin panel tab
  bana ke call kar sakte ho.
- **Checkout redeem** — `redeemStoreCredit(amountDue)` function ready hai
  (`lib/store-credit-api.ts`), lekin checkout page ki UI se abhi connect
  nahi kiya gaya, isliye customer balance dekh sakta hai par apply nahi kar
  payega jab tak wo integrate na ho.

## Note

`node_modules` na hone ki wajah se main is environment me `npm run build` /
`tsc` chala ke type-check nahi kar paya — maine sab kuch existing
gift-cards/loyalty patterns follow karke likha hai (same imports, same auth
helpers), lekin push karne se pehle ek baar locally `npm run build` chala
lena safe rahega.
