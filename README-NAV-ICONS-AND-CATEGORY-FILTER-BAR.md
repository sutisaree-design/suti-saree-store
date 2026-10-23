# Filter bar mein Home/Categories icons + Category page pe Sort bar

## Kya add hua

### 1. Home/Categories icons — Filters bar ke left mein
Shop page (`/shop`) ke bottom Filters/Sort bar mein ab left side pe do chhote
icon buttons hain — **Home** aur **Categories**. Filter kholte/karte waqt bhi
user ek tap mein Home ya Categories page pe ja sakta hai, bina filter sheet
band kiye ya upar scroll kiye.

Naya reusable component: `components/quick-nav-icons.tsx` — sirf mobile pe
dikhta hai (desktop pe header nav already visible hai).

### 2. Category pages (`/category/[slug]`) pe bhi wahi bar
Pehle category page (jaise `/category/cotton-blend`) pe koi filter/sort bar
tha hi nahi — bas ek plain product grid. Ab wahi Filters/Sort bar shop page
jaisa hi dikhta hai:
- **Home / Categories icons** (left)
- **Filters** button — is category ke saath `/shop` page pe le jaata hai
  (poora price/size/colour/fabric filter panel wahi milta hai)
- **Sort by** dropdown (Featured / Price Low-High / High-Low / Top Rated /
  Newest) — is category ke products ko turant client-side sort karta hai,
  bina page reload ke

## Files
- `components/quick-nav-icons.tsx` (naya) — Home/Categories icon pair, dono
  jagah reuse hota hai
- `components/category/category-toolbar-grid.tsx` (naya) — category page ka
  naya bar + sortable grid
- `app/category/[slug]/page.tsx` (edit) — plain grid ki jagah ab
  `CategoryToolbarGrid` use karta hai
- `app/shop/shop-content.tsx` (edit) — mojooda Filters bar mein
  `QuickNavIcons` add kiya

## Apply kaise karein
Zip ke andar sab files hain apne exact paths ke saath — sabko apne repo mein
same location pe copy-paste karo (naye 2 add honge, 2 replace honge), phir:
```
git add components/quick-nav-icons.tsx components/category/category-toolbar-grid.tsx app/category/[slug]/page.tsx app/shop/shop-content.tsx
git commit -m "feat: add Home/Categories quick-nav to filter bar; add sort bar to category pages"
git push
```
Ya patch (repo root se):
```
git apply nav-and-category-filter-bar.diff
```
(Isse sirf `app/category/[slug]/page.tsx` aur `app/shop/shop-content.tsx` apply
honge — naye 2 files zip se manually copy karni hongi kyunki patch sirf edits
track karta hai, naye files nahi.)

## Test
1. `/shop` kholo mobile pe — bottom bar mein Home/Categories icon dikhna
   chahiye Filters button ke left mein
2. Koi bhi category page kholo (e.g. `/category/cotton-blend`) — same bar
   dikhna chahiye niche, Sort dropdown se products turant reorder hone
   chahiye
3. "Filters" button tap karo category page pe — `/shop?category=...` pe le
   jaana chahiye, us category ke pehle se filtered
