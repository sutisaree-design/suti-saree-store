# Mobile video autoplay fix — Hero Banner (aur baaki saare product/gallery videos)

## Asli problem kya thi
`components/home/hero-banner-carousel.tsx` already sahi tha — `muted`, `playsInline`,
`webkit-playsinline`, `autoPlay`, aur JS se force `.play()` sab already the.

Real bug tha `app/media/[...path]/route.ts` mein — ye woh proxy route hai jo
Supabase Storage ke video/image URLs ko `aruhihandlooms.com/media/...` ke through
serve karta hai (SEO ke liye apna domain dikhane wala).

Ye route **HTTP Range requests support nahi karta tha**. Video har baar poori
file fetch karke ek 200 response bhejta tha, kabhi 206 Partial Content nahi.

Mobile Safari (iPhone) aur kaafi Android browsers video load karte waqt sabse
pehle ek `Range` request bhejte hain aur `206` + `Accept-Ranges` header expect
karte hain. Agar server ye support nahi karta, to iOS Safari silently video
play hi nahi karta — na autoplay, na manual tap se — jabki desktop pe sab thik
dikhta hai kyunki desktop browsers Range ke bina bhi flexible hote hain.

Isi wajah se: desktop pe video sahi chal raha tha, deploy ke baad mobile pe
autoplay/video hi start nahi ho raha tha.

## Fix
`app/media/[...path]/route.ts` ko update kiya:
- Incoming `Range` header ko Supabase ko forward karta hai.
- Upstream se `206 Partial Content` aaye to wahi status + `Content-Range` browser
  ko wapas bhejta hai.
- Har response pe `Accept-Ranges: bytes` header add kiya, taaki Safari ko pehle
  hi pata ho ki range requests support hain.

Isse sirf hero banner nahi — product page ke videos, gallery videos — sab jagah
jahan `/media/...` proxy URL use hota hai, wahan mobile video playback fix ho
jayega.

## Files changed
- `app/media/[...path]/route.ts` (1 file)

## Apply kaise karein
Option A — pura file replace karo:
1. Is zip ke andar `app/media/[...path]/route.ts` ko apne repo ke usi path pe copy-paste karke replace karo.
2. `git add app/media/[...path]/route.ts`
3. `git commit -m "fix: support HTTP range requests in media proxy for mobile video autoplay"`
4. `git push`

Option B — patch apply karo:
```
git apply video-autoplay-fix.diff
```
(repo root se run karo)

## Deploy ke baad test kaise karein
- Real iPhone (Safari) aur Android Chrome pe homepage kholo, hero banner video
  autoplay hona chahiye (muted, loop/advance jaisa pehle tha).
- DevTools → Network tab mein `/media/...` video request check karo — status
  `206 Partial Content` aana chahiye, `Accept-Ranges: bytes` header ke saath.
