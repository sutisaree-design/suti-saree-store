# WooCommerce Import — Segmentation + Welcome/Follow-up Automation

Ye zip sirf **changed/new files** hain — same folder structure me hain jaisa
tumhare repo me hai, seedhe replace/copy kar sakte ho.

## 1. Kya-kya add hua (tumhare 3 sawalon ke hisaab se)

### A) Kis email pe bheja gaya, kis pe nahi, duplicate na ho
Ye pehle se tha (`woocommerce_campaign_sends` table + subject-match check),
maine tod-fod nahi ki — bas usme `clicked_at` aur `automation_step` columns
add kiye taaki click tracking aur automation isi table ka use kare.
Admin panel me section **"4. Pehle bheji gayi campaigns"** me har subject ke
liye Sent / Opened / **Clicked** (naya) / Failed dikhta hai.

### B) Cold / Warm / Hot batch
- **Cold** = kabhi email open nahi kiya, ya open kiya par link click nahi kiya
- **Warm** = email ka link click karke site pe aaya, par kharida nahi (sirf 1
  page dekha)
- **Hot** = kharida, YA link click karke 2+ pages dekhe

Admin panel me section **"2. Imported customers"** ke upar ab **Cold / Warm /
Hot** filter buttons hain (counts ke saath), aur table me har customer ke
saamne ek badge dikhta hai. Filter laga ke "Select all" karoge to sirf usi
segment ke customers select honge — phir normal tarike se campaign bhejo.

Isse kaam karne ke liye naya click-tracking route hai
(`/api/track/click/<id>`) jo har email ke real link ko wrap karta hai, aur
`lib/track-api.ts` ab ek cookie (`wc_sid`) padh ke site pe hone wale page
views / purchases ko wapas usi email-send se jod deta hai.

### C) Automation: Welcome → (N din baad) Follow-up, daily cap, on/off toggle
Naya section **"5. Automated welcome + follow-up (drip)"**:
- **ON/OFF toggle** — off rehne pe koi automatic email nahi jaayega.
- **Daily send cap** (default 50) — roz max itne hi automatic/scheduled email
  jaate hain, list ke sabse pehle-imported customer se shuru karke.
- **Follow-up kitne din baad** (default 3) — welcome email *bhejne* ke itne
  din baad follow-up automatically queue hota hai.
- Dono email (welcome + follow-up) ke liye alag template/subject/headline
  choose kar sakte ho (wahi 4 premium templates jo pehle se hain).
- **"Save & Abhi Run Karo"** button turant ek batch bhej deta hai (test ke
  liye), warna roz apne aap ek baar chalta hai (neeche "Important limitation"
  dekho).

Manual campaign send me bhi ek **"Schedule karo"** toggle add hua hai — "N
ghante baad bhejo" — turant sending ki jagah customers queue ho jaate hain
aur usi daily cron se, usi daily cap ke andar bhejte hain.

## 2. Files (kya naya, kya modify hua)

**New:**
- `supabase/migrations/20260917000000_woocommerce_segments_and_drip_automation.sql`
- `app/api/track/click/[sendId]/route.ts` — click tracking + redirect
- `app/api/admin/woocommerce-import/segments/route.ts` — cold/warm/hot compute
- `app/api/admin/woocommerce-import/automation/route.ts` — automation settings GET/POST
- `app/api/cron/woocommerce-drip/route.ts` — manual-trigger route for testing
- `lib/woocommerce-automation.ts` — automation settings + the actual drip job

**Modified:**
- `lib/campaign-templates.ts` — added `wrapCampaignLinksForClickTracking()`
- `lib/track-api.ts` — reads `wc_sid` cookie, tags `activity_events`
- `lib/woocommerce-import-api.ts` — client wrappers for segments/automation, `scheduleAfterHours`
- `lib/cron-jobs.ts` — wires the drip job in
- `app/api/cron/daily-jobs/route.ts` — calls the drip job in the daily cron
- `app/api/admin/woocommerce-import/send-campaign/route.ts` — click-link wrapping + scheduling
- `components/admin/woocommerce-import-panel.tsx` — all the new UI

## 3. Apply karne ka tarika

1. Ye sab files apne local repo me **same paths pe copy/replace** karo
   (zip me already sahi folder structure hai — `app/`, `lib/`, `components/`,
   `supabase/` root me extract karo, apne repo root me merge/overwrite karo).
2. **Supabase migration run karo** — naya SQL file
   (`supabase/migrations/20260917000000_...sql`) Supabase dashboard ke SQL
   editor me paste karke run karo (ya `supabase db push` agar CLI use karte ho).
   Isके bina naya code chalega hi nahi (columns/tables missing error aayega).
3. `git add -A && git commit -m "cold/warm/hot segmentation + welcome/followup drip automation" && git push`
4. Deploy hone ke baad, Admin → WooCommerce Import panel me neeche scroll
   karke naya "5. Automated welcome + follow-up" section on karo.

## 4. Important limitation — daily cron, per-minute nahi

Tumhare `vercel.json` me pehle se comment tha ki Vercel Hobby (free) plan pe
cron **din me sirf ek baar** chal sakta hai. Maine yehi infra reuse ki hai —
matlab:
- "Daily cap" sahi kaam karta hai (roz max N email).
- "Follow-up N din baad" sahi kaam karta hai (din-level accuracy).
- Manual "schedule N ghante baad" bhi kaam karta hai, par **exact ghante pe
  nahi** — jab bhi agla daily cron chalega (jaisa `vercel.json` me set hai)
  usi waqt bhejega, agar scheduled time nikal chuka ho.

Agar tumhe **hourly/minute-level** scheduling chahiye, uske liye ya to
Vercel Pro plan (jisme zyada frequent crons allowed hain) chahiye hoga, ya
ek external cron service (e.g. cron-job.org) jo `/api/cron/daily-jobs` ko
har ghante hit kare — code already isi tarah likha hai ki zyada baar chalne
se bhi kuch galat nahi hoga (sirf jitna due hai utna hi bhejega, daily cap
respect karega).

## 5. Testing tip

Deploy ke baad agar turant test karna hai poore ek din ka wait kiye bina:
- Automation on karke "Save & Abhi Run Karo" dabao.
- Ya browser me visit karo: `https://aruhihandlooms.com/api/cron/woocommerce-drip`
  (agar `CRON_SECRET` env var set hai to `Authorization: Bearer <secret>`
  header ke saath hit karna hoga — Postman/curl se).
