IMAGE SEARCH FEATURE — FILES TO REPLACE
=========================================

Yeh zip 3 files deta hai. Apne repo (E-Commerce-ethnic) me isi path pe
paste/replace karo:

  lib/image-search.ts          -> NAYI FILE (add karni hai)
  components/header.tsx        -> REPLACE karo (existing file overwrite)
  app/shop/page.tsx            -> REPLACE karo (existing file overwrite)

Kya add hua:
  - Search bar (desktop + mobile, dono) me ab ek camera icon hai.
  - Us pe click karke koi bhi photo upload karo (gallery/camera se).
  - App us photo ka color+layout "fingerprint" banata hai (8x8 grid, 
    coarse average color) aur poore catalog ke products ke pehle image se
    compare karke sabse zyada visually similar products ko top pe dikhata
    hai — /shop?imgsearch=1 pe.
  - Yeh real AI/ML model nahi hai (koi backend/API cost nahi), sirf
    browser-side color-similarity hai — fashion catalog (saree/lehenga/
    kurti) ke liye reasonably accha kaam karta hai kyunki color/pattern
    match ho jata hai.

IMPORTANT — CORS note:
  Product images agar Supabase Storage se serve ho rahi hain to normally
  unme CORS headers already public hote hain, to yeh kaam karega. Agar
  kisi product ka image load/compare fail hota hai (CORS block), wo product
  bas ranking me skip ho jayega — puri site crash nahi hogi.

Apply karne ke baad:
  git add lib/image-search.ts components/header.tsx app/shop/page.tsx
  git commit -m "Add image search (search by photo)"
  git push
