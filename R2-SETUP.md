# Cloudflare R2 Storage Setup (Hindi + English)

Ye guide batata hai ki apne site (Supabase + Vercel free tier) ke images/videos
ko Cloudflare R2 pe kaise move karein — bina kisi purane image/video ko delete
kiye, bina Google Merchant / Meta / Pinterest / Search Console feed tode, aur
1-click me wapas purane setup pe revert karne ke option ke saath.

## Kyun R2?

- R2 ka **egress (bandwidth) FREE** hai — Supabase aur Vercel dono free tier
  pe bandwidth/quota cap hai jo images+videos bade hote hi khatam ho jata hai.
- Storage bhi sasta hai (10GB free, uske baad ~$0.015/GB/month).
- S3-compatible API hai, isliye code change chhota hai.

## Is codebase me kya badla (already done, changes.zip me hai)

1. **`lib/storage.ts`** (naya file) — ek switch layer. `STORAGE_PROVIDER` env
   var ke hisaab se naya upload Supabase ya R2 me jaata hai.
2. Ye routes ab is switch se guzarte hain (sirf **naye** uploads ke liye):
   - `app/api/upload-image/route.ts`
   - `app/api/admin/import-image/route.ts`
   - `app/api/upload-video/route.ts`
   - `app/api/admin/product-video/upload/route.ts`
   - `app/api/admin/convert-images-webp/route.ts`
   - `lib/products-api.ts` (video upload client-side part)
3. `next.config.js` — R2 custom domain ke liye `remotePatterns` add.
4. `package.json` — `@aws-sdk/client-s3` aur `@aws-sdk/s3-request-presigner`
   add (R2 S3-compatible hai, isliye AWS SDK use hota hai).
5. `scripts/migrate-to-r2.mjs` — purane ~500 files ko Supabase se R2 me
   **copy** karta hai (delete NAHI karta).
6. `scripts/rewrite-urls-to-r2.sql` — optional, database ke image/video URLs
   ko naye R2 URL pe point karta hai (reversible).

**Important:** Kya nahi chhua gaya — `order-fulfillment-photos` aur
`vendor-kyc-documents` buckets Supabase pe hi rehte hain. Ye admin-only,
private/low-traffic buckets hain — inse egress quota nahi khatam hota, aur
KYC documents ko private/signed-URL access chahiye hota hai, isliye inhe R2
me move karne ka koi fayda/zaroorat nahi hai.

---

## STEP 1 — Naya R2 bucket banao

Aapke Cloudflare account me already 3 buckets hain (`medusa-images`,
`railway-vs-madusa`, `vs-evershop-image-storage`) — ye alag projects ke hain.
**Is store ke liye ek naya, dedicated bucket banao** (mixed karna galat
project ke saath confusion aur cleanup risk deta hai):

1. Cloudflare dashboard -> R2 Object Storage -> **Create bucket**
2. Name: kuch clear jaise `ethnic-store-media`
3. Location: Automatic (default) rehne do

## STEP 2 — Bucket ko public access do, CUSTOM DOMAIN ke saath

Yahan ek zaruri detail hai jo Merchant Center/feeds ke liye matter karta hai:
R2 ka default public URL (`pub-xxxxxxxx.r2.dev`) **production ke liye
recommended nahi** hai — Cloudflare khud isko sirf testing ke liye bolta hai
aur ye rate-limited hai. Google/Meta/Pinterest crawlers high-volume me hit
karte hain, isliye:

1. Bucket -> **Settings** -> **Public access** -> **Custom Domains** -> **Connect Domain**
2. Ek subdomain do jo aapke apne domain ke andar ho, jaise
   `cdn.yourdomain.com` (agar aapka domain Cloudflare pe hai to ye automatic
   DNS record bana dega)
3. SSL/TLS active hone ka wait karo (kuch minute lagte hain)

Ye `cdn.yourdomain.com` hi aapka `R2_PUBLIC_URL` hoga.

**Why this matters for feeds:** Google Merchant Center, Meta Catalog,
Pinterest — inko sirf ek stable, fast, correct `Content-Type` wala HTTPS URL
chahiye. Wo domain ka naam care nahi karte. Jab tak URL badle nahi (ya
badalne par DB me update ho jaye — Step 6 dekho), koi feed error nahi aayega.

## STEP 3 — API Token banao (R2 ke liye, Cloudflare account API token nahi)

1. R2 Object Storage -> **Manage API Tokens** -> **Create API Token**
2. Permission: **Object Read & Write**
3. Scope: sirf `ethnic-store-media` bucket tak limit karo (best practice)
4. Token create hone ke baad milega:
   - `Access Key ID`
   - `Secret Access Key`
   - Account ID (dashboard URL me bhi dikhta hai: `dash.cloudflare.com/<ACCOUNT_ID>/r2`)

Ye teeno turant kahin safe save kar lo — secret key sirf ek baar dikhta hai.

## STEP 4 — Vercel me environment variables add karo

Vercel Project -> Settings -> Environment Variables (Production + Preview
dono me add karo):

```
STORAGE_PROVIDER=supabase          <- pehle "supabase" hi rakho (safe default)
R2_ACCOUNT_ID=<step 3 se>
R2_ACCESS_KEY_ID=<step 3 se>
R2_SECRET_ACCESS_KEY=<step 3 se>
R2_BUCKET_NAME=ethnic-store-media
R2_PUBLIC_URL=https://cdn.yourdomain.com
R2_PUBLIC_URL_HOSTNAME=cdn.yourdomain.com
```

