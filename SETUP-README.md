# Phase 7 — Returns/Refunds Admin + Email Notifications + Cart Recovery

## 1. Files kaise replace karein
Yeh zip sirf **naye aur badle hue files** ka hai (poora project nahi). Apne local project folder
(`E-Commerce-ethnic`) ke andar isi folder structure ke saath extract/copy kar do — same paths pe
overwrite/create ho jayenge:

- `supabase/migrations/20260718000000_returns_refund_amount.sql`  → NEW
- `lib/email.ts`                                                  → NEW
- `lib/email-templates.ts`                                        → NEW
- `vercel.json`                                                   → NEW
- `app/api/order-confirm/route.ts`                                 → NEW
- `app/api/cart-track/route.ts`                                    → NEW
- `app/api/cron/abandoned-carts/route.ts`                          → NEW
- `app/api/admin/returns/route.ts`                                 → NEW
- `app/api/admin/returns/[id]/route.ts`                            → NEW
- `app/api/admin/abandoned-carts/route.ts`                         → NEW
- `app/api/admin/abandoned-carts/[id]/send/route.ts`               → NEW
- `components/admin/returns-panel.tsx`                             → NEW
- `components/admin/abandoned-carts-panel.tsx`                     → NEW
- `app/api/admin/delhivery/create-shipment/route.ts`               → REPLACE (shipped email added)
- `app/admin/page.tsx`                                             → REPLACE (2 new tabs added)
- `app/checkout/page.tsx`                                          → REPLACE (email tracking + confirm email)

## 2. Supabase mein SQL run karna hoga
Supabase Dashboard → SQL Editor → naya query → is file ka poora content paste karke Run karo:

`supabase/migrations/20260718000000_returns_refund_amount.sql`

Yeh sirf `returns` table mein 2 columns add karta hai (`refund_amount`, `resolved_at`) — koi existing
data delete/change nahi hota, safe hai.

(`returns` aur `abandoned_carts` tables already tumhare DB mein hain — unhe dobara banane ki zarurat nahi.)

## 3. Email provider — ab admin panel se hi configure hota hai
Ab tumhe env variables mein `RESEND_API_KEY` waghera daalne ki zarurat **nahi hai**. Admin panel
kholo → **Settings** tab → sabse neeche **"Email Notifications"** section:

1. **Provider** dropdown mein "Zoho ZeptoMail" select karo.
2. **ZeptoMail account region** — apne Zoho dashboard ka URL check karo: agar `zoho.in` hai to
   "India" select karo, agar `zoho.com` hai to "Global".
3. **ZeptoMail API token** — Zoho Mail Admin → ZeptoMail → Mail Agents → apna agent kholo →
   API tokens se "Send Mail" token copy karo, poora paste karo (agar `Zoho-enczapikey ` prefix
   ke saath dikhaya gaya hai to woh bhi saath rakho).
4. **From name / From email address** — jis domain se email bhejna hai, woh pehle Zoho
   ZeptoMail mein verify karna hoga (SPF/DKIM records) warna emails spam mein jayenge ya bounce
   ho jayenge.
5. "Save Email Settings" click karo.
6. Neeche apna email daal ke **"Send test email"** button se turant verify kar lo ki setup
   sahi hai.

Baad mein kabhi Resend pe switch karna ho to bas dropdown se "Resend" select karke uski API key
daal dena — koi redeploy nahi chahiye.

### ⚠️ Security note (zaroor padhna)
Yeh app abhi Supabase ki bahut open RLS policies pe chal raha hai — matlab `settings` table
(jahan yeh API key store hoti hai) tumhare Supabase project ke anon/public key se **koi bhi**
seedhe query karke padh sakta hai, sirf admin panel se hi nahi. Yeh poore project ka existing
design hai (orders, products, sab kuch waise hi khula hai) — Delhivery ka token isiliye already
`.env` mein rakha gaya tha, is table mein nahi.

