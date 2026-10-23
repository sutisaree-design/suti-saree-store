LIVE VIEWERS WIDGET — "X people are viewing this right now"
=============================================================

Kya add hua (5 files):

1. lib/growth-api.ts
   - GrowthSettings mein 3 naye fields: live_viewers_enabled,
     live_viewers_window_minutes, live_viewers_min_to_show
   - fetchLiveViewerCount(productId) helper add kiya

2. app/api/live-viewers/route.ts  (NAYI FILE)
   - GET /api/live-viewers?product_id=xxx
   - Real activity_events table se product_view events count karta hai
     (distinct session_id, last N minutes) — koi fake number nahi

3. components/growth/live-viewers-badge.tsx  (NAYI FILE)
   - Storefront widget: "12 people are viewing this right now"
   - Har 25 second mein poll karke count refresh karta hai
   - Admin ke set kiye hue minimum se kam count ho to khud hide ho jata hai

4. app/product/[slug]/product-detail.tsx
   - LiveViewersBadge ko LowStockBadge ke paas product page pe mount kiya

5. components/admin/marketing-panel.tsx
   - Admin > Marketing > Growth Tools mein naya "Live viewers" section:
     - ON/OFF switch
     - "Count window (minutes)" input (default 15)
     - "Only show badge when count is at least" input (default 2)


APPLY KAISE KAREIN
===================
1. Is zip ke andar ke folders/files apne repo mein SAME PATH pe copy-paste
   karke replace karo (jaise Windows Explorer mein aap already dekh rahe ho):
     lib/growth-api.ts
     app/api/live-viewers/route.ts
     components/growth/live-viewers-badge.tsx
     app/product/[slug]/product-detail.tsx
     components/admin/marketing-panel.tsx

2. Terminal mein apne repo folder mein jaake:
     git add lib/growth-api.ts app/api/live-viewers/route.ts components/growth/live-viewers-badge.tsx "app/product/[slug]/product-detail.tsx" components/admin/marketing-panel.tsx
     git commit -m "feat: add live viewers widget (X people viewing this right now)"
     git push

3. Deploy hone ke baad:
   - Admin > Marketing > Growth Tools > "Live viewers" section mein switch ON karo, Save karo
   - Kisi product page ko 2 alag browsers/tabs se khol ke visit karo
     (activity_events mein real product_view events banane ke liye)
   - Product page reload karo — badge dikhna chahiye agar count >= minimum set kiya hua hai

NOTE: Ye koi fake/simulated count nahi hai — sirf real visitors ka count hai jo
us product ko us waqt dekh rahe hain (session-based, last N minutes).
Isliye kam-traffic products pe badge nahi dikhega jab tak enough log na dekh rahe ho —
yahi wajah hai "minimum to show" setting rakhi gayi hai.