(Same file `.env.r2.example` repo me hai reference ke liye.)

CORS bhi set karo bucket settings me (agar browser se direct upload karna ho —
product video upload isi tarah kaam karta hai):

```json
[
  {
    "AllowedOrigins": ["https://yourdomain.com", "https://*.vercel.app"],
    "AllowedMethods": ["GET", "PUT"],
    "AllowedHeaders": ["*"]
  }
]
```

## STEP 5 — Deploy karo, phir switch flip karo

1. Pehle deploy karo `STORAGE_PROVIDER=supabase` ke saath — koi behavior change
   nahi hoga, bas naya code live ho jayega (safe check).
2. Confirm karo site normal chal raha hai.
3. Ab Vercel me `STORAGE_PROVIDER=r2` set karo, redeploy karo (ya "Redeploy"
   button dabao — env var change ke liye redeploy chahiye).
4. Ab se **har naya image/video upload** (admin panel se) seedha R2 me jayega.
   Purane images/videos jahan the wahin Supabase pe hi rehte hain aur waise
   hi kaam karte rehte hain — kuch bhi tootega nahi.

### 1-click rollback

Agar kabhi R2 band karna pade: Vercel me `STORAGE_PROVIDER` ko `supabase`
kar do (ya delete kar do), redeploy — bas. Naye uploads phir Supabase me
jaane lagenge. R2 me jo already upload ho chuka hai wo bhi waisa hi pada
rahega (kuch delete nahi hota), agar wapas R2 use karna ho to switch phir se
`r2` kar dena.

---

## STEP 6 (OPTIONAL, alag se karo) — Purane ~500 images/videos bhi R2 me copy karo

Ye tabhi karo jab Phase 1 (upar) kaam se kaam ek hafta stable chal chuka ho.

1. Local machine pe `.env.migration` file banao (repo me commit mat karna):
   ```
   NEXT_PUBLIC_SUPABASE_URL=...
   SUPABASE_SERVICE_ROLE_KEY=...
   R2_ACCOUNT_ID=...
   R2_ACCESS_KEY_ID=...
   R2_SECRET_ACCESS_KEY=...
   R2_BUCKET_NAME=ethnic-store-media
   ```
2. Run: `node --env-file=.env.migration scripts/migrate-to-r2.mjs`
   - Ye sirf **copy** karta hai. Supabase se kuch delete nahi hota.
   - Dubara run karna safe hai (already-copied files skip ho jaati hain).
3. Verify: Cloudflare R2 dashboard me bucket kholke object count/size dekho —
   ye Supabase ke image+video count se match hona chahiye.
4. **Sirf tab jab confident ho:** Supabase me database backup lo
   (Dashboard -> Database -> Backups), phir `scripts/rewrite-urls-to-r2.sql`
   ko Supabase SQL editor me run karo (do placeholder values fill karke) —
   ye DB ke image/video URLs ko R2 URLs pe point kar deta hai.
5. Kuch product pages, `/sitemap.xml`, aur apna Merchant feed URL khud khol
   ke check karo ki naye links load ho rahe hain.

Iske baad hi Supabase Storage se purani files delete karna consider karo —
aur wo bhi optional hai (10GB free tier me 500 images/videos aaram se fit ho
jaate hain, delete karna zaroori nahi).

---

## Google Merchant Center / Meta / Pinterest / Search Console — kya check karna hai

- **Merchant Center / Meta / Pinterest feeds** aapke DB se dynamically
  generate hote hain (product URLs live query karke), isliye jaise hi DB me
  URL update hota hai (Step 6), agli feed refresh pe naya URL apne aap chala
  jayega — koi manual re-upload nahi chahiye. Bas ek baar Merchant Center me
  "Diagnostics" tab check kar lena refresh ke baad.
- Agar sirf **Phase 1** kiya hai (naye uploads hi R2 pe), toh feeds me kuch
  bhi change nahi hoga jab tak Phase 2 (Step 6) na karo — purane products
  Supabase URLs hi dikhayenge, jo waise hi kaam karte rahenge.
- **Google Search Console**: image URLs change hone par Search Console khud
  hi naye URLs ko re-crawl karke discover kar lega normal crawling cycle me —
  koi error nahi aayega, bas naye URLs index hone me kuch din lag sakte hain.
- Custom domain (Step 2) use karne se yahi sab crawlers ko ek stable,
  aapke apne domain ke andar wala URL milta hai, jo professional bhi lagta
  hai aur `.r2.dev` domain ke rate-limit issues se bhi bachata hai.

---

## Abhi apna current total size kaise check karein

**Supabase:**
Dashboard -> Project -> Settings -> **Usage** (ya Storage tab me har bucket
kholke top pe total size dikhta hai). Free tier limit: 1GB storage + kuch
GB/month egress (plan ke hisaab se dashboard pe hi exact number dikhta hai).

**Vercel:**
Project -> **Usage** tab (ya Team -> Usage) -> "Fast Data Transfer" /
"Image Optimization" cards — yahi wo quota hai jo images ke wajah se khatam
ho raha hai. Vercel dashboard hi sabse accurate real-time number deta hai,
isliye main koi number guess nahi karunga — dashboard kholke check karo,
main us screen ko dekh ke exact reading confirm kar sakta hu agar screenshot
bhejo.
