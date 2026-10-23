# Google Loyalty - member list (Customer Match)

## Code side
1. Replace/add these files, then git push (Vercel deploys):
   - app/api/admin/loyalty/export/route.ts   (NEW)
   - components/admin/loyalty-panel.tsx      (UPDATED)
   No SQL migration needed.
2. Admin -> Loyalty -> click "Google member list (all)" -> loyalty-members-all.csv downloads.

## Google Ads side
1. ads.google.com -> Tools -> Audience manager -> Your data segments -> (+) -> Customer list.
2. Upload loyalty-members-all.csv (columns: Email, Phone, First Name, Last Name, Country, Zip).
3. Name it e.g. "Loyalty members - Tier 1", accept the Customer Match policy, create.
4. Open the list -> Customer type -> "Loyalty program members" -> choose the tier that matches Merchant Center (Tier 1).
5. Wait 24-48 hrs (min ~1000 matched users needed to serve).

## Merchant Center
Loyalty programs -> "Provide your loyalty program member list" -> Set up (opens Google Ads). Once Google Ads shows the list as loyalty, the warning banner clears.

## Refresh
Re-download and re-upload (or add a new upload to same list) every 2-4 weeks or after many new signups.
