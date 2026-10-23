# Vendor/Reseller SEO landing pages — admin-manageable version

## New files (add these)
- app/vendor-registration/page.tsx
- app/vendor-login/page.tsx
- app/reseller-registration/page.tsx
- app/reseller-login/page.tsx
- app/sell-with-us/layout.tsx           (adds title/description to the existing form page)
- components/admin/partner-pages-panel.tsx   (new admin panel to edit all 4 pages)

## Modified files (replace these — full file, not a diff)
- lib/settings-api.ts        → added PartnerPagesContent type + fetch/save (new setting key: `partner_pages_content`)
- components/admin/admin-shell.tsx → added "Partner Pages" nav item under Marketing
- app/admin/page.tsx          → registered the new panel
- components/footer.tsx       → added "Partner With Us" column with all 4 links
- app/sitemap.ts              → added all 4 pages (+ /sell-with-us) to sitemap.xml

## Where to manage it
Admin panel → **Marketing → Partner Pages**. From there you can edit, for
all 4 pages: headline, subtext (also used as the page's meta description),
button text, and — for the two registration pages — the 4 "how it works"
steps and 3 FAQs. Save writes to the `settings` table under key
`partner_pages_content`; the public pages read it live (no rebuild needed
to see text changes — Next just re-renders the page fresh each request).
"Reset to default text" puts back the original copy if you want to start over.

## Why this structure (unchanged from before)
`/vendor/*` and `/account/*` require login (middleware.ts). A logged-out
visitor — including Googlebot — gets redirected to `/login` before any
content loads, so nothing under those paths can rank for "vendor login",
"reseller login", etc. These 4 pages live outside those protected paths on
purpose, with real keyword-matched titles/descriptions, and link into the
actual login/registration flow. The login/auth logic itself was not touched.

## After you copy these files in
1. `git add -A && git commit -m "Add admin-manageable vendor/reseller SEO landing pages" && git push`
2. Deploy.
3. Go to Admin → Marketing → Partner Pages and adjust copy if you want
   (optional — defaults are already filled in and ready to go live).
4. In Google Search Console:
   - Sitemaps → resubmit `https://www.aruhihandlooms.com/sitemap.xml`
   - URL Inspection → paste each of the 4 new URLs → "Request Indexing"
5. Indexing takes a few days to a couple of weeks; ranking well for
   competitive terms takes longer and depends on more than just the page
   existing (backlinks, content depth, competition).

## Google policy / GMC note
No policy risk. These are ordinary, honest content pages describing a real
registration/login flow — not cloaking, not doorway pages, not keyword
stuffing. Google Merchant Center policies govern your *product feed*
(pricing, availability, business info) — these pages are unrelated to GMC
and won't affect your product listing status.
