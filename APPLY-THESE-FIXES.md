# Security fixes — Category A + Category B (reviews, blog, wholesale, bundles)

## How to apply

1. Unzip this into your repo root — folder structure matches the repo
   exactly (`app/`, `lib/`, `components/`, `supabase/migrations/`), so files
   will land in the right place. It will **overwrite** these existing files:
   - `lib/reviews-api.ts`
   - `lib/blog-api.ts`
   - `lib/wholesale-api.ts`
   - `lib/bundles-api.ts`
   - `components/admin/reviews-panel.tsx`

   All other files are new.

2. Run the new migrations against your Supabase project, in order (the
   filenames are already timestamped after your latest migration so they'll
   sort correctly):
   - `20260828010000_lock_dead_and_admin_only_tables.sql` (Category A —
     zero code dependency, safe alone)
   - `20260829000000_lock_reviews_writes.sql`
   - `20260829010000_lock_blog_posts_writes.sql`
   - `20260829020000_lock_wholesale_pricing_writes.sql`
   - `20260829030000_lock_product_bundles_writes.sql`

   **Important:** deploy the code changes (step 1) *before or together
   with* the last 4 migrations — those migrations remove the anon-key
   write access that the admin panel used to depend on directly. If the
   migrations land before the new code is live, the admin panel's
   reviews/blog/wholesale/bundles screens will briefly show errors until
   the new code is deployed.

3. `git add -A && git commit -m "security: lock down anon RLS writes on reviews, blog_posts, wholesale_pricing, product_bundles + dead/admin-only tables" && git push`

## What changed, table by table

| Table | Before | After |
|---|---|---|
| `contact_inquiries` | anon could read + update (dead table, unused) | service_role only |
| `activity_events` | anon could read all tracking events | service_role only (insert stays public) |
| `returns` | anon could update any return's status | service_role only |
| `email_automation_log` | anon could read/write | service_role only |
| `reviews` | anon could approve/reject/delete ANY review | owner can update own row; admin actions moved to `/api/admin/reviews` |
| `blog_posts` | anon could create/update/delete ANY post | writes moved to `/api/admin/blog-posts` |
| `wholesale_pricing` | anon could create/update/delete ANY price tier | writes moved to `/api/admin/wholesale` |
| `product_bundles` | anon could create/update/delete ANY bundle link | writes moved to `/api/admin/bundles` |

## Still open (not included here, on purpose)

`referral_codes` / `referrals` — these need a bit more care because
`referral_codes` SELECT is genuinely used for public code-validation at
checkout (a guest typing a friend's code), so it can't just be locked the
same way. Happy to do this one next as its own migration once you've
deployed and tested this batch.

Also two low-severity notes left inline in the migration files (not fixed,
just flagged): unapproved reviews and unpublished blog drafts are
technically readable by anon today — no PII/financial impact, just an
early look at content before it's meant to be visible.
