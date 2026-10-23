# Phase 5B — Admin Monthly Reporting
(this zip also carries Phase 5A's files, since they're the same working
tree and a couple of shared files — `lib/vendor-api.ts`,
`components/admin/vendors-panel.tsx`, `app/vendor/layout.tsx` — now hold
both phases' changes. If you already applied the Phase 5A zip, these are
safe to overwrite again; they're a superset, not a conflict.)

## Naye files (Phase 5B)
- `app/api/admin/vendor-monthly-report/route.ts` — GET, `?month=YYYY-MM&format=json|csv|pdf`
- `lib/vendor-report-pdf.ts` — PDF layout for the monthly report (uses `pdf-lib`, same style as the existing invoice PDF)
- `components/admin/vendor-reports-panel.tsx` — admin UI: month picker + table + Export CSV / Export PDF buttons

## Modified files
- `lib/vendor-api.ts` — added `fetchAdminVendorMonthlyReport()` + `downloadAdminVendorMonthlyReport()`
- `components/admin/admin-shell.tsx` — new "Vendor Reports" nav item under Sourcing, `vendor-reports` added to `AdminSection`
- `app/admin/page.tsx` — wired `VendorReportsPanel` into the section map

## Koi migration NAHI hai is phase me
Report existing tables (`order_items`, `vendor_settlements` — dono Phase 4A me bane) se hi calculate hota hai, koi naya column/table nahi chahiye.

## Report kya calculate karta hai
Ek diye gaye calendar month ke liye, har vendor ke un `order_items` par jo `stage = 'delivered'` hain aur `delivered_at` us month me aata hai:
- **Total Sales** = sum(price × quantity)
- **Handling Fee Collected** = sum(fee_amount) — Phase 4A me delivery ke time lock ho chuka value
- **Payable** = sum(vendor_payable_amount)
- **Paid** = Payable ka wo hissa jiska `settlement_id` kisi `status = 'paid'` settlement se linked hai
- **Pending** = Payable − Paid (ya to abhi kisi settlement me batch hi nahi hua, ya batch hua par abhi paid mark nahi hua)

Note: ek vendor ka **Paid** aur **Pending** dono > 0 ho sakte hain same month me — kyunki settlement weekly batches me hoti hai (Phase 4A), month-boundary se align nahi.

## Kaise apply karein
1. Files same path par replace/add karein (ya `CHANGES.diff` ko `git apply CHANGES.diff` se apply karein — isme Phase 5A ka diff bhi included hai)
2. Koi Supabase migration run karne ki zaroorat nahi is phase ke liye (agar Phase 5A abhi tak run nahi kiya, uska migration alag se run karna hoga)
3. `git add -A && git commit -m "Phase 5B: vendor monthly report" && git push`

## Naya route/component kaha bana (jaisa poocha tha)
- API route: `/api/admin/vendor-monthly-report` (GET only, admin-cookie protected)
- UI component: Admin panel → sidebar → **Sourcing → Vendor Reports** (naya section, existing "Vendor Settlements"/"Vendor Ops" ke sath group me)

## Test kaise karein
1. Admin panel → Vendor Reports pe jao — current month ka data load hoga (agar koi delivered vendor order nahi hai us month me, "No delivered vendor orders" dikhega)
2. Month picker / ← → arrows se pichhle mahine dekho
3. "Export CSV" aur "Export PDF" dono buttons try karo — file download honi chahiye, PDF me har vendor ki row + ek Total row honi chahiye
4. Cross-check: kisi ek vendor ka Payable yahan wahi hona chahiye jo "Vendor Settlements" panel me us mahine ke settlements ka sum hota hai (agar sab settled ho chuke hain us month ke liye)
