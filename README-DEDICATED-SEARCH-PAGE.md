# Dedicated /search?q= page + yellow-variant fix

Yeh zip do cheezein cover karta hai:
1. Pehle wala bug fix (search me sahi color-variant ka photo/link dikhna) —
   already `lib/products-api-server.ts` me hai.
2. Naya: `/shop?q=` ke bajaye `/search?q=` — apna alag, dedicated search page.

## Kya naya banaya / badla

**Naya file:**
- `app/search/page.tsx` — naya route. Yeh bilkul wahi `<ShopContent>`
  component use karta hai jo `/shop` use karta hai (same filters, same grid,
  same colour-variant matching) — bas iska apna URL hai jo sirf search ke
  liye hai, `noindex` metadata ke saath (search-result pages ko Google
  index nahi karta, jaisa pehle `/shop?q=` ke liye implicitly hota tha).

**Badle hue files:**
- `app/shop/page.tsx` — agar koi purana link/bookmark ab bhi `/shop?q=...`
  khole, to yeh server-side `/search?q=...` par redirect kar deta hai
  (baaki saare params — sort, category, wagera — bhi carry ho jaate hain).
  Isse purana koi shared link kabhi break nahi hoga.
- `app/shop/shop-content.tsx` — ek jagah `router.replace('/shop')`
  hardcoded tha (image-search clear karte waqt); ab yeh current path
  (`/shop` ya `/search`, jahan bhi ho) use karta hai, kyunki yeh component
  ab dono jagah mount hota hai.
- `components/header.tsx` — search box ka submit ab `/search?q=...` par
  bhejta hai (pehle `/shop?q=...` par bhejta tha). Camera/"search by photo"
  button jaisa tha waisa hi `/shop?imgsearch=1` par hi rahega — wo poore
  catalog ka visual-similarity ranking hai, ek shareable text-search URL
  jaisa nahi, isliye usko chheda nahi.
- `app/page.tsx` — homepage ka JSON-LD `SearchAction` (jo Google apni site
  search box ke liye use karta hai) ab `/search?q={search_term_string}`
  point karta hai.
- `app/api/admin/products/route.ts` aur
  `app/api/admin/products/[id]/route.ts` — admin se product add/edit karne
  par ab `/search` bhi revalidate hota hai (pehle sirf `/shop` hota tha),
  taaki naya product turant search me bhi dikhe.
- `lib/products-api-server.ts` — pichla variant-image fix (already
  bataya tha).

## Kaise apply karein

Is zip ki folder-structure aapke repo jaisi hi hai — sirf in files/folders
ko same path par copy-paste/replace kar dijiye:

```
app/api/admin/products/[id]/route.ts
app/api/admin/products/route.ts
app/page.tsx
app/shop/page.tsx
app/shop/shop-content.tsx
app/search/page.tsx        ← yeh NAYI file hai
components/header.tsx
lib/products-api-server.ts
```

`all-changes.diff` bhi diya hai agar aap `git apply all-changes.diff` se
seedha apply karna chahein (naye `app/search/page.tsx` ke liye diff me
poora naya file content hai).

Phir:

```
git add -A
git commit -m "feat: dedicated /search?q= page (separate from /shop); fix colour-variant search results"
git push
```

Deploy hone ke baad check kar lena:
- Header ke search box se search karo → URL `/search?q=...` banna chahiye
- "yellow saree" search karke variant photo/click sahi khulna chahiye
- Purana `/shop?q=yellow` link kholo → automatically `/search?q=yellow` par
  redirect ho jaana chahiye
