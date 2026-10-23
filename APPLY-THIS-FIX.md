# Fix bundle — deploy failure + checkout total mismatch

Zip ko `C:\Users\bapan\E-Commerce-ethnic\` ke andar extract kar dijiye.
Folder structure same hai, to files apne aap sahi jagah replace ho jayengi.

## Files in this bundle

| File | Kya badla |
|---|---|
| `package-lock.json` | Regenerate kiya — `npm ci` ab pass hota hai |
| `supabase/migrations/20261001000000_fix_total_gst_bogo_resale.sql` | **Naya** migration — GST double-add, BOGO, resale total |
| `app/checkout/page.tsx` | `bogo_discount` RPC ko bhejta hai + comments |
| `app/order-confirmation/[id]/page.tsx` | Breakdown me BOGO line |

## Steps

1. Zip extract karke files replace karo.

2. **Supabase me migration chalao** (ye sabse zaroori step hai — iske bina
   code push karne se kuch nahi hoga, total server-side hi calculate hota hai).
   Supabase Dashboard > SQL Editor > naya query > poora
   `20261001000000_fix_total_gst_bogo_resale.sql` paste karke Run.

3. Push:
   ```
   git add -A
   git commit -m "fix: order total (GST double-add, missing BOGO, resale price) + sync lockfile"
   git push
   ```

4. Netlify deploy log dekho — install step ab `npm ci` par fail nahi hona chahiye.

5. **Ek test order** karo (chhota amount, online payment): checkout par jo
   "Pay ₹X" dikh raha hai aur Razorpay popup me jo amount aa raha hai,
   dono exactly same hone chahiye. Pehle ye match nahi karte the.

## Kya theek hua

### 1. `npm ci` fail (deploy break)
`@aws-sdk/client-s3` aur `@aws-sdk/s3-request-presigner` 19 Aug ko
`package.json` me add hui thi par lockfile update nahi hua tha. npm 8.6+
se `npm ci` out-of-sync lockfile par hard fail karta hai, aur Netlify
lockfile hone par `npm ci` hi chalata hai.

### 2. GST har order me double
Store me saare price GST-inclusive hain (checkout page, admin panel,
invoice — teeno yahi kehte hain). Par RPC me:

```sql
v_total := v_computed_subtotal + v_shipping + v_gst - ...
```

`gst_amount` total me add ho raha tha. Matlab ₹2000 ka cart "Pay ₹2000"
dikhata tha par DB me `total_amount = 2095` jata tha — aur
`/api/razorpay/create-order` DB wala amount hi charge karta hai. COD order
bhi galat amount par book hota tha.

Ab `gst_amount` sirf row/invoice me store hota hai, total me add nahi hota.

### 3. BOGO server par exist hi nahi karta tha
`computeBogoDiscount()` client par discount dikhata tha, par RPC ko
`bogo_discount` na bheja jata tha na wo khud compute karta tha — to jis
cart par live Buy-X-Get-Y promo tha, customer ko kam price dikhta tha aur
charge poora hota tha.

Ab discount **server par recompute** hota hai — `promotions` table se, aur
authoritative product price se, bilkul wahi algorithm jo
`computeBogoDiscount()` use karta hai (qualifying units ko ek-ek unit me
expand karo, sasta pehle sort karo, `buy_qty + get_qty` ke chunks me
chalo, sirf poora chunk qualify karta hai, har chunk ke sabse saste
`get_qty` units par `free_item_discount_percent`% off, sab promotions ka
sum, end me ek hi baar round). Client ka number trust nahi kiya jata —
wahi treatment jo coupon/gift card ko already milta hai.

`orders.bogo_discount` column bhi add hota hai taaki amount row par audit
ho sake.

### 4. Reseller order cost price par book ho raha tha
RPC client ka `total_amount` ignore karke apna cost-side total likh deta
tha, to reseller ka margin kabhi charge hi nahi hota tha. Ab resale order
par reseller ki selling price honour hoti hai — lekin sirf **upar ki taraf**
(cost se kam kabhi nahi ho sakti), to isse underpay nahi kiya ja sakta.
`reseller_base_cost` / `reseller_profit` / `reseller_margin_percent` bhi ab
server hi compute karta hai.

## Tests

Migration ko local Postgres 16 par actual schema ke against chala kar
verify kiya gaya. 8/8 pass:

| Test | Expected | Got |
|---|---|---|
| Plain order, GST ₹119 bheja | total 2500 | 2500 ✅ |
| B1G1 (2x₹1000 + 1x₹1500) + ₹99 shipping | total 2599, bogo 1000 | ✅ |
| Collection-scoped promo, product bahar | bogo 0 | ✅ |
| Collection-scoped promo, product andar | bogo 1000 | ✅ |
| Buy2Get1 @50%, 3x₹1000 | bogo 500 | ✅ |
| Coupon 20% + B1G1 saath me | coupon 600, bogo 1000, total 1400 | ✅ |
| Reseller cost ₹2000, sells ₹2600 | total 2600, profit 600, margin 30.0 | ✅ |
| Non-reseller `total_amount: 1` bhejta hai | total 2000 (ignore) | ✅ |

`tsc --noEmit` bhi clean hai.

## Jo is bundle me NAHI hai (aap decide kijiye)

- **Abandoned online payment side-effects.** Gift card balance deduct,
  coupon `times_used` increment, aur loyalty points ledger entry — teeno
  order *create* hote hi ho jate hain, payment se pehle. Razorpay popup
  close kar diya to teeno consume ho gaye bina paise aaye. Isko theek
  karne ke liye ya to inhe verify-payment ke baad karna padega, ya failed/
  expired pending order par reverse karna padega. Ye bada behaviour change
  hai isliye maine chhua nahi.
- **119 migrations me 17 duplicate timestamp prefixes.** `supabase db push`
  use karenge to ordering problem aayegi. Abhi aap manually SQL Editor me
  chala rahe hain to koi dikkat nahi.

## Purane orders

Jo orders is fix se pehle GST-inflated total par place hue hain, unka
`total_amount` apne aap correct nahi hoga — ye migration sirf aage ke
orders par asar karta hai. Agar refund/adjust karna hai to woh alag se
dekhna padega.
