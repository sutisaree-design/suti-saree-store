# Phase 13 — Growth Marketing System (Setup Guide)

Naya conversion-focused marketing system 3 phases mein ban chuka hai, sab
kuch **Admin panel se manage hota hai** — koi redeploy nahi chahiye settings
badalne ke liye.

## 1. Migration chalao (sabse pehle)

Supabase project mein ye ek file run karo (SQL editor ya `supabase db push` se):

```
supabase/migrations/20260724000000_phase13_growth_marketing.sql
```

Ye banata hai:
- `product_bundles` table — "Frequently Bought Together" ke manual pairs
- `email_automation_log` table — welcome/win-back emails ka duplicate-prevention log
- `growth_settings` aur `email_automation_settings` default rows `settings` table mein seed karta hai

## 2. Phase 1 — Growth Toolkit
**Admin → Marketing → Growth Tools** tab se manage hota hai.

| Feature | Kya karta hai |
|---|---|
| Urgency banner | Sticky top bar, poori site pe |
| Low stock badge | "Only N left" — product page pe automatic |
| Exit-intent popup | Discount code popup jab user tab bar ki taraf mouse le jaye |
| Social proof toasts | Real recent orders se "Someone in Jaipur just bought..." |
| Sale countdown bar | Ticking timer, end time set karo |

Sab off-by-default hain — jo chahiye wahi on karo.

## 3. Phase 2 — Frequently Bought Together
**Admin → Marketing → Bundles** tab se manage hota hai.

- Product select karo → doosre products add karo jo saath dikhane hain
- Kuch manually set nahi kiya to storefront **automatically** past orders se
  real co-purchase pairs compute karke dikha dega (`/api/bundles/auto`)
- Product page pe "Frequently Bought Together" section checkbox ke saath
  dikhta hai — customer select karke ek click mein sab cart mein add kar sakta hai

## 4. Phase 3 — Email Automation (Welcome + Win-back)
**Admin → Marketing → Email Automation** tab se manage hota hai.

- **Welcome series**: signup ke N ghante baad ek baar discount code email
- **Win-back**: jo customer N din se order nahi kiya, unko ek baar "we miss you" email

Requirements:
1. Admin → Settings → Email Notifications mein email provider (Resend/ZeptoMail) configure hona chahiye
2. `vercel.json` mein naya cron already add ho chuka hai — roz `04:00 UTC` pe chalega
3. Discount codes (jo settings mein likhe hain) ko Admin → Coupons mein bhi banao, warna checkout pe kaam nahi karenge

⚠️ Vercel Hobby plan par cron jobs sirf **once per day** allowed hain — dono cron
(`abandoned-carts` @ 21:30 UTC, `email-automation` @ 04:00 UTC) is limit ke andar hain.

## Naye files ka summary

```
supabase/migrations/20260724000000_phase13_growth_marketing.sql
lib/growth-api.ts
lib/bundles-api.ts
lib/email-automation-api.ts
lib/email-templates.ts            (welcome + winback templates add kiye)
app/api/social-proof/route.ts
app/api/bundles/auto/route.ts
app/api/cron/email-automation/route.ts
components/growth/urgency-banner.tsx
components/growth/exit-intent-modal.tsx
components/growth/social-proof-toast.tsx
components/growth/sale-countdown-bar.tsx
components/growth/low-stock-badge.tsx
components/product/frequently-bought-together.tsx
components/admin/bundles-panel.tsx
components/admin/email-automation-panel.tsx
components/admin/marketing-panel.tsx      (Growth Tools tab add kiya)
components/admin/admin-shell.tsx          (Bundles + Email Automation nav)
app/admin/page.tsx                        (naye panels wire kiye)
components/providers.tsx                  (growth widgets globally mount kiye)
app/product/[slug]/product-detail.tsx     (low-stock badge + bundles wire kiye)
vercel.json                               (naya cron entry)
```

## Deploy karne se pehle

```bash
npm install
npm run build   # sandbox mein sirf Google Fonts network-block ke wajah se fail
                 # hua tha — Vercel pe normal chalega, code clean hai (tsc pass)
```
