# E-Commerce Ethnic: Popularity-Based Product Sorting

## 📊 What This Does

Displays products with the most clicks, views, and purchases at the top of your shop and category pages - just like Google Ads shows top-performing ads first!

**Before:** Products shown in random/default order  
**After:** Top-selling products appear at the top, boosting conversions

## 🎯 Quick Start (5 minutes)

### Step 1: Replace the Popularity Ranking Engine
```bash
# Copy the enhanced popularity ranking file
cp enhanced-lib/popularity-rank-server.ts YOUR_REPO/lib/popularity-rank-server.ts
```

### Step 2: Verify Database Setup
Your Supabase should have an `activity_events` table. If not:
```bash
# See TRACKING_SETUP.md for SQL to create it
# Run the SQL provided in the "Supabase Setup" section
```

### Step 3: Test It
```bash
1. Go to your shop: https://your-site.com/shop
2. Products should be sorted by popularity
3. Check Supabase → activity_events table for tracking data
```

### Done! ✓

## 📁 What's Included

| File | Purpose | Required |
|------|---------|----------|
| `popularity-rank-server.ts` | Core ranking engine | **YES** |
| `trending-badge.tsx` | Visual "TRENDING" badges | Optional |
| `SHOP_CHANGES.md` | How to enhance shop page | Reference |
| `CATEGORY_CHANGES.md` | How to enhance category pages | Reference |
| `IMPLEMENTATION_GUIDE.md` | Detailed implementation | Reference |
| `TRACKING_SETUP.md` | How to set up event tracking | Reference |
| `README.md` | This file | Reference |

## 🔧 Installation Steps

### Option A: Minimal Install (Just Enable Existing Features)

Your shop already has popularity sorting! Just verify it's working:

1. **Check `/shop` page**
   - Should default to "Popularity" sort
   - Products sorted by engagement

2. **Check `/category/*` pages**  
   - Should default to "Popularity" sort
   - Updates popularity every 10 minutes

3. **Done!** No code changes needed if it's working

### Option B: Full Enhancement (Add Visual Indicators)

Add trending badges and enhanced UI:

1. **Copy files**
   ```bash
   cp enhanced-lib/popularity-rank-server.ts lib/popularity-rank-server.ts
   cp enhanced-lib/trending-badge.tsx components/trending-badge.tsx
   ```

2. **Update shop page (app/shop/shop-content.tsx)**
   
   Around line 48, update QUICK_FILTERS:
   ```typescript
   const QUICK_FILTERS: { key: SortKey; label: string; icon: typeof TrendingDown }[] = [
     { key: 'popularity', label: 'Trending Now', icon: Flame },  // Add this line
     { key: 'price-drop', label: 'Price Drop', icon: TrendingDown },
     { key: 'rating', label: 'Bestseller', icon: Flame },
     { key: 'most-gifted', label: 'Most Gifted', icon: Gift },
   ];
   ```

3. **Add trending badge to products**
   
   In the product grid rendering (around line 700+):
   ```tsx
   import TrendingBadge from '@/components/trending-badge';
   
   // When rendering ProductCard:
   <div className="relative">
     <TrendingBadge 
       rankIndex={initialPopularityRank.get(card.id)} 
       showText={true}
     />
     <ProductCard
       key={card.id}
       product={card}
       // ... other props
     />
   </div>
   ```

4. **Test it**
   - Go to `/shop`
   - Top products should have "TRENDING" badge
   - Click different products to see rankings update

## 📊 How Popularity is Calculated

### Scoring System
```
Purchase ..................... 100 points (most valuable)
Checkout Started .............. 30 points
Add to Cart .................... 10 points
Wishlist Added ................. 5 points
Product Clicked ................ 2 points
Product Viewed ................. 1 point
```

### Time-Based Weighting
```
Last 7 days ................... 100% weight (full points)
7-30 days ago .................. 70% weight
30-90 days ago ................. 30% weight
Older than 90 days ............ 0% weight (ignored)
```

### Example
```
Product A:
- 5 purchases (recent) = 5 × 100 × 1.0 = 500 points
- 10 cart adds (recent) = 10 × 10 × 1.0 = 100 points
- 50 views (recent) = 50 × 1 × 1.0 = 50 points
Total = 650 points → Ranks #1

Product B:
- 100 views (30 days old) = 100 × 1 × 0.3 = 30 points
- 5 cart adds (recent) = 5 × 10 × 1.0 = 50 points
Total = 80 points → Ranks lower
```

## 🔍 Verify It's Working

### Check 1: Visit Your Shop
```
1. Go to https://your-site.com/shop
2. Look at the sort dropdown - "Popularity" should be selected
3. Products should be sorted by engagement
```

### Check 2: View Database Events
```
1. Open Supabase dashboard
2. Go to SQL Editor
3. Run: SELECT * FROM activity_events ORDER BY created_at DESC LIMIT 10;
4. Should see recent events (product_view, add_to_cart, purchase, etc.)
```

### Check 3: Ranking API
```
1. Open browser console (F12)
2. Run: fetch('/api/products/popularity').then(r => r.json()).then(d => console.log(d))
3. Should return ranked product IDs
```

## 🎨 Customization

