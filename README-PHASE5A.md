# Phase 5A — Vendor KYC Document Upload

## Naye files
- `supabase/migrations/20260810000000_phase5a_vendor_kyc.sql` — `vendor_kyc_documents` table + private `vendor-kyc-documents` storage bucket
- `app/api/vendor/kyc/route.ts` — vendor-facing GET (apne docs list) / POST (upload/re-upload)
- `app/api/admin/vendor-kyc/route.ts` — admin-facing GET (`?vendor_id=` optional filter) / PUT (verify/reject)
- `app/vendor/dashboard/kyc/page.tsx` — vendor KYC upload page (PAN, GST, Bank Proof — 3 cards)

## Modified files
- `app/vendor/layout.tsx` — nav me "KYC Documents" link add kiya
- `lib/vendor-api.ts` — KYC helper functions (`fetchMyVendorKyc`, `uploadVendorKycDocument`, `fetchAdminVendorKyc`, `reviewAdminVendorKyc`)
- `components/admin/vendors-panel.tsx` — har vendor card ke andar collapsible "KYC Documents" section, docs list + Verify/Reject buttons

## Kaise apply karein
1. Ye saare files apne repo me same path par replace/add kar dein (ya `CHANGES.diff` ko `git apply CHANGES.diff` se apply karein)
2. Supabase dashboard me migration run karein: naya SQL editor me `20260810000000_phase5a_vendor_kyc.sql` ka content paste + run karein (ya CLI se `supabase db push` agar migrations folder link hai)
3. `git add -A && git commit -m "Phase 5A: vendor KYC document upload" && git push`

## Security design (jaisa aapne bola tha)
- Bucket `vendor-kyc-documents` **private** hai (`public: false`) — koi permanent public URL kabhi nahi milta
- Storage par anon/authenticated ke liye koi policy hi nahi hai — direct browser upload/download IMPOSSIBLE hai, sab kuch service-role client se server routes ke through hota hai
- `vendor_kyc_documents` table par bhi RLS on hai lekin koi anon/authenticated policy nahi — sirf server routes access kar sakte hain
- Vendor route (`/api/vendor/kyc`) khud verify karta hai ki logged-in user ka `vendors.user_id` match karta hai us vendor_id se jiske docs access ho rahe hain (RLS-aware client se), tabhi service-role client se kaam karta hai
- Admin route (`/api/admin/vendor-kyc`) existing admin-cookie pattern follow karta hai (jaisa `bank_update` aur `vendors` admin routes karte hain)
- File view/download hamesha ek **signed URL** (5 minute expiry) se hota hai, kabhi permanent link nahi
- Re-upload purane file ko storage se delete karke replace karta hai, aur status wapas "pending" ho jata hai (re-review ke liye)

## Access-policy verify kaise karein
1. **Vendor apna dekh sake**: Vendor A login karke `/vendor/dashboard/kyc` par jaake PAN/GST/Bank proof upload karein — turant list me dikhna chahiye
2. **Vendor doosre ka na dekh sake (IDOR test)**: Vendor A ke session se `/api/vendor/kyc` call karein — response me sirf Vendor A ke docs aane chahiye (route khud `getOwnVendorId()` se resolve karta hai, ID URL me pass hi nahi hoti, isliye IDOR possible hi nahi)
3. **Admin sab dekh sake**: Admin panel → Vendors → kisi bhi vendor card par "KYC Documents" click karke docs open honi chahiye, Verify/Reject button test karein
4. **Public URL na bane**: Browser devtools me uploaded file ka URL check karein — usme ek signature/token query param hona chahiye aur 5 min ke baad expire ho jana chahiye; Supabase dashboard → Storage → `vendor-kyc-documents` bucket → koi bhi file ka "Get URL" try karein bina signed-url ke — access denied aana chahiye
