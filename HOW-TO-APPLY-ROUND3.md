# Round 3 — Right-side gap fix on "Shop by Price" chips

Sirf **2 files replace** karni hain — dono jagah (Product page + Shop page)
ka "Shop by Price" bar fix hua hai. Koi naya file, koi admin change nahi.

## Kya fix hua
Pehle chips ke baad jo khaali/flat gap dikh raha tha, wo ab do tarike se
theek kiya hai:
- Ab bar khud pata karta hai ki chips scroll ho sakte hain ya nahi.
- **Agar scroll ho sakta hai** → right edge par ek halka fade/shadow dikhega
  jo batata hai "aur chips hain, scroll karo" — jaisa bade e-commerce apps
  (Myntra/Nykaa) mein hota hai. Isse gap "bug" nahi, balki ek natural
  scroll-hint lagta hai.
- **Agar sab chips already fully visible hain** (overflow hi nahi ho raha)
  → fade dikhega hi nahi, koi flat blank patch nahi bachega.

## Files
- `components/product/price-quick-browse-bar.tsx` — **replace**
- `components/shop/price-range-filter-bar.tsx` — **replace**

## Apply kaise karein
Dono files zip se copy karke apne repo mein same path par paste/replace
karo, phir:
```
git add components/product/price-quick-browse-bar.tsx components/shop/price-range-filter-bar.tsx
git commit -m "fix: scroll-fade on Shop-by-Price chip bars, remove stray right-side gap"
git push
```

## Test
1. Product page kholo, Buy Now ke niche "Shop by Price" dekho — agar chips
   scroll ho sakte hain, right edge par halka fade dikhna chahiye, blank
   gap nahi.
2. `/shop` page kholo, wahi bar upar check karo.
3. Chips ko scroll karke end tak le jao — fade wahan gayab ho jana chahiye
   (kyunki ab aur scroll nahi bacha).
