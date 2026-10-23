# Reseller Program — Setup Guide (v3: fixed selling price + guest login popup)

## What changed in this version
1. The **"Resell this product"** option now shows on checkout for **everyone**, logged in or
   not.
2. If you're **not logged in** and tick it, a popup appears — **"Log In"** or **"Create
   Account"**. Both keep your cart. No account yet? Create one right there, then come straight
   back to checkout.
3. The margin is now a **plain rupee price**, not a percentage. You type the price your own
   customer should pay. Example: cost price **₹450**, you type **₹550** → the app shows
   **+₹100 profit in green**, live, both at checkout and in your account dashboard.
4. `/account/reseller` dashboard now shows/edits your **default profit amount in ₹** (used to
   pre-fill the price field at checkout) instead of a %.
5. **Admin → Orders**: the resale badge now shows `cost → sale price` plus the profit in green,
   instead of a margin %.
6. **Admin → Resellers**: the "Margin" column is now "Default Markup" shown in ₹.

## Files changed (copy over your repo, same paths — overwrite existing ones)
```
supabase/migrations/20260730000000_reseller_price_markup.sql   ← NEW migration, run this

lib/reseller-api.ts                        ← UPDATED (price-based, not %)
app/checkout/page.tsx                      ← UPDATED (shows for guests too, login popup, price field)
app/account/reseller/page.tsx              ← UPDATED (₹ default markup instead of %)
app/api/reseller/route.ts                  ← UPDATED (stores default_markup_amount)
app/api/admin/resellers/route.ts           ← UPDATED
components/admin/resellers-panel.tsx       ← UPDATED (₹ column instead of %)
components/admin/orders-panel.tsx          ← UPDATED (cost → sale price, profit in green)

app/api/reseller/orders/route.ts           ← unchanged (old API, UI doesn't call it, safe to keep)
components/admin/admin-shell.tsx           ← unchanged
app/admin/page.tsx                         ← unchanged
components/account/account-nav.tsx         ← unchanged
app/account/orders/page.tsx                ← unchanged
```

## Setup steps
1. Copy all files above into your project at the same paths (overwrite existing ones).
2. Run the **new migration** on Supabase (SQL Editor → paste → Run, or `supabase db push`):
   - `20260730000000_reseller_price_markup.sql`
   - (Your older `20260728000000_reseller_program.sql` and
     `20260729000000_reseller_brand_name.sql` migrations must already be applied — this one just
     adds one more column on top.)
3. Restart dev server / redeploy.
4. `git add . && git commit -m "Resale: fixed price, guest login popup" && git push`

## Test it
**As a guest (not logged in):**
1. Add a product to cart, go to checkout, tick **"Resell this product"**.
2. A popup appears — click **Log In** or **Create Account**. Either takes you to that page and
   brings you back to checkout after, cart intact.
3. Log in / sign up, come back to checkout, tick the box again — it now opens the **Yes/No**
   confirm popup as normal.

**As a logged-in customer:**
1. Tick **"Resell this product"** → **Yes** on the popup.
2. See your **cost price** shown, and a **Selling price for your customer** field pre-filled
   (cost + your default markup). Change it to whatever you want, e.g. cost ₹450 → type ₹550.
3. Watch **+₹100 profit** appear in green, live.
4. Fill your (test) customer's name/phone/address, place the order.
5. Go to `/account/reseller` → see the order in "Your Resale Orders" with the same profit
   shown in green. Set your default profit amount (₹) there too.
6. Go to Admin → Orders → the order shows the amber **"Resale"** badge with
   `₹450 → ₹550 · +₹100 profit`.

## Notes
- The selling price can't be set below your cost price — the app blocks placing the order and
  shows an error if you try.
- Pricing is still **server-side safe** where it matters: the base product price always comes
  from your `products` table; the reseller's chosen selling price is just what gets charged/COD'd
  as the order total, same as before.
- Payment stays COD or your existing Razorpay online flow — the amount charged is simply the
  price the reseller typed in, instead of the normal total, when resale is ticked.
