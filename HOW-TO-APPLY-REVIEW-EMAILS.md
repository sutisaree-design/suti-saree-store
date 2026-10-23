# Review-request emails — how to apply

Isme 8 files hain: 6 EDIT hue hain, 2 bilkul NAYI hain.

## 1. Files copy/replace karo

Apne local repo (`E-Commerce-ethnic`) mein, is zip ke andar wahi folder
structure hai jo repo mein hai — bas har file ko usi path par copy/replace
kar do:

- `lib/email-templates.ts` — EDIT (2 naye email templates add hue: review
  request + reminder)
- `lib/cron-jobs.ts` — EDIT (2 naye daily jobs add hue)
- `app/api/cron/daily-jobs/route.ts` — EDIT (naye jobs ko daily cron mein
  wire kiya)
- `app/api/admin/orders/[id]/delivery-test/route.ts` — EDIT (admin "Test"
  panel se manually fire karne ke liye)
- `app/api/admin/orders/[id]/preview-email/route.ts` — EDIT (email preview
  ke liye)
- `components/admin/delivery-notification-tester.tsx` — EDIT (admin UI mein
  naye buttons)
- `lib/review-notifications.ts` — **NAYI FILE**
- `supabase/migrations/20260922140000_review_request_email_columns.sql` —
  **NAYI FILE**

`changes.diff` bhi diya hai agar `git apply changes.diff` karna chaho
(diff wahi cheez hai jo upar files mein hai, bas ek file mein).

## 2. Supabase migration run karo

Ye naya migration file `orders` table mein 2 columns add karta hai
(`review_request_email_sent_at`, `review_reminder_email_sent_at`). Agar
Supabase CLI use karte ho:

```
supabase db push
```

Ya phir Supabase dashboard > SQL Editor mein jaake migration file ka
content paste karke run kar do.

## 3. Git push

```
git add .
git commit -m "Add automatic review-request + reminder emails after delivery"
git push
```

Deploy hone ke baad koi extra env variable nahi chahiye — same
`NEXT_PUBLIC_SITE_URL` aur email sending setup use hota hai jo pehle se hai.

## Ye kya karta hai (recap chat mein bhi diya hai)

- Order "delivered" hone ke ~4 din baad customer ko ek "Rate & Review"
  email jaata hai — usme seedha unke order page ka link hota hai jahan
  star rating + written review + **photo upload** (max 4 photos, already
  built) sab ek jagah hai.
- Agar customer ~7 din tak bhi review nahi karta, to ek hi reminder email
  jaata hai — jo already review kar chuke hain unko ye reminder kabhi nahi
  jaata (DB check karke skip hota hai).
- Dono emails Admin > Orders > (order expand karo) > "Test Notifications"
  panel se manually bhi trigger kiye ja sakte hain — preview dekh sakte ho
  ya apne inbox par test copy bhej sakte ho.
