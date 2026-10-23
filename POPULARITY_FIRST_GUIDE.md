# Put Popularity First in All Quick Filters

## 🎯 Goal
Show "Popularity" / "Trending" as the FIRST quick filter button on shop pages and category pages

## 📁 File 1: app/shop/shop-content.tsx

### Find Section (Line 48-52):
Current code:
```typescript
const QUICK_FILTERS: { key: SortKey; label: string; icon: typeof TrendingDown }[] = [
  { key: 'price-drop', label: 'Price Drop', icon: TrendingDown },
  { key: 'rating', label: 'Bestseller', icon: Flame },
  { key: 'most-gifted', label: 'Most Gifted', icon: Gift },
];
```

### Replace With:
```typescript
const QUICK_FILTERS: { key: SortKey; label: string; icon: typeof TrendingDown }[] = [
  { key: 'popularity', label: 'Trending Now', icon: Flame },    // ⭐ FIRST
  { key: 'price-drop', label: 'Price Drop', icon: TrendingDown },
  { key: 'rating', label: 'Bestseller', icon: Flame },
  { key: 'most-gifted', label: 'Most Gifted', icon: Gift },
];
```

### Result:
Quick filters will show:
```
[Trending Now] [Price Drop] [Bestseller] [Most Gifted]
     ⭐ First
```

---

## 📁 File 2: components/category/category-toolbar-grid.tsx

### Find Section (Around Line 50):
Look for where sort dropdown is rendered:
```typescript
<Select value={sort} onValueChange={setSort}>
  <SelectTrigger className="w-full sm:w-auto">
    <SelectValue placeholder="Sort by" />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="featured">Featured</SelectItem>
    <SelectItem value="price-asc">Price: Low to High</SelectItem>
    <SelectItem value="price-desc">Price: High to Low</SelectItem>
    <SelectItem value="rating">Bestseller</SelectItem>
    <SelectItem value="newest">Newest</SelectItem>
    <SelectItem value="popularity">Popularity</SelectItem>  // ← HERE
  </SelectContent>
</Select>
```

### Add Quick Filter Buttons BEFORE the Select:
```typescript
// Add trending/popularity quick buttons BEFORE the sort dropdown
<div className="flex gap-2 flex-wrap mb-4">
  <Button
    variant={sort === 'popularity' ? 'default' : 'outline'}
    size="sm"
    onClick={() => setSort('popularity')}
    className="gap-2"
  >
    <Flame size={16} />
    Trending Now
  </Button>
  
  <Button
    variant={sort === 'rating' ? 'default' : 'outline'}
    size="sm"
    onClick={() => setSort('rating')}
    className="gap-2"
  >
    Bestseller
  </Button>
  
  <Button
    variant={sort === 'price-drop' ? 'default' : 'outline'}
    size="sm"
    onClick={() => setSort('price-drop')}
    className="gap-2"
  >
    <TrendingDown size={16} />
    Price Drop
  </Button>
</div>

{/* Then keep your existing Select dropdown below */}
<Select value={sort} onValueChange={setSort}>
  {/* ... rest of dropdown ... */}
</Select>
```

### Result on Category Pages:
```
[Trending Now] [Bestseller] [Price Drop]
     ⭐ First
┌─────────────────────────────────┐
│ Sort by:                        │
│ Featured                        │
│ Price: Low to High              │
│ Price: High to Low              │
│ Bestseller                      │
│ Newest                          │
│ Popularity                      │
└─────────────────────────────────┘
```

---

## 🔧 Implementation Steps

### Step 1: Update shop-content.tsx
1. Open `app/shop/shop-content.tsx`
2. Find `const QUICK_FILTERS` (around line 48)
3. Add popularity as first item with Trending Now label
4. Save file

### Step 2: Update category-toolbar-grid.tsx
1. Open `components/category/category-toolbar-grid.tsx`
2. Find the sort dropdown section
3. Add quick filter buttons ABOVE the dropdown
4. Make sure popularity/trending is first button
5. Save file

### Step 3: Add Missing Imports (if needed)
Make sure these are imported at the top:
```typescript
import { Flame, TrendingDown } from 'lucide-react';
```