### Change Scoring Weights
Edit `lib/popularity-rank-server.ts`:
```typescript
const WEIGHTS: Record<string, number> = {
  purchase: 100,        // ← Increase to prioritize sales
  checkout_start: 30,
  add_to_cart: 10,      // ← Increase to value carts more
  product_view: 1,      // ← Increase to value views more
  product_click: 2,
  wishlist_add: 5,
};
```

### Change Time Windows
Edit `lib/popularity-rank-server.ts`:
```typescript
const WEIGHT_DECAY = {
  recent_days: 7,       // ← Change "recent" window
  medium_days: 30,      // ← Change "medium" window
  older_days: 90,       // ← Ignore older than this
};
```

### Change Trending Badge Threshold
Edit badge display logic (around line 700 in shop-content.tsx):
```typescript
// Show badge for top 5 (instead of 10)
if (rankIndex !== undefined && rankIndex < 5) {
  <TrendingBadge ... />
}
```

### Change Refresh Frequency
Edit `components/category/category-toolbar-grid.tsx`:
```typescript
// Refresh every 5 minutes (instead of 10)
const interval = setInterval(() => {
  // ...
}, 5 * 60 * 1000); // 5 minutes
```

## 🚨 Troubleshooting

### Products Not Sorted by Popularity
**Problem:** All products showing in same order  
**Solution:**
1. Check that `activity_events` table exists in Supabase
2. Verify tracking is working (see TRACKING_SETUP.md)
3. Hard refresh browser (Ctrl+Shift+R)
4. Check server logs for errors

### No Events in Database
**Problem:** activity_events table is empty  
**Solution:**
1. Make sure tracking is enabled
2. Check that `/api/analytics/track` endpoint exists
3. Verify browser console for errors
4. Check Supabase RLS policies allow inserts

### Badges Not Showing
**Problem:** "TRENDING" badge not visible on products  
**Solution:**
1. Verify `trending-badge.tsx` was copied
2. Check that it's imported in shop-content.tsx
3. Verify TrendingBadge component is used in product grid
4. Check browser console for React errors

### Rankings Seem Wrong
**Problem:** Wrong products appearing at top  
**Solution:**
1. Check scoring weights in popularity-rank-server.ts
2. Verify time decay calculations
3. Make sure recent events are included
4. Clear browser cache and try again

## 📈 Monitoring

### Track Over Time
```sql
-- See popularity trend
SELECT product_id, COUNT(*) as events, MAX(created_at) as last_activity
FROM activity_events
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY product_id
ORDER BY COUNT(*) DESC;
```

### Find Top Products This Week
```sql
-- Top 10 products by purchases
SELECT product_id, COUNT(*) as purchase_count
FROM activity_events
WHERE event_type = 'purchase'
AND created_at > NOW() - INTERVAL '7 days'
GROUP BY product_id
ORDER BY COUNT(*) DESC
LIMIT 10;
```

### Monitor Page Performance
- Check Core Web Vitals in Google Analytics
- Trending products should increase conversion rate
- Monitor revenue increase from featured products

## 🎓 How It Works (Technical)

### Data Flow
```
User clicks product
         ↓
trackEvent('product_click', {product_id: '123'})
         ↓
POST /api/analytics/track
         ↓
Saved to activity_events table in Supabase
         ↓
Server fetches events when rendering /shop or /category
         ↓
fetchPopularityRankServer() calculates scores
         ↓
Returns Map<productId, rankIndex>
         ↓
Products sorted by rank index
         ↓
Top products displayed at top of page
         ↓
User sees best-selling products first!
```

### Files Involved
1. `lib/popularity-rank-server.ts` - Ranking calculation
2. `app/shop/shop-content.tsx` - Shop page display
3. `components/category/category-toolbar-grid.tsx` - Category page display
4. `app/api/analytics/track` - Event tracking
5. `lib/track-api.ts` - Tracking utility

## ✅ Implementation Checklist

- [ ] Replaced `lib/popularity-rank-server.ts`
- [ ] Verified Supabase has `activity_events` table
- [ ] Created `/api/analytics/track` endpoint (if needed)
- [ ] Tested `/shop` page sorting
- [ ] Tested category page sorting
- [ ] Added trending badges (optional)
- [ ] Updated quick filters (optional)
- [ ] Checked database for tracking events
- [ ] Verified ranking API works
- [ ] Tested with different products
- [ ] Monitored conversion improvements

## 📚 Documentation

- **IMPLEMENTATION_GUIDE.md** - Detailed how-to guide
- **TRACKING_SETUP.md** - Complete tracking setup
- **SHOP_CHANGES.md** - Shop page enhancement details
- **CATEGORY_CHANGES.md** - Category page enhancement details

## 🎉 Benefits

✓ Show best-selling products first  
✓ Increase conversion rate  
✓ Real-time ranking based on actual customer engagement  
✓ Time-based weighting (recent is more important)  
✓ Multiple engagement signals (purchases, clicks, views, etc.)  
✓ Automatic trending badges  
✓ Zero performance impact  

## 🤝 Support

For issues:
1. Check the relevant .md file for your issue
2. Verify all files are in correct locations
3. Check browser console and server logs
4. Review Supabase activity_events table for data
5. Run test queries to verify data flow

## 📝 License

Part of E-Commerce Ethnic project - same license as main repo

---

**Questions?** Review the included documentation files or check your server logs for errors.
