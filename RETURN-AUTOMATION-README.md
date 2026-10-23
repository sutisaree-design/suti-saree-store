# Return Pickup + Refund Automation — What's New

## Kya build hua

1. **Customer return request** (`/api/returns` — POST)
   - Ab return/exchange request server route se jaati hai (pehle direct DB insert tha).
   - Customer ko turant confirmation email milta hai; store ke `support_email` par bhi notification jaata hai.

2. **Admin approve → automatic reverse pickup**
   - Jab admin ek return **approve** karta hai, aur automation mode **Automatic** hai, to Delhivery par reverse pickup (RVP) shipment turant ban jaati hai — koi manual step nahi.
   - Customer ko waybill/AWB number ke saath email milta hai.
   - Manual mode mein admin "Schedule Reverse Pickup" button se khud trigger karega.

3. **Daily tracking check → automatic refund**
   - Ek naya daily cron job (`runReturnPickupTrackingJob`, `/api/cron/daily-jobs` mein already wired) har pending pickup ka Delhivery tracking check karta hai.
   - Jaise hi status "Delivered" (warehouse tak wapas pahunch gaya) dikhta hai:
     - Customer ko "item receive ho gaya" email jaata hai.
     - **Automatic mode** mein — agar order online-paid tha — Razorpay refund turant fire ho jaata hai, aur customer ko refund confirmation email milta hai.
     - **Manual mode** mein — refund `pending_manual` flag ho jaata hai, admin "Process Refund Now" button se trigger karega.
   - Koi bhi step fail ho (Delhivery ya Razorpay error) to store ke `support_email` par alert email jaata hai, taaki kuch silently stuck na rahe.

4. **Admin ek hi master toggle** (Admin → Returns panel ke top par)
   - **Automatic**: pickup + refund dono khud-ba-khud honge.
   - **Manual**: dono steps ke liye admin ko button dabana padega (available hamesha, chahe automation on ho ya off).

5. **Admin panel visibility** (Admin → Returns)
   - Har return card par: pickup status (Not scheduled / Scheduled / Picked up / In transit / Received / Failed) + AWB number.
   - Refund status (Pending / Processing / Refunded / Failed / Manual pending / Not applicable for COD).
   - Buttons: **Schedule Reverse Pickup**, **Check Pickup Status**, **Process Refund Now** — jab bhi zaroorat pade.

## Setup / deploy steps

1. **Supabase migration**: `supabase/migrations/20260803000000_return_pickup_refund_automation.sql` ko apne Supabase project par run karo (SQL editor ya CLI se) — ye `returns` table mein naye columns aur `return_automation` setting add karta hai.
2. Env vars already hone chahiye (`DELHIVERY_API_TOKEN`, `DELHIVERY_ENV`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`) — inhe touch nahi kiya gaya hai.
3. Ensure Admin → Settings mein **Delhivery pickup/warehouse location** already filled hai (wahi address reverse pickup ke "return to" address ke roop mein use hota hai).
4. Deploy karo — Vercel cron already `/api/cron/daily-jobs` par set hai, koi naya cron schedule add karne ki zaroorat nahi (Hobby plan ke 2-cron limit ke andar hi fit ho gaya).
5. Files replace/push karne ke baad ek baar Admin → Returns panel khol ke automation toggle check kar lena (default: **Automatic**).

## Files changed/added
- `supabase/migrations/20260803000000_return_pickup_refund_automation.sql` (new)
- `lib/delhivery-api.ts` — `createDelhiveryReversePickup()` added
- `lib/return-automation.ts` (new) — shared pickup/refund orchestration
- `lib/cron-jobs.ts` — `runReturnPickupTrackingJob()` added
- `lib/email-templates.ts` — new customer/admin email templates
- `lib/settings-api.ts` — `ReturnAutomationSettings` fetch/save
- `app/api/returns/route.ts` (new) — customer return request endpoint
- `app/api/admin/returns/[id]/route.ts` — approve→pickup, refunded→Razorpay wiring
- `app/api/admin/returns/[id]/schedule-pickup/route.ts` (new)
- `app/api/admin/returns/[id]/refund/route.ts` (new)
- `app/api/admin/returns/[id]/check-pickup/route.ts` (new)
- `app/api/admin/returns/route.ts` — include `payment_method` for the panel
- `app/api/cron/daily-jobs/route.ts` — wired in the new job
- `app/api/cron/return-pickup-tracking/route.ts` (new) — manual/testing trigger
- `components/admin/returns-panel.tsx` — toggle + status badges + action buttons
- `components/account/return-request-button.tsx` — now calls `/api/returns`

Verified: `tsc --noEmit` clean, `next lint` clean on all changed files, `next build` compiles (only failure is a sandbox network block on Google Fonts — unrelated to this change).
