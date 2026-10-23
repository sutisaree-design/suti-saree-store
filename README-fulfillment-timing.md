# Shipping & Returns Timing — single source of truth

## What changed
A new setting `fulfillment_settings` (stored the same way as your other
Admin > Marketing settings — no database migration needed) now drives every
place on the site that mentions dispatch time, delivery time, the return
window, or the cancellation window:

- Product page → "Shipping & Returns" tab + the "X-day Returns" badge
- Checkout page → trust badges ("Easy X-Day Returns")
- Homepage hero → "Free shipping over ₹X" (now pulled from your real GST &
  Shipping settings, so it can never disagree with what checkout charges)
- Legal pages (`/legal/shipping-policy`, `/legal/refund-policy`) — via
  `{{tokens}}` you place in the text (see below)
- Live chat widget + AI chat assistant fallback answers
- Order detail page's return-eligibility check (the actual 7-day gate that
  decides whether "Request Return" is shown)
- **Google Merchant Center feed** (`/api/merchant-feed`) — now declares
  `g:min_handling_time`, `g:max_handling_time`, `g:min_transit_time`,
  `g:max_transit_time`, and a `g:shipping` price block, sourced from the
  same numbers. This is the part that actually matters for avoiding a
  Merchant Center shipping/returns misrepresentation flag — Google checks
  the feed's own declared numbers against what it can see on your site.

## Where to set the numbers
**Admin > Marketing & SEO > "Shipping & Returns Timing"** (new tab, first
in the list). Fields: dispatch min/max days, delivery days for metro/other
cities/remote areas, cancellation window (hours), return window (days).
Save once — it updates everywhere listed above immediately (product page
values are fetched client-side on page load; the merchant feed re-reads it
on every fetch since it's a live route).

## One manual step for your existing Legal Pages text
Your Shipping Policy and Refund & Cancellation Policy pages already have
custom text saved in the database from before. That text is NOT touched
automatically (so nothing on your live site changes on deploy). To wire
them into the single source of truth:

1. Go to **Admin > Marketing & SEO > Legal Pages**
2. Select "Shipping Policy" (or "Refund & Cancellation Policy")
3. Click **"Replace with ready-made template (tokens included)"** — this
   drops in a template using `{{dispatch_days}}`, `{{metro_days}}`,
   `{{other_days}}`, `{{remote_days}}`, `{{return_days}}`,
   `{{cancellation_hours}}` instead of hardcoded numbers
4. Adjust the wording/contact details as you like, then Save

From then on, any future change to the Shipping & Returns Timing tab
automatically updates the wording on both legal pages, the chat widget, and
the AI assistant — all without editing that text again.

## Files changed
See `fulfillment-timing-changes.patch` for the full diff, or just replace
each file in your repo with the version in this zip at the same path.

No new Supabase tables or columns — everything rides on the existing
`settings` key/value table.
