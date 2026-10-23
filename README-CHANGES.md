# Trustpilot integration — ab Admin panel se manage hoga

## Kya badla (pichle zip se)

Pichli baar maine Integration Key seedha code me hardcode kar diya tha
(`app/layout.tsx`). Ab wo **Admin > Marketing > Analytics** tab se
manage hoti hai — GA4 aur Meta Pixel ki tarah hi ek naya "Trustpilot
Review Invitations" card add ho gaya hai wahan:

- **Toggle (on/off)** — bina code chhue integration band/chalu kar sakte ho.
- **Integration Key** field — key change karni ho (naya Trustpilot account,
  ya key rotate karni ho) to bas admin panel se update karo, koi deploy
  nahi chahiye.

## Files jo change hue (is round me)

1. **`lib/marketing-api.ts`** — `AnalyticsSettings` type me
   `trustpilot_enabled` aur `trustpilot_integration_key` fields add kiye
   (same Supabase `settings` table use hoti hai jaha GA/Meta Pixel settings
   already store hote hain — koi naya migration nahi chahiye).
2. **`components/admin/marketing-panel.tsx`** — Analytics tab me ek
   naya card: "Trustpilot Review Invitations" toggle + "Integration Key"
   input, GA/Meta Pixel wale hi pattern me.
3. **`app/layout.tsx`** — hardcoded key hata di; ab admin settings se
   `trustpilot_enabled`/`trustpilot_integration_key` padh ke, sirf jab
   toggle ON ho aur key bhari ho, tabhi base script inject hoti hai.
4. **`app/order-confirmation/[id]/page.tsx`** aur
   **`components/analytics/trustpilot-invitation.tsx`** — pichle round
   jaisa hi (koi badlaav nahi) — order confirmation page par asli
   customer email/name/order-id ke saath invitation bhejta hai.

## Admin me kaise use karein

1. Admin → **Marketing** → **Analytics** tab kholo.
2. "Trustpilot Review Invitations" toggle **ON** karo.
3. **Integration Key** field me apni key daalo: `En3UPwL5Q09ZQO2G`
   (jo aapne Trustpilot ke JavaScript Integration page se copy ki thi).
4. **Save Analytics Settings** dabao.
5. Site reload karke check karo — order confirmation page par ab
   invitation jaana chahiye.

Agar kabhi integration band karni ho (naya account, ya temporarily rokna
ho), bas toggle OFF kar do — code me kuch chhedne ki zaroorat nahi.

`tsc --noEmit` clean pass ho gaya. `eslint` bhi clean hai — is file
(`marketing-panel.tsx`) me kuch pehle se maujood unrelated warnings/errors
hain (unescaped quote characters kahin aur file me), unka mere naye code
se koi lena-dena nahi — maine verify kiya ki wahi count pehle bhi tha.
