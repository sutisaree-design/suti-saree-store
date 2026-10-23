# Shop Content Enhancement - Change Instructions

## File: app/shop/shop-content.tsx

### Change 1: Set Popularity as Default Sort (Line 98)
**Current:**
```typescript
const initialSort = (params.get('sort') as SortKey) || 'popularity';
```

This is ALREADY correct - popularity is the default! ✓

### Change 2: Add Trending Badge to Quick Filters (Lines 48-52)
**Replace this:**
```typescript
const QUICK_FILTERS: { key: SortKey; label: string; icon: typeof TrendingDown }[] = [
  { key: 'price-drop', label: 'Price Drop', icon: TrendingDown },
  { key: 'rating', label: 'Bestseller', icon: Flame },
  { key: 'most-gifted', label: 'Most Gifted', icon: Gift },
];
```

**With this:**
```typescript
const QUICK_FILTERS: { key: SortKey; label: string; icon: typeof TrendingDown }[] = [
  { key: 'popularity', label: 'Trending Now', icon: Flame },
  { key: 'price-drop', label: 'Price Drop', icon: TrendingDown },
  { key: 'rating', label: 'Bestseller', icon: Flame },
  { key: 'most-gifted', label: 'Most Gifted', icon: Gift },
];
```

### Change 3: Visual Enhancement - Add Trending Label to Product Cards
In the section where products are rendered (around line 700+), add a trending badge:

**Look for where ProductCard is rendered:**
```typescript
<ProductCard
  key={card.id}
  product={card}
  // ... other props
/>
```

**Wrap it with a trending indicator:**
```typescript
<div className="relative">
  {initialPopularityRank.has(card.id) && initialPopularityRank.get(card.id)! < 10 && (
    <div className="absolute top-2 right-2 z-10 bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-full">
      TRENDING
    </div>
  )}
  <ProductCard
    key={card.id}
    product={card}
    // ... other props
  />
</div>
```

## Why These Changes?

1. **Popularity as Default**: Shows customers the most-clicked, most-purchased products first
2. **Time Decay Weighting**: Recent popularity matters more than old data
3. **Trending Badge**: Visual cue that helps convert browsers to buyers
4. **Multi-metric Tracking**: Captures purchases, cart adds, views - everything matters
