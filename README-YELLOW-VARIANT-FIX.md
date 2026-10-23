# Fix: Search me yellow (ya kisi bhi color) variant ka photo/link nahi khul raha tha

## Asli problem kya thi
`/shop` page (aur usi se banne wale `/category/[slug]` page) Supabase se products
**server-side** fetch karte hain — `lib/products-api-server.ts` ke andar wala
`mapRowToProduct()` function use hota hai.

Lekin us function me `variant_list` aur `all_images` fields kabhi set hi nahi ho
rahi thi (jabki `lib/products-api.ts` — jo client-side pages use karte hain —
me yeh dono fields sahi se set hoti hain).

Iska result: jab aap "yellow saree" search karte the, to `productMatchesQuery()`
(lib/search-utils.ts) product ko dhoond leta tha (kyunki `all_colors` me yellow
tha), lekin usko yeh pata hi nahi chal pata tha ki *kaunsa variant* yellow hai —
kyunki `variant_list` hamesha empty/undefined hoti thi. Isliye code apne fallback
par chala jaata tha aur product ka **default variant image/slug** dikhata tha —
chahe wo default variant yellow na hokar kuch aur color ho.

Yehi wajah thi ki search result me maroon/navy/rani-pink jaise photos dikh rahe
the jab aap "yellow" search kar rahe the.

## Fix
`lib/products-api-server.ts` me:
1. `resolveAllImages()` helper add kiya (products-api.ts wala hi, copy-paste
   nahi — same logic, kyunki dono jagah supabase se `product_variants(...images)`
   already select ho raha tha, bas map nahi ho raha tha).
2. `mapRowToProduct()` ke return object me do naye fields add kiye:
   - `variant_list` — har variant ka `{ slug, color, image }`
   - `all_images` — product + sab variants ke saare images, deduplicated

Ab jab aap "yellow" search karenge, `matchedVariant` sahi variant find kar lega,
aur card us variant ki hi photo dikhayega + click karne par seedha usi yellow
variant ke product page par le jayega — chahe default variant koi aur color ho.

Yeh fix `/shop`, `/category/[slug]`, `/collection/[slug]`, vendor collection,
aur `/store/[slug]` — sab jagah automatically apply ho jayega, kyunki yeh sab
same `mapRowToProduct()` function reuse karte hain.

## Kaise apply karein
Is zip me sirf ek file hai jo change hui hai:

```
lib/products-api-server.ts
```

Apne local repo me isi path par isi file ko replace kar dijiye (`products-api-server.ts.diff`
file bhi di hai agar aap diff se manually apply karna chahein), phir:

```
git add lib/products-api-server.ts
git commit -m "fix: include variant_list/all_images in server-side product mapping so colour search shows the matched variant, not the default"
git push
```

Deploy hone ke baad ek baar naya build lene do (Netlify/Vercel), phir "yellow saree"
search karke check kar lijiye.

## Doosri baat — /shop?q= ke bajaye /search?q= wala URL
Yeh ek alag, bada UI/routing change hai (naya route banana, `/shop?category=`
wali existing links, aur `app/page.tsx` ke `SearchAction` JSON-LD ko bhi update
karna padega). Agar chahen to yeh alag se bata dijiye, main woh bhi bana ke
zip de dunga — is fix ke saath isko mila nahi, taaki aapko ek chhota, safe
patch replace karna pade, bada nahi.
