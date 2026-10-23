# Part 2 — Customer PII leak fix (single zip)

Extract this into your repo root — it will overwrite/add exactly these
files, nothing else:

```
supabase/migrations/20260826000000_lock_contact_and_subscribers_pii.sql   (new)
supabase/migrations/20260827000000_lock_orders_order_items_pii.sql       (new)
app/api/reseller/route.ts                                                (overwrite)
app/api/reseller/orders/route.ts                                         (overwrite)
app/api/order-confirm/route.ts                                           (overwrite)
app/api/chat/order-lookup/route.ts                                       (overwrite)
app/api/chat/email-order/route.ts                                        (overwrite)
app/api/social-proof/route.ts                                            (overwrite)
app/api/bundles/auto/route.ts                                            (overwrite)
```

Then:
1. `git add -A && git commit -m "Fix PII leak: lock RLS on contact_messages, subscribers, orders, order_items" && git push`
2. Run the migrations against Supabase (`supabase db push`, or paste both
   `.sql` files into the SQL editor in filename order — `20260826...`
   before `20260827...`). They're timestamp-named so `supabase db push`
   will apply them in the right order automatically.

## What changed and why
- `contact_messages` / `subscribers`: anon SELECT removed. No code
  depended on it (admin routes already used the service-role client).
- `orders` / `order_items`: anon SELECT removed. Logged-in customers can
  still see their own orders (by `user_id` or account email); everything
  else goes through the service role.
- 7 API routes switched from the public anon-key client to the
  service-role client for reading orders/order_items, since they were
  already doing their own authorization in code (login check, email
  match, order-id match) and only needed the open RLS as a side effect.

## Verify after deploy
- [ ] `/account/orders` shows your own orders when logged in
- [ ] Guest checkout still completes normally
- [ ] Reseller dashboard still shows orders/earnings
- [ ] Order confirmation email still sends
- [ ] Chat widget "track my order" works (logged-in and guest-by-email)
- [ ] Homepage "Someone in ___ just bought this" toast still appears
- [ ] "Customers who bought this also bought" still populates
- [ ] Product review eligibility ("verified buyer") still works
- [ ] `curl` (or REST client) hitting `.../rest/v1/orders` with just the
      anon key now returns nothing
