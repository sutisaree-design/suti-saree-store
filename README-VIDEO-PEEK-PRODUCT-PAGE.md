# Product page video peek (floating preview) + caching

## Kya add hua

Product detail page ki main photo ke **bottom-left corner** par ab ek chhota,
floating video preview bubble (picture-in-picture style) show hota hai —
bilkul jaisa reference screenshot me tha. Poster image turant dikhta hai,
fir video khud-ba-khud (muted, loop me) chalne lagta hai. Upar-right corner
ke **X** se ise dismiss kar sakte ho. Bubble par tap karne se woh SAME
full-screen video (Reels-style feed) khulta hai jo neeche wale "Watch
Product Video" button se pehle se khulta tha — dono ek hi cheez kholte hain,
button bhi waisa hi rahega, sirf ek naya (zyada visible) entry point add
hua hai.

Yeh sirf tab dikhega jab product ka apna `video_url` set ho (exactly wahi
condition jo abhi "Watch Product Video" button ke liye use ho rahi thi) —
koi naya admin toggle ya DB migration nahi chahiye.

## Page-open speed par koi issue nahi — kaise

1. **Do gates, dono pass hone chahiye tabhi video load hoga:**
   - `requestIdleCallback` — browser ke free hone tak wait karta hai, taaki
     yeh preview clip kabhi bhi hero image / fonts / buy button jaisi
     zaroori cheezon se bandwidth compete na kare.
   - `IntersectionObserver` — bubble screen par hona chahiye.
   
   Jab tak dono true na ho, `<video>` tag me `<source>` hi attach nahi hota
   (`preload="none"` + poster image), so zero network cost until then.

2. **Media proxy pehle se hi 1-year immutable cache bhejta hai** —
   `app/media/[...path]/route.ts` me already
   `Cache-Control: public, max-age=31536000, immutable` set hai (kyunki
   upload hone ke baad file kabhi overwrite nahi hoti, naya upload = nayi
   filename). Isme koi change nahi kiya — yeh already best-practice tha.
   Iska matlab: ek baar video browser me cache ho gaya (peek preview se ya
   full Reels feed se), to dobara wahi file **turant** load hoga — chahe
   isi product page pe wapas aao, ya Reels feed me swipe karo, dono same
   cached bytes use karte hain.

3. **Reels feed (`/api/products/video-feed`) bhi idle time me hi
   prefetch ho jata hai** — bubble load hone ke turant baad, background me
   (usi idle window ke andar) yeh JSON bhi mangwa liya jaata hai. Toh jab
   shopper bubble ya button pe tap kare, feed already ready hota hai —
   loading spinner nahi dikhta.

## Files (in yeh 3 files ko apne local repo me replace karo)

- `components/product/product-video-peek.tsx` — **naya file**, poora
  peek-bubble component isi me hai.
- `components/product/product-gallery.tsx` — 3 naye optional prop add hue
  (`videoUrl`, `productId`, `productSlug`) aur gallery ke andar ek overlay
  block. Baaki scroll/zoom/lightbox logic bilkul waisa hi hai, chhua nahi.
- `app/product/[slug]/product-detail.tsx` — `ProductGallery` ko yeh naye
  props pass kiye (`toPublicMediaUrl(product.video_url)` use karke, jo
  legacy raw Supabase/R2 URLs ko bhi `/media/...` proxy path me convert
  kar deta hai). Ek import line bhi update hui:
  `toPublicMediaUrls` → `toPublicMediaUrl, toPublicMediaUrls`.

Teeno files me `tsc --noEmit` aur `eslint` (next/core-web-vitals) clean
pass ho raha hai, koi naya error/warning nahi.

## Apply karne ke baad ek optional tip

Naya video upload karne ke baad, Admin → (jahan bhi Cache Warmer hai) wala
tool ek baar chala dena — woh route (`app/api/admin/cache-warm/route.ts`)
already `video_url` ko bhi warm karta hai, taaki Cloudflare edge cache pe
bhi pehla visitor hi fast video paaye, sirf repeat visitors nahi.
