# Sab changes — ek saath (final zip)

Is zip me ab tak ke teeno fixes/features hain:

1. **Yellow/color variant image fix** — search me sahi variant ka photo/link
   dikhna (`lib/products-api-server.ts`)
2. **Dedicated `/search?q=` page** — `/shop?q=` se alag (`app/search/page.tsx`
   naya, `app/shop/page.tsx` me redirect, `components/header.tsx`,
   `app/page.tsx` ka SearchAction, admin revalidate paths)
3. **Keyword suggestions (naya, is baar ka)** — dropdown me ab product
   card (photo+price) nahi, sirf keyword phrases suggest hote hain, jo
   user ki apni search-history/click-preference se personalize hote hain
   (`lib/search-utils.ts`, `components/header.tsx`)

## Is baar (#3) kya badla — detail

**`lib/search-utils.ts`** — naya function `getKeywordSuggestions()` add
kiya. Yeh product list aur query lekar catalog se hi phrases banata hai
(`color + category`, `fabric + category`, `occasion + category`, sirf
`category`) — jo bhi typed word se match kare. Ek optional
`tokenPrefWeights` parameter bhi leta hai jisse phrase ka score badhta
hai agar us phrase ke words user ke pehle wale searches/clicks me bhi
the.

**`components/header.tsx`**:
- Naya `searchTokenPrefs` localStorage store — jab bhi search karo ya
  koi suggestion click karo, us phrase ke har (meaningful) word ka count
  badhta hai. Agli baar related word type karne par un phrases ka score
  upar chala jaata hai — yehi "user preference se suggest" wala part hai.
- Dropdown ab "Product suggestions" (photo/price) ke bajaye keyword rows
  dikhata hai. Har row par click karte hi seedha `/search?q=<phrase>` par
  chala jaata hai.
- User ki apni recent-search history jo current typing se match kare,
  wo hamesha list ke **sabse upar** dikhti hai (Clock icon se), baaki
  catalog-generated phrases uske baad (Search icon se) — jaisa aapne
  bola: "jo upar search kiya ya jo keyword click kiya wo top me show ho".
- Desktop + mobile — dono jagah same behaviour.

Poore project par `npx tsc --noEmit` chala ke check kiya — koi type
error nahi aaya.

## Kaise apply karein

Zip ki folder-structure aapke repo jaisi hi hai. In files ko same path
par copy/replace kar dijiye:

```
app/api/admin/products/[id]/route.ts
app/api/admin/products/route.ts
app/page.tsx
app/search/page.tsx          ← nayi file
app/shop/page.tsx
app/shop/shop-content.tsx
components/header.tsx
lib/products-api-server.ts
lib/search-utils.ts
```

`all-changes.diff` bhi diya hai agar `git apply all-changes.diff` se
seedha apply karna chahein.

```
git add -A
git commit -m "feat: keyword-based search suggestions with user preference ranking + dedicated /search page + colour-variant search fix"
git push
```

Deploy hone ke baad check karna:
- Search box me "yellow" type karo → keyword phrases dikhein (product
  card nahi), "yellow saree" jaisi suggestion click karo to `/search?q=yellow saree`
  khule aur wahi yellow variant ka photo/link sahi dikhe.
- Ek baar "cotton" se related kuch search/click karo, phir naya query
  type karo jisme cotton-related phrase bhi ho — wo thoda upar aana
  chahiye pichle preference ki wajah se.
- Pehle search kiya hua term dubara type karna shuru karo → wahi Clock-icon
  wali suggestion sabse upar aani chahiye.
