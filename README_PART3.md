# Part 3 — Settings credential leak fix (single zip)

Extract into your repo root — overwrites/adds exactly these files:

```
app/api/admin/settings/email/route.ts             (new)
app/api/admin/settings/social-publish/route.ts     (new)
components/admin/settings-panel.tsx                (overwrite)
components/admin/marketing-panel.tsx               (overwrite)
lib/settings-api.ts                                (overwrite)
supabase/migrations/20260828000000_lock_settings_secrets.sql  (new)
```

## Deploy order — same rule as Part 2

1. Extract, `git add -A && git commit -m "Fix settings credential leak: admin-only email/social-publish settings" && git push`
2. **Wait for the Vercel deployment to say Ready / Production**, same as last time.
3. **Only then** run `supabase/migrations/20260828000000_lock_settings_secrets.sql` (via `supabase db push` or the SQL editor).

If you run the SQL before the new code is live, Admin → Settings → Email
and Admin → Marketing → Social Auto-Post will silently stop
loading/saving (old code still calling the anon client directly).

## What changed and why
- Two new admin routes (`/api/admin/settings/email`,
  `/api/admin/settings/social-publish`) — both check the admin session
  cookie (same `verifyAdminToken()` pattern as `contact-messages`) and
  use the service-role client. These are now the *only* way to
  read/write the `email_provider` and `social_publish` settings rows.
- `settings-panel.tsx` / `marketing-panel.tsx` now call those routes
  via `fetch()` instead of reading/writing `settings` directly with the
  public anon key.
- `lib/settings-api.ts` — removed `fetchEmailSettings`,
  `saveEmailSettings`, `fetchSocialPublishSettings`,
  `saveSocialPublishSettings` (the anon-key versions) so they can't be
  accidentally reintroduced. Types/defaults are still exported since
  the panels and the new routes both use them.
- `lib/social-publish-api.ts` — untouched, it already used the service
  role internally.
- Migration: `settings` SELECT/write policies now exclude
  `email_provider` and `social_publish` for anon/authenticated; only
  the service role can touch those two keys. Every other settings key
  (store_info, shipping, banners, SEO, etc.) is untouched and stays
  publicly readable, since the storefront needs that.

## Verify after deploy + SQL
- [ ] Admin → Settings → Email tab still loads and saves correctly
- [ ] Admin → Marketing → Social Auto-Post tab still loads and saves correctly
- [ ] Auto-posting a new product to Facebook/Instagram/Threads still works
- [ ] Storefront still loads normally (homepage banner, shipping calc, SEO meta tags, AI chat widget) — these use OTHER settings keys, unaffected
- [ ] `curl` with just the anon key against
      `.../rest/v1/settings?key=eq.email_provider` and
      `.../rest/v1/settings?key=eq.social_publish` now returns `[]`
- [ ] Same curl against `.../rest/v1/settings?key=eq.store_info` still
      returns data (this one is supposed to stay public)

## Not covered by this fix (flagging, not fixing — say the word if you want it)
Every OTHER settings key is still anon-**writable**, not just readable
— e.g. someone with just the anon key could currently overwrite
`store_info`, `shipping`, or `site_banner` (defacement/business-logic
risk, not a secret leak). Locking that down means moving each "save"
call in `settings-panel.tsx`/`marketing-panel.tsx` behind an
admin-token route, same pattern as this fix. Can do as a follow-up
Part 4 if you want it.
