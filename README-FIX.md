# AruhiHandlooms blog — full fix set

Files touched:
- `app/api/admin/generate-blog-post/route.ts` — AI generation
- `app/blog/[slug]/page.tsx` — public blog post page
- `lib/products-api-server.ts` — product fetch helpers
- `app/api/admin/blog-trend-ideas/route.ts` — "Get trending topic ideas" pills
- `app/api/admin/blog-keyword-gaps/route.ts` — "Find content gaps" pills
- `components/admin/blog-panel.tsx` — admin blog UI

## 1. 500/504 timeout on "Generate with AI"
Faster text-only NIM model + retry-on-timeout, rebalanced time budget.

## 2. Missing internal (category) links
`ensureCategoryLinks()` guarantees at least one real in-content category
link per post, even if the model doesn't embed one itself.

## 3. Cover image showing "No Image"
Strips stray broken `(category:Name)` text, and falls back to a
store-wide featured product photo when the model's related category
doesn't match a real one.

## 4. Empty "You Might Also Like" product grid
`fetchFeaturedProductsServer()` fallback — the blog post's product catalog
grid now always shows something, category-matched first, store-wide
featured/top-rated as fallback. Applies retroactively to old posts too.

## 5. Keyword suggestions (this round) — city/purchase-intent + no repeats
You asked for: keywords tied to where handloom/silk sarees are actually
searched & bought city-wise in India, long-tail enough to rank and drive
purchase-intent traffic, and — critically — once a topic's been used for a
post it should stop showing and a new one should take its place.

**"Get trending topic ideas" (`blog-trend-ideas/route.ts`)**
- New 📍 **evergreen bucket**: 25 long-tail topics tying each major
  handloom/silk craft to the Indian city/region it's actually known for
  and searched for — e.g. "kanchipuram silk saree buying guide",
  "banarasi silk saree shopping guide varanasi", "pochampally ikkat saree
  guide hyderabad", "saree wholesale market guide surat" — plus
  purchase-intent ones like "best silk sarees under 5000 online india",
  "how to buy sarees online safely in india". These don't expire like
  festival topics do.
- **De-duplication added everywhere** (previously only the keyword-gaps
  endpoint had this): every topic — trending, evergreen, and seasonal — is
  now checked against your existing posts' titles/keywords before being
  shown. Once you generate a post from a topic, that exact pill won't come
  back; the next-best one from the bank takes its place automatically.
- Seasonal bucket also now backfills from the following/previous month if
  the current month's topics run out from repeated use, so it doesn't just
  shrink to nothing.

**"Find content gaps" (`blog-keyword-gaps/route.ts`)**
- Added purchase-intent seeds ("buy sarees online", "handloom saree
  price", "silk saree online shopping") and city seeds ("saree shopping
  mumbai/chennai/kolkata/delhi", "banarasi saree varanasi", "kanchipuram
  silk saree") on top of your existing category names — these feed real
  Google Suggest autocomplete data, so what comes back is genuine
  long-tail search phrasing, not guesswork. The existing "already
  covered" de-dup logic here was already correct and is unchanged.

## To apply
Replace all six files with the copies in this zip (folder structure
matches your repo), or `git apply all-fixes.patch`, then commit & push.
