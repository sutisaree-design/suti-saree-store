VARIANT + COLOUR UPGRADE — CHANGED FILES
==========================================

Kya-kya add hua hai
--------------------
1. Product ke "Add colour variant" form mein ab ek ready-made COLOUR LIBRARY
   hai (30+ common saree/ethnic colours) — click karke select karo. Naya
   custom colour bhi type kar sakte ho (jo list mein nahi hai).
2. Har colour ka apna exact "colour type" (hex swatch) set kar sakte ho —
   colour-picker box se, ya library se select karte hi apne aap fill ho
   jata hai. Isse admin list mein aur product page ke colour-swatches mein
   asli colour dot dikhta hai (agar image abhi upload nahi hui ho).
3. Har colour variant mein ab alag se VIDEO URL bhi add kar sakte ho (jaise
   product ka video hota hai — waise hi, per-colour).
4. Image upload/import wala option pehle jaisa hi hai, koi change nahi.
5. Shop / Category / Home page ke product card ab us product ke DEFAULT
   colour variant ki photo dikhayenge, aur click karne par seedha usi
   default variant ke page par khulega.
6. Product page (PDP) par bhi — agar koi seedha base product URL se aaye
   (bina kisi colour ke), to automatically default colour variant load ho
   jayega, taaki har jagah se same colour open ho.

Files jo change/naye hain (isi folder structure mein hain, seedha apne
project root mein copy-paste/replace kar dena):

  supabase/migrations/20260721000000_variant_color_hex_and_video.sql   (NEW)
  lib/color-presets.ts                                                 (NEW)
  lib/variants-api.ts
  lib/types.ts
  lib/products-api.ts
  lib/products-api-server.ts
  components/product-card.tsx
  components/product/variant-swatches.tsx
  components/admin/product-variants-manager.tsx
  app/product/[slug]/product-detail.tsx

Zaroori step — DATABASE MIGRATION
----------------------------------
Naya migration file (`supabase/migrations/20260721000000_variant_color_hex_and_video.sql`)
Supabase project par RUN karna zaroori hai, warna variant ka colour_hex/
video field save nahi hoga (columns exist nahi karenge).

  - Agar Supabase CLI use karte ho: `supabase db push`
  - Nahi to Supabase Dashboard > SQL Editor mein jaake is file ka content
    paste karke run kar do:

      ALTER TABLE product_variants
        ADD COLUMN IF NOT EXISTS color_hex text,
        ADD COLUMN IF NOT EXISTS video text;

Baaki sab files sirf replace karo, code already type-check + lint karke
verify kiya hua hai (`npx tsc --noEmit` aur `eslint` dono clean pass hue).

Test kaise karo
-----------------
1. Migration run karo (upar wala SQL).
2. Files replace karo, `npm run build` (ya `next dev`) chala ke dekho.
3. Admin > Product > "Add colour" dialog kholke check karo — colour
   library dikhni chahiye, hex picker, aur video URL field.
4. Ek product par 2 colours add karo, ek ko "Default" mark karo.
5. Shop/Category page par jaake dekho — us product ka card default colour
   ki photo dikha raha hai ya nahi, aur click karne par sahi variant page
   khul raha hai ya nahi.
