# Google Customer Reviews (opt-in + badge)

Zip ke andar ki files apne project mein usi path par replace/add karein:

- lib/google-customer-reviews.ts                              (NEW)
- components/analytics/google-customer-reviews-optin.tsx      (NEW)
- components/analytics/google-customer-reviews-badge.tsx      (NEW)
- app/order-confirmation/[id]/page.tsx                        (CHANGED)
- app/layout.tsx                                              (CHANGED)

No SQL / no new package. Deploy ke baad:

1. Naya order place karo -> order-confirmation page par Google ka survey opt-in popup dikhna chahiye.
2. Site ke bottom-left mein Google badge dikhega. Rating banne tak "Rating not available" likha aayega.
   Badge band karna ho: env NEXT_PUBLIC_GCR_BADGE=off (redeploy).
3. Merchant Center -> Google Customer Reviews mein opt-in verify hone mein kuch din lag sakte hain.

Optional env: NEXT_PUBLIC_GCR_MERCHANT_ID (default 5830177505).
Estimated delivery date = order date + dispatch max + "rest of India" delivery max
(Admin > Marketing > Shipping & Returns Timing).
