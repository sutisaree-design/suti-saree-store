YE ZIP ME 3 FILES HAIN, IN 3 FIXES KE SAATH:

1) components/growth/live-viewers-badge.tsx
   Fix: POLL_MS 25000 se 60000 kiya (25 sec -> 60 sec polling)
   Apne repo me isi path pe file ko REPLACE karo:
   E-Commerce-ethnic/components/growth/live-viewers-badge.tsx

2) app/api/promotions/active/route.ts
   Fix: response me 30-second Cache-Control header add kiya
   Apne repo me isi path pe file ko REPLACE karo:
   E-Commerce-ethnic/app/api/promotions/active/route.ts

3) app/api/vendor-collection/[productId]/route.ts
   Fix: response me 5-minute Cache-Control header add kiya
   Apne repo me isi path pe file ko REPLACE karo:
   E-Commerce-ethnic/app/api/vendor-collection/[productId]/route.ts

KAISE KAREIN:
1. Is zip ko extract karo.
2. Har file ko apne "E-Commerce-ethnic" project folder ke EXACT SAME path
   pe copy-paste karo (overwrite/replace karna hai, upar diye gaye path
   dekh ke sahi jagah dalna).
3. Terminal me project folder khol ke:
   git add .
   git commit -m "reduce active cpu usage: cache promotions/vendor-collection, slow live-viewers polling"
   git push
4. Vercel apne aap naya deployment bana dega (agar GitHub se connected hai).
   Agar manual deploy karte ho toh "vercel --prod" chalao.
5. 3-4 din baad Vercel dashboard -> Usage -> Fluid Active CPU dobara check karo.