### Step 4: Test
1. Go to `/shop` → First quick filter should be "Trending Now" ✓
2. Go to `/category/sarees` → First quick button should be "Trending Now" ✓
3. Click it → Products sort by popularity ✓

---

## 📋 Exact Code Changes

### shop-content.tsx - Lines 48-52
**BEFORE:**
```typescript
const QUICK_FILTERS: { key: SortKey; label: string; icon: typeof TrendingDown }[] = [
  { key: 'price-drop', label: 'Price Drop', icon: TrendingDown },
  { key: 'rating', label: 'Bestseller', icon: Flame },
  { key: 'most-gifted', label: 'Most Gifted', icon: Gift },
];
```

**AFTER:**
```typescript
const QUICK_FILTERS: { key: SortKey; label: string; icon: typeof TrendingDown }[] = [
  { key: 'popularity', label: 'Trending Now', icon: Flame },
  { key: 'price-drop', label: 'Price Drop', icon: TrendingDown },
  { key: 'rating', label: 'Bestseller', icon: Flame },
  { key: 'most-gifted', label: 'Most Gifted', icon: Gift },
];
```

**Diff:**
```diff
  const QUICK_FILTERS: { key: SortKey; label: string; icon: typeof TrendingDown }[] = [
+   { key: 'popularity', label: 'Trending Now', icon: Flame },
    { key: 'price-drop', label: 'Price Drop', icon: TrendingDown },
    { key: 'rating', label: 'Bestseller', icon: Flame },
    { key: 'most-gifted', label: 'Most Gifted', icon: Gift },
  ];
```

---

## ✨ Visual Result

### Shop Page (/shop)
```
Sarees & Ethnic Wear                    [Sort Dropdown ▼]

[Trending Now] [Price Drop] [Bestseller] [Most Gifted]

┌─────────────────────────────────────┐
│ Product 1 (Most Popular)            │
│ [TRENDING]                          │
├─────────────────────────────────────┤
│ Product 2 (Very Popular)            │
│ [TRENDING]                          │
├─────────────────────────────────────┤
│ Product 3                           │
└─────────────────────────────────────┘
```

### Category Page (/category/sarees)
```
Sarees

[Trending Now] [Bestseller] [Price Drop]

Sort by: Popularity ▼

┌─────────────────────────────────────┐
│ Product 1 (Most Popular)            │
│ [TRENDING]                          │
├─────────────────────────────────────┤
│ Product 2 (Very Popular)            │
│ [TRENDING]                          │
└─────────────────────────────────────┘
```

---

## 🎯 Key Points

✅ Popularity is FIRST in quick filters  
✅ Matching label: "Trending Now" (clear to users)  
✅ Flame icon for visual appeal  
✅ Works on both /shop and /category pages  
✅ Default sort remains "popularity"  
✅ One-click access to trending products  

---

## ❓ FAQ

**Q: Why "Trending Now" instead of "Popularity"?**
A: It's more user-friendly. "Popularity" is technical, "Trending Now" tells customers these are the hottest items.

**Q: Should it show on mobile too?**
A: Yes! Use `flex-wrap` on the button container so it wraps on smaller screens.

**Q: Can I change the icon?**
A: Sure! Options: `Flame`, `TrendingUp`, `Star`, `Zap` - any lucide-react icon.

**Q: What if I want more quick filters?**
A: Add more items to the QUICK_FILTERS array:
```typescript
{ key: 'newest', label: 'New Arrivals', icon: Sparkles },
{ key: 'price-drop', label: 'Sale Items', icon: Tag },
```

---

## 📝 Checklist

- [ ] Updated QUICK_FILTERS in shop-content.tsx
- [ ] Added quick filter buttons to category-toolbar-grid.tsx
- [ ] Imported Flame and TrendingDown icons
- [ ] Tested /shop page
- [ ] Tested /category/* pages
- [ ] Verified popularity shows first
- [ ] Checked mobile responsiveness
- [ ] Committed and pushed changes

---

## 🎉 Result

Now popularity/trending will be the FIRST option everywhere, making it easy for customers to see the most popular products with one click!
