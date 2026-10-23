# Part 3 — AVIF format negotiation (real speed win) — READY-TO-APPLY CODE

Ye zip PART-3-PROMPT ka *actual implementation* hai (prompt paste karke AI
tool se karwana nahi padega) — including GSC/GMC/Pinterest ke liye ek extra
safety fix, aur ab ek **Admin > Settings toggle (kill-switch)** bhi, jisse
tum kabhi bhi ek click mein sab pehle jaisa (pre-Part-3 exactly) revert kar
sakte ho.

## Kya-kya add/change hua

1. `lib/image-sizes.ts` — har size (`-sm`, `-md`, original) ke liye ab WebP
   ke saath AVIF bhi generate hota hai. Same resize ek hi baar hota hai,
   sirf encode step branch hota hai — resize dobara nahi hota. AVIF fail ho
   jaaye kisi image ke liye toh sirf woh AVIF entry skip hoti hai, WebP par
   koi asar nahi padta.

2. `app/api/upload-image/route.ts` — `mainUrl` (jo DB mein store hota hai)
   ab specifically WebP wali entry se select hota hai, kyunki ab do
   `suffix === ''` entries hain (webp + avif original).

3. `app/api/admin/import-image/route.ts` — same fix jo upload route mein
   hua.

4. `lib/image-resize-backfill.ts` — do cheezein:
   - "already backfilled" check ab 2 files (`-sm.webp`, `-md.webp`) ke
     bajaye 4 files (`-sm.webp`, `-sm.avif`, `-md.webp`, `-md.avif`) check
     karta hai — matlab jo images pehle se WebP backfill ho chuki hain,
     woh ab dobara queue hongi taaki unke missing AVIF variants generate
     ho jaayein.
   - Ek latent bug bhi fix kiya: variant file ka naam ab size ki apni
     extension (`webp`/`avif`) se banta hai, original file ki extension se
     nahi — warna AVIF file `.webp` naam se save ho jaati aur WebP file ko
     overwrite kar deti.

5. `components/admin/settings-panel.tsx` — do UI changes:
   - "Generate Responsive Image Sizes" card ka description text update
     (AVIF ka mention add hua) — card ka structure/buttons/polling kuch
     nahi chhua.
   - **Naya card: "AVIF Format"** (Responsive Images ke turant baad) —
     admin toggle jisse AVIF serving on/off kar sakte ho.

6. `app/media/[...path]/route.ts` — asli feature: `.webp` path pe request
   aane par, agar browser ka `Accept` header `image/avif` bolta hai, toh
   proxy sibling `.avif` file try karta hai (same preferred-backend +
   fallback logic reuse karke). Nahi milti toh silently WebP hi serve hota
   hai — kabhi broken image nahi. Har image response pe `Vary: Accept`
   header bhi add kiya, taaki CDN cache galat format kisi aur browser ko
   na de de.

   **Safety fix #1 (bots hamesha excluded):** Bots/feed-fetchers
   (Googlebot, Google-Shopping-Content, AdsBot, Pinterest, WhatsApp,
   facebookexternalhit, etc. — koi bhi User-Agent jisme "bot"/"crawl"/
   "spider" jaisa pattern ho, ya UA hi missing ho) ko AVIF negotiation se
   poori tarah exclude kar diya hai — unhe hamesha WebP hi milega, unka
   Accept header kuch bhi bole. Ye is liye zaroori tha kyunki **Google
   Merchant Center AVIF format officially support nahi karta** (sirf
   JPEG/PNG/WEBP/GIF/BMP/TIFF).

   **Safety fix #2 (naya — admin kill-switch):** Ek naya settings key
   `avif_negotiation` (default: ON) is route ki settings-cache mein add
   kiya gaya hai. Admin panel se OFF karte hi — sab requests (browser +
   bot, dono) ko plain WebP milega, bilkul waise jaise Part 3 apply karne
   se pehle tha. Koi DB URL, koi already-generated AVIF file — kuch nahi
   change hota, sirf ye route AVIF pick karna band kar deta hai.

7. **NAYA FILE:** `lib/settings-api.ts` — is file mein pehle se bahut sara
   code tha (Media Delivery, Responsive Images, etc.); maine sirf
   `AvifNegotiationSettings` interface + `fetchAvifNegotiationSettings()` +
   `saveAvifNegotiationSettings()` add kiya hai (Responsive Images block
   ke turant baad). Poori file replace kar rahe ho, isliye tumhara koi
   purana change ismein already included hai (maine tumhare current repo
   se hi copy karke edit kiya).

