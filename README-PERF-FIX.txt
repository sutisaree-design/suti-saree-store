PERFORMANCE FIX — 3 files changed
==================================

Ye zip niche diye gaye same path structure mein hai jaisa tumhare project
mein hai — bas is zip ko apne "E-Commerce-ethnic" folder ke andar extract
karo (overwrite/replace confirm kar dena), phir git push kar dena.

Changed files:
  app/layout.tsx
  app/checkout/page.tsx
  components/providers.tsx

WHAT CHANGED
------------

1) app/layout.tsx
   - Root layout se `export const dynamic = 'force-dynamic'` hataya.
     Iski jagah `export const revalidate = 300` (5 min ISR) laga hai.
     Product/shop/home pages pehle se hi apna `revalidate = 60` set
     karte the, lekin root layout ka force-dynamic unko override kar
     raha tha -- har single page load pe fresh Supabase query chal rahi
     thi. Ab wo already-designed 60s caching kaam karegi -> faster
     page loads, poori site pe.
   - Razorpay <script> tag yahan se hata diya (pehle har page pe load
     ho raha tha, sirf checkout page ko chahiye tha).

2) app/checkout/page.tsx
   - `next/script` import add kiya, aur Razorpay checkout.js ko sirf
     is page ke andar (strategy="afterInteractive") load kiya. Ab
     baaki saari pages (home, shop, product, etc.) ye extra script
     load hi nahi karengi.

3) components/providers.tsx
   - LiveChatWidget, ActivityTracker, AffiliateTracker, UrgencyBanner,
     SaleCountdownBar, ExitIntentModal, SocialProofToast -- ye saare
     ab `next/dynamic(..., { ssr: false })` se lazy-load hote hain
     instead of static import. Pehle inka JS har page ke initial
     bundle mein chala jaata tha (hydrate hone tak page "sluggish"/
     click-lag feel hota tha). Ab ye components background mein
     load hote hain, page turant interactive ho jaata hai.

WHAT DID NOT CHANGE (important)
--------------------------------
- Koi database/Supabase schema change NAHI hai.
- Merchant feed route (app/api/merchant-feed/route.ts) apna alag
  force-dynamic already rakhta hai -- isse koi farak nahi padega.
- Image ka `unoptimized: true` config abhi chhua nahi gaya (wo agla
  step hai, isko phir se dekhenge).

BEFORE YOU PUSH
----------------
1. `npm install` (agar already nahi kiya)
2. `npm run build` local pe chala ke check kar lo koi error na aaye
3. Phir `git add -A && git commit -m "perf: fix ISR caching, lazy-load widgets, scope razorpay script to checkout" && git push`

Agle round mein image resize (sharp multi-size) wala fix denge --
uske liye ek DB column add karna hoga, thoda zyada steps honge.