Do options hain:
- **Aasan (abhi ke liye theek hai):** Jaisa upar bataya, admin panel se hi save karo. Chhoti
  shop ke liye practically low-risk hai, lekin API key thoda expose rehta hai.
- **Zyada secure:** Supabase → SQL Editor mein `settings` table ki RLS policy tighten karo taaki
  sirf `key != 'email_provider'` wale rows anon ko dikhein, aur server-side ek Supabase
  **service_role** key (jo RLS bypass karti hai) env var mein daal ke use karo email settings
  padhne ke liye. If yeh chahiye to bata dena, main woh migration + code change bhi bana dunga.

### Still-needed env vars (email provider ke alawa)
Add these in `.env` (local) and Vercel → Settings → Environment Variables:
```
CRON_SECRET=koi_bhi_random_secret_string
NEXT_PUBLIC_SITE_URL=https://your-vercel-domain.vercel.app
```
- `CRON_SECRET` — koi bhi random string; Vercel Cron isse automatically header mein bhejta hai.
- `NEXT_PUBLIC_SITE_URL` — cart recovery email ke "Complete your purchase" button ke link ke liye.



## 4. Vercel Cron — Hobby/Free plan
Tum Hobby (free) plan pe ho, jahan cron sirf **din mein ek baar** chal sakta hai. Isliye
`vercel.json` mein schedule ab **roz raat 3:00 AM IST (21:30 UTC)** pe set kar diya hai
(`"30 21 * * *"`) — jab traffic sabse kam hota hai.

Iska matlab: jo bhi cart 1+ ghante se abandoned hai, use is daily run ke time recovery email
milega (turant nahi, roz ek baar batch mein). Agar future mein zyada frequent (hourly) recovery
chahiye ho, to Vercel Pro plan lena hoga, ya ek free external cron service (jaise cron-job.org)
use karke `https://your-domain.vercel.app/api/cron/abandoned-carts` ko har ghante
`Authorization: Bearer <CRON_SECRET>` header ke saath hit karwa sakte ho — code already isko
support karta hai, sirf trigger ka source badalta hai.

**Vercel pe deploy karne ke baad ek baar zaroor check karo:** Project → Settings → Cron Jobs
mein yeh entry dikhni chahiye. Agar nahi dikh rahi to `vercel.json` root folder mein hi hona
chahiye (jahan `package.json` hai) — ismein woh already hai.

## 5. Kya-kya naya kaam karega
- **Order confirmation email** — COD ya online payment, dono ke baad customer ko automatically email jayega.
- **Shipped email** — jab admin "Create Shipment" karega, customer ko tracking number ke saath email jayega.
- **Returns/Refunds admin processing** — Admin → "Returns" tab: status change (approved/rejected/refunded/completed),
  refund amount aur note daal sakte ho — save karte hi customer ko email chala jayega.
- **Abandoned cart recovery** — checkout page pe jaise hi customer email type karta hai (cart khali nahi ho),
  1.5 second baad background mein track ho jata hai. 1 ghante baad bhi order complete nahi hua to cron job
  automatically recovery email bhejega. Admin → "Abandoned Carts" tab se manually bhi "Send recovery email" kar sakte ho.

## AI Product Listing (image → auto-generated title/description)

The admin "Products" panel can generate a full product listing (title, description,
fabric, occasion tags, Google Shopping attributes, meta description) from a product
photo using NVIDIA's free NIM vision model.

1. Go to https://build.nvidia.com and sign in (free, no credit card).
2. Generate an API key — it will start with `nvapi-`.
3. Add it to your `.env.local` (and your Vercel/Netlify project env vars):

   ```
   NVIDIA_API_KEY=nvapi-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```

4. In the admin Products panel, upload a product photo (or paste an image URL)
   and click "Generate with AI" — it calls `app/api/admin/generate-listing/route.ts`.

Free tier gives ~1,000 credits on signup and a 40 requests/minute limit, which is
plenty for listing generation. If you hit a 429, wait a minute and retry.
