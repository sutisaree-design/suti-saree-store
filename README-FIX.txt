IMAGE SEARCH — "Couldn't match that photo to any products" FIX
================================================================

Root cause (most likely):
  lib/image-search.ts har product photo ko /api/image-proxy ke through
  fetch karta hai (CORS-safe canvas read ke liye). Us proxy me:

  1. Fetch call bina User-Agent/Accept header ke jaa raha tha. Kai
     storage/CDN hosts (Supabase Storage included) bot-jaisi dikhne
     wali requests ko silently block/403 kar dete hain — jiski wajah
     se HAR product photo fingerprint fail ho jata tha, na ki sirf
     "bad" photos ke liye. Yehi wajah hai ki koi bhi photo upload karo,
     result hamesha "couldn't match" aata tha.
  2. Content-Type header pe hard filter tha (`startsWith('image/')`).
     Agar upstream ne content-type missing/generic bheja (kuch valid
     images ke saath bhi hota hai), wo image bhi silently reject ho
     jaati thi.

Kya fix kiya:
  - app/api/image-proxy/route.ts
      -> Browser jaisa User-Agent/Accept header add kiya
      -> 5xx/429 pe ek retry add kiya
      -> Content-Type ke bajaye actual file bytes (magic bytes) check
         karke image detect karta hai, so valid images ab reject nahi
         hongi sirf header ki wajah se
  - lib/image-search.ts
      -> rankProductIdsByImage ab { ids, systemicFailure } return
         karta hai. Agar ek bhi product photo fingerprint nahi ho paayi
         (proxy/network down jaisa systemic issue), wo alag se flag
         hota hai instead of silently looking like "no visual match".
  - components/header.tsx
      -> Catalog empty aaye to ek retry karta hai pehle "couldn't load
         catalog" bolne se pehle.
      -> systemicFailure true hone par shopper ko sahi message dikhata
         hai ("try again in a moment") — "try a clearer photo" wala
         misleading message nahi, jo unka fault hi nahi tha.

FILES TO REPLACE (same paths in your repo):
  app/api/image-proxy/route.ts   -> REPLACE
  lib/image-search.ts            -> REPLACE
  components/header.tsx          -> REPLACE

Apply karne ke baad:
  git add app/api/image-proxy/route.ts lib/image-search.ts components/header.tsx
  git commit -m "Fix: search-by-photo silently matching zero products (proxy blocked by upstream CDN)"
  git push

Verify karne ka tareeka (deploy hone ke baad):
  Browser console open karke ek image search try karo. Agar ab bhi
  problem ho, to console me is tarah ka warning dikhega:
    "[image-search] fingerprinted 0/N product photos — likely
     /api/image-proxy or network issue, not a genuine 'no match'."
  Agar yeh log dikhta hai, to iska matlab upstream (Supabase Storage)
  abhi bhi proxy ki request block kar raha hai — us case me Supabase
  bucket ki CORS/access settings check karna hoga, ya Vercel function
  logs me /api/image-proxy ka actual response status/error dekhna
  hoga (Vercel dashboard -> Deployments -> Functions -> image-proxy).
