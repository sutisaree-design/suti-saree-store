# Automated City-wise Saree Blog — Setup Guide

Yeh package aapke **E-Commerce-ethnic** (Next.js + Supabase + Vercel) repo ke
liye bana hai. Isse har din automatically ek naya SEO blog post generate hoga
(city + saree targeted), Claude AI use karke likha jayega, aur khud publish ho
jayega.

## Kya-kya milega
1. `supabase/migrations/20260808_blog_automation.sql` — 3 tables:
   - `blog_posts` — actual published posts
   - `blog_generation_logs` — proof ki automation chal raha hai (ya nahi)
   - `blog_city_queue` — top 30 Indian cities pehle se daale hue hain
2. `lib/blog/prompt.ts` — conversion-oriented, city-specific SEO prompt
3. `lib/blog/generate.ts` — Claude API call + Supabase me save/publish
4. `app/api/blog/generate/route.ts` — cron isko daily hit karega
5. `app/api/blog/status/route.ts` — **test/health-check endpoint**
6. `vercel.json` — daily cron schedule (roz subah 9:00 AM IST)

## Setup steps

### 1. Files apne repo me copy karein
Yeh sab files apne existing repo ke same paths par copy kar dein
(`lib/`, `app/api/`, `supabase/migrations/`, root me `vercel.json`).
Agar aapke paas already `lib/supabase.ts` type ka client hai, to use kar sakte
hain — bas `generate.ts` me import adjust kar dein.

### 2. Supabase migration run karein
Supabase dashboard → SQL Editor → migration file ka content paste karke run
karein. Ya CLI se:
```bash
supabase db push
```

### 3. Environment variables (Vercel → Project → Settings → Environment Variables)
```
ANTHROPIC_API_KEY=sk-ant-...
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=xxxx        (Service Role key — secret, browser me kabhi expose mat karein)
CRON_SECRET=ek-lamba-random-string-banao
SITE_NAME=Your Store Name
NEXT_PUBLIC_SITE_URL=https://e-commerce-ethnic.vercel.app
```
`CRON_SECRET` khud generate karein, e.g.:
```bash
openssl rand -hex 32
```

### 4. Deploy
`vercel.json` me cron already set hai — jab aap deploy karenge, Vercel apne aap
roz `03:30 UTC` (= subah ~9:00 AM IST) par `/api/blog/generate` ko call karega.
(Vercel Cron ke liye Vercel ka **Pro plan** chahiye hota hai daily/custom cron
ke liye — Hobby plan par cron sirf din me ek baar allowed hai, jo yahan already
theek hai.)

### 5. Blog page banayein (agar abhi nahi hai)
`blog_posts` table se data fetch karke `/blog/[slug]` page par render karein —
`content_html` seedha render kar sakte hain (dangerouslySetInnerHTML) kyunki
yeh aapke apne server ne generate kiya hai. Agar chahein to iske liye alag se
bol dena, main woh page bhi bana dunga.

---

## ✅ Test kaise karein ki AI khud se kaam kar raha hai

### Option A — Turant ek test run karein (kuch publish nahi hoga)
```bash
curl -X POST https://your-site.com/api/blog/status \
  -H "x-test-secret: YOUR_CRON_SECRET"
```
Agar `"success": true` aaye, matlab poora pipeline (Claude API + Supabase)
sahi kaam kar raha hai.

### Option B — Health check dashboard (browser me bhi khol sakte hain)
```
GET https://your-site.com/api/blog/status
```
Yeh dikhayega:
- `healthy: true/false`
- last successful run kab hua
- last published post
- pichle 10 runs ka log

Ise UptimeRobot / cron-job.org jaisi free service me daal dein taaki roz check
ho aur agar 2 din se koi naya post nahi bana to aapko email alert mil jaye.

### Option C — Manually ek real post abhi publish karayein
```bash
curl "https://your-site.com/api/blog/generate?city=Jaipur" \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```
Yeh Supabase me ek real published post daal dega — `blog_posts` table me
jaakar dekh sakte hain.

---

## SEO ka logic (city + saree ranking)
- Har din alag city ke liye post banta hai (`blog_city_queue` — 30 cities
  seeded hain, chahein to aur add kar dein).
- Har post ka title/meta/content us city ka naam naturally include karta hai
  — isliye jab koi "saree online Jaipur" ya "best saree shop Surat" search
  karega, aapka post relevant match banega.
- Prompt me explicitly mana kiya gaya hai keyword-stuffing aur fake
  reviews/discounts se — Google in dono cheezon ko penalize karta hai, isliye
  content genuinely useful rakha gaya hai.
- 30 din me 30 cities cover ho jayengi, uske baad queue apne aap reset ho
  jayegi aur cycle repeat hoga (aap chahe to prompt version badal kar fresh
  angle bhi de sakte hain future me).

## Aage kya customize kar sakte hain
- `lib/blog/prompt.ts` me apna real brand voice, actual offers/policies daal
  dein (abhi fake discount/testimonial generate nahi hota — intentionally,
  taaki false claims na jayein).
- Category sirf "saree" hai abhi — `blog_city_queue` me lehenga/kurti/suit
  jaise categories bhi add kar sakte hain, code already generic hai.
- Chahen to sitemap.xml me naye posts auto-add karne ka route bhi bana sakte
  hain taaki Google fast index kare — bata dijiye, woh bhi bana dunga.
