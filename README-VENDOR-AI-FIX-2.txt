VENDOR AI GENERATION FIX — PART 2
==================================

Is zip mein 2 files hain:

1) app/vendor/dashboard/products/add-product/page.tsx
   (PEHLE ka fix — agar pehle wala zip already apply kar chuke ho to
   yeh same hi hai, safe hai overwrite karna)
   Naya product add karte waqt AI enrichment trigger karta hai.

2) lib/vendor-ai-listing.ts  <-- NAYA FIX
   -------------------------
   Root cause: is file mein product ki photo fetch karte waqt koi
   TIMEOUT set nahi tha. Agar Supabase storage se photo fetch slow ho
   jaaye (network blip, badi image, etc.), to yeh step bina limit ke
   chalta rehta tha — aur uske baad jo NVIDIA AI call ke liye 50-second
   ka window rakha gaya tha, wo already khatam ho chuka hota tha. Isse
   poora Vercel function apna 60-second hard limit hit karke beech me
   hi mar jaata tha (bina koi error dikhaye) — product khaali fields
   ke saath hi reh jaata.

   Tumhare Admin panel ka "Generate with AI" button (jo sahi kaam kar
   raha hai) is same photo-fetch step pe pehle se 10-second ka timeout
   lagata hai — yehi asli farak tha jo maine fix kiya.

   FIX: photo fetch pe bhi 10-second timeout laga diya (admin jaisa hi),
   taaki yeh kabhi bhi poora time-budget na khaye. Saath hi ab agar
   photo fetch ya NVIDIA API call fail ho, to uska poora reason
   (status code + error message) Vercel logs mein clearly dikhega —
   pehle sirf status number dikhta tha.

HOW TO APPLY
------------
1. Dono files apne repo me isi path pe copy-overwrite karo.
2. git add -A
3. git commit -m "fix: add timeout to vendor product image fetch + better AI error logging"
4. git push
5. Redeploy hone do.

AGAR ABHI BHI KHAALI AAYE
--------------------------
Ek naya test product vendor dashboard se add karo, phir Vercel
dashboard > Logs mein "vendor-ai-listing" search karo. Ab agar fail
hua to exact reason dikhega, jaise:
  [vendor-ai-listing] NIM API error: 429 ...   -> free-tier quota khatam
  [vendor-ai-listing] NIM API error: 400 ...   -> request format issue
  [vendor-ai-listing] image fetch failed/timed out ...

Yeh exact line mujhe bhej dena, us se turant final root cause pata
chal jaayega.
