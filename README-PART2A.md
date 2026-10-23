# Part 2a — files to replace

Extract this zip into your repo root (`E-Commerce-ethnic/`), letting it overwrite/create:

- `app/api/promotions/active/route.ts`   → NEW file (new folder)
- `lib/promotions-api.ts`                → REPLACE (only added code at the bottom, nothing removed)
- `lib/cart-context.tsx`                 → REPLACE (only added an import + one new function block,
                                             nothing existing was changed/removed)

## What changed
- New public route `GET /api/promotions/active` — returns every currently active promotion,
  and for `scope='collection'` ones, also the live `product_ids` in that collection (resolved
  server-side with the service-role client, since `collection_products` has no public RLS policy).
- `lib/promotions-api.ts` — added `fetchActivePromotions()` + `ActivePromotion` type, calling
  that new route.
- `lib/cart-context.tsx` — added a standalone `computeBogoDiscount(items, activePromotions)`
  function. It's exported but **not yet wired into CartContext state or any UI** — that's Part 2b.

## After replacing
```
git add -A
git commit -m "Part 2a: BOGO discount logic + active-promotions API (not wired into cart yet)"
git push
```

Nothing changes on screen after this — that's expected for 2a. Send me a message when you want
Part 2b (wires this into the cart state + shows the "BOGO offer applied" line in the cart drawer).
