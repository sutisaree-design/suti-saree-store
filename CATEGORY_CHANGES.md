# Category Toolbar Grid Enhancement - Change Instructions

## File: components/category/category-toolbar-grid.tsx

### Change 1: Verify Default Sort is Popularity (Line 42)
**Current:**
```typescript
const [sort, setSort] = useState<SortKey>('popularity');
```

This is ALREADY correct - popularity is the default! ✓

### Change 2: Add Trending Button to Quick Nav (Around line 100-150)

Find the sort dropdown and add a "Trending" quick filter button:

**Current (look for sort selector):**
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
    <SelectItem value="popularity">Popularity</SelectItem>
  </SelectContent>
</Select>
```

**Add this above the Select component:**
```typescript
<div className="flex gap-2 mb-4">
  <Button
    variant={sort === 'popularity' ? 'default' : 'outline'}
    size="sm"
    onClick={() => setSort('popularity')}
    className="gap-2"
  >
    <Flame size={16} />
    Trending
  </Button>
  <Button
    variant={sort === 'rating' ? 'default' : 'outline'}
    size="sm"
    onClick={() => setSort('rating')}
  >
    Bestseller
  </Button>
</div>
```

### Change 3: Verify Popularity Updates (Lines 44-60)
**Current fetching logic:**
```typescript
useEffect(() => {
  const interval = setInterval(() => {
    fetch('/api/products/popularity')
      .then((r) => r.json())
      .then(({ ranked }: { ranked: string[] }) => {
        setPopularityRank(new Map(ranked.map((id: string, i: number) => [id, i])));
      })
      .catch(() => {});
  }, 10 * 60 * 1000); // 10 minutes
  return () => clearInterval(interval);
}, []);
```

This is ALREADY correct! The category pages refresh popularity every 10 minutes. ✓

## Why These Changes?

1. **Default Popularity Sort**: Shows best-selling products immediately
2. **Quick Access Button**: One-click access to trending products
3. **Regular Refresh**: Popularity data updates every 10 minutes automatically
4. **Real-time Engagement**: Captures live customer interactions