8. **NAYA FILE:** `app/api/admin/avif-negotiation/route.ts` — GET (status)
   + POST (toggle save) admin-only endpoint. Save karte hi Cloudflare edge
   cache bhi purge hota hai (same pattern jo "Media Delivery" toggle use
   karta hai) — taaki OFF karne ka effect **turant** har jagah dikhe, na
   ki sirf naye/uncached images pe.

## Kaise apply karo

1. Is zip ke andar jo folder-structure hai, wahi tumhare local
   `E-Commerce-ethnic` folder ke andar hai. **6 files replace karo, 2 nayi
   files add karo:**

   Replace karo:
   - `lib/image-sizes.ts`
   - `lib/image-resize-backfill.ts`
   - `app/api/upload-image/route.ts`
   - `app/api/admin/import-image/route.ts`
   - `app/media/[...path]/route.ts`
   - `components/admin/settings-panel.tsx`
   - `lib/settings-api.ts` ⚠️ (isme pehle se bahut kuch tha — poora
     replace karo, maine tumhare current version pe hi build kiya hai)

   Nayi file add karo (folder khud banega copy karte waqt):
   - `app/api/admin/avif-negotiation/route.ts`

2. Terminal mein repo folder ke andar:
   ```
   npx tsc --noEmit
   ```
   zero naye errors aane chahiye (isko maine yahan run nahi kar paya kyunki
   is environment mein `node_modules` install nahi tha — locally zaroor
   chalao before push karne se).

3. Koi naya SQL migration/table **nahi chahiye** — `avif_negotiation`
   generic `settings` (key/value) table use karta hai, jo already exist
   karta hai (Media Delivery/Responsive Images isi table ko use karte
   hain).

4. Phir:
   ```
   git add lib/image-sizes.ts lib/image-resize-backfill.ts lib/settings-api.ts app/api/upload-image/route.ts app/api/admin/import-image/route.ts app/api/admin/avif-negotiation/route.ts app/media/[...path]/route.ts components/admin/settings-panel.tsx
   git commit -m "Add AVIF format negotiation (Part 3) with bot exclusion + admin kill-switch"
   git push
   ```

## Deploy ke baad manually verify karo

- [ ] Admin > Settings mein "AVIF Format" card dikh raha hai, toggle ON hai
      by default.
- [ ] Chrome mein koi bhi product image load karo → DevTools > Network tab
      mein dekho `Content-Type: image/avif` aa raha hai (naye upload pe
      turant, purani images ke liye "Generate Responsive Image Sizes"
      backfill re-run karne ke baad).
- [ ] Ek image jiske liye AVIF nahi bana (backfill abhi tak nahi pahuncha)
      — normally load ho rahi hai, broken nahi.
- [ ] **Toggle OFF karke test karo:** turant Network tab mein sab images
      wapas `Content-Type: image/webp` dikhni chahiye.
- [ ] `merchant-feed` XML output khol ke check karo `<g:image_link>` ab bhi
      `.webp` URL hi hai (change nahi hona chahiye).
- [ ] Apne Cloudflare cache rules mein confirm karo `Vary: Accept` respect
      ho raha hai — warna galat format cache ho sakta hai kisi ek browser
      ke liye aur sabko wahi serve ho jaayega.

## Agar GMC/Pinterest mein kabhi disapproval aaye

Admin > Settings > "AVIF Format" card mein toggle **OFF** kar do. Ye:
- Turant sab images ko WebP-only kar dega (browser + bot dono ke liye)
- Cloudflare cache turant purge hoga (agar `CLOUDFLARE_API_TOKEN` +
  `CLOUDFLARE_ZONE_ID` env vars set hain)
- Koi image URL, koi DB record, koi file — kuch delete/change nahi hota;
  sirf serving-time decision revert hota hai — bilkul jaise Part 3 apply
  hi nahi hua tha.

(Waise bots already hamesha WebP hi paate hain chahe toggle ON ho — ye
toggle ek extra full-revert switch hai, agar kabhi shak ho ki koi
specific crawler AVIF pakad raha hai jo hamare bot-list mein nahi tha.)

