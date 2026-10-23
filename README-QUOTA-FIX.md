# WooCommerce drip — quota fix

## Asli problem kya thi

`app/api/cron/woocommerce-drip` route cron-job.org se **har 15 minute** pe hit hota tha, aur
har hit pe ye 2 kaam ek saath karta tha:

1. **Enqueue** — `woocommerce_customers` table se 5000 rows tak scan, phir 2 aur queries jisme
   `.in()` ke andar 5000 tak IDs daal ke check karta tha ki kisko welcome/follow-up bhejna
   baaki hai.
2. **Send** — queue se 8 emails nikaal ke bhejna.

Step 1 (enqueue) **bhaari** hai — hazaaron rows padhta hai — lekin usse har 15 min pe chalane
ka koi fayda nahi tha, kyunki jaise hi ek customer ek baar queue ho jata hai, agli baar wahi
scan sirf "already queued hai, skip karo" bolne ke liye hoti thi. Din me 96 baar (24hr ÷ 15min)
ye poora bhaari scan chal raha tha, jabki sirf 1 baar chalna kaafi tha.

Yahi Supabase ka free-tier egress/bandwidth quota sabse zyada kha raha tha.

## Kya badla

`lib/woocommerce-automation.ts` me function do hisso me split kar diya:

- **`runWooCommerceEnqueueJob()`** — sirf scan + queue karna (bhaari kaam). Ab ye
  **`/api/cron/daily-jobs`** me daal diya hai, jo already **din me sirf 1 baar** Vercel Hobby
  cron se chalta hai. Isliye ye bhaari scan ab 96x/din ki jagah **1x/din** chalega.
- **`runWooCommerceSendJob()`** — sirf queue me se already-ready rows nikaal ke bhejna (halka
  kaam, sirf chand rows padhta/likhta hai, poori customer table ko touch nahi karta). Ye ab
  **`/api/cron/woocommerce-drip`** me hai, jise cron-job.org har 15 min pe hit karta rahega —
  ye ab sasta hai isliye har 15 min pe chalna theek hai.
- **`runWooCommerceDripJob()`** dono ko ek sath call karta hai (enqueue + send) — ye sirf
  Admin panel ke **"Save & Abhi Run Karo"** button ke liye rakha hai, taaki wahan turant dono
  ho jaye.

Koi naya table/column nahi chahiye, koi env var nahi badla — sirf jo function kab call hota
hai wo badla hai. Existing indexes (`idx_woocommerce_send_queue_due`,
`idx_woocommerce_campaign_sends_customer_step`, etc, migration
`20260917000000_woocommerce_segments_and_drip_automation.sql` me) already sahi hain.

## Files jo badli (isi zip me hain, same path pe)

```
lib/woocommerce-automation.ts
lib/cron-jobs.ts
app/api/cron/daily-jobs/route.ts
app/api/cron/woocommerce-drip/route.ts
```

`CHANGES.diff` me poora unified diff bhi hai agar review karna ho.

## Apply kaise karo

1. Is zip ko extract karo.
2. In 4 files ko apne repo me **same path pe replace** karo
   (`C:\Users\bapan\E-Commerce-ethnic\lib\...` waghera).
3. `git add -A && git commit -m "woocommerce drip: split enqueue/send to cut Supabase egress" && git push`
4. Vercel apne aap redeploy kar dega (agar GitHub se connected hai).
5. Kuch aur karne ki zarurat nahi — cron-job.org ki setting waisi hi rehne do (har 15 min,
   same URL `/api/cron/woocommerce-drip`, same `Authorization: Bearer <CRON_SECRET>` header).

## Baaki free-quota tips (bina code badle)

**Supabase (free tier)**
- Sabse bada risk **egress/bandwidth** hai (5GB/month) — upar wala fix isi ko sabse zyada
  bachayega.
- Project **1 week tak koi activity na ho to auto-pause** ho jata hai — agar aapka cron roz
  chal raha hai to ye nahi hoga, is fix ke baad bhi cron roz chal raha hai to safe hai.
- Agar future me aur bachana ho: `woocommerce_campaign_sends` aur `woocommerce_send_queue` me
  se purane (jaise 90+ din purane) `sent`/`failed`/`skipped` rows periodically delete kar sakte
  ho — chhoti table = kam egress har query pe.

**Vercel (Hobby)**
- 2 cron jobs/din ki limit already handle ho rahi hai (`daily-jobs` + `vendor-order-timeout`).
  `woocommerce-drip` Vercel cron nahi hai — wo cron-job.org (bahar se) hit karta hai, isliye
  Vercel ke cron-count me count nahi hota. Yehi trick already use ho rahi thi, bas enqueue
  step ab galat jagah bhaari kaam kar raha tha.
- Function **execution time** (GB-hours) bhi free tier me capped hai — send-only route ab
  bahut chhota/fast chalega (pehle se kam DB round-trips), to ye bhi thoda bachega.

**Cloudflare (free)**
- Ye WooCommerce-import feature seedhe Cloudflare nahi use karta (Workers/Pages waghera alag
  feature, jaise `avif-media-worker`) — agar wahan bhi quota khatam ho raha hai to bataiye,
  wo alag investigate karna padega (image worker requests/day free tier me 100k/day cap hoti
  hai generally).

**ZeptoMail (paid)**
- Isme quota ki chinta nahi (paid hai), bas apna sending-rate/day plan ke hisaab se
  `dailySendCap` (Admin → WooCommerce Import → Automation) set rakho taaki plan ki daily limit
  cross na ho.

## Manual send abhi bhi kaam karta hai

Admin → WooCommerce Import → section 3 ("Email campaign bhejo") se manual send waisा hi hai,
usme koi badlav nahi — wo already sirf selected customers ko turant bhejta hai, poori table
scan nahi karta.
