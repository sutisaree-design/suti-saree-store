# Phase 16 — Cart Bump (side cart + cart page) + Honest Low-Stock Urgency

Do cheezein add ki hain, dono same principle follow karte hain: **jo dikhta hai wahi sach
hai** — koi fake countdown, koi fake "X log dekh rahe hain", koi fabricated number nahi.

## 1. Order bump — ab side cart aur /cart page pe bhi

Pichli baar sirf checkout page pe tha. Ab wahi (same Admin → Marketing → Checkout Bump
settings, koi naya setup nahi chahiye) side-cart drawer aur `/cart` page pe bhi dikhta hai —
customer checkout tak pahunche usse pehle hi "yes" bol sakta hai.

Naya shared component: `components/cart/cart-bump.tsx` — self-contained (khud cart read/write
karta hai), do variants: `compact` (side drawer ke liye chhota) aur full (cart page ke liye).

Agar wo product already cart mein hai, card khud-ba-khud hide ho jata hai (duplicate offer
nahi dikhega).

## 2. Honest low-stock urgency

Koi naya fake urgency nahi banaya — jo already tumhare paas hai (**Admin → Marketing →
Growth Tools → Low stock badge**, jo real `stock_quantity` se driven hai, product page pe
already istemal hota hai) wahi ab side cart aur cart page ke har item ke neeche bhi dikhta
hai: "Only N left in stock — order soon". Ye number seedha database se aata hai, koi
misrepresentation nahi — agar stock zyada hai to badge khud nahi dikhega, aur agar tumne
Growth Tools mein ye feature off kar rakha hai to yahan bhi off rahega (same toggle, same
threshold, poori site pe consistent).

## Naye/modified files

```
components/cart/cart-bump.tsx      NEW
components/cart-drawer.tsx         MODIFIED (bump + low-stock badge wire kiye)
app/cart/page.tsx                  MODIFIED (bump + low-stock badge wire kiye)
```

## Deploy

Koi migration nahi chahiye — sab existing settings/columns reuse kiye hain.

```bash
npm install
npx tsc --noEmit   # clean pass
npx next lint      # clean pass
git add -A && git commit -m "Phase 16: cart bump in drawer/cart page + honest low-stock urgency" && git push
```

## Test kaise karo
1. Cart mein koi product daalo (jo bump-product na ho) → header ka cart icon click karo
   (side drawer khulega) → subtotal ke upar dashed card dikhna chahiye
2. `/cart` page pe jao → same card Order Summary mein bhi dikhega
3. Checkbox tick karo (kisi bhi jagah se) → dono jagah (aur checkout pe bhi) sync rahega,
   kyunki teeno ek hi cart state read karte hain
4. Kisi product ka stock kam karke (Admin → Products) low-stock threshold se neeche le aao →
   cart mein us item ke neeche "Only N left" badge dikhna chahiye
