# 🎯 Product Views Tracking System - Implementation Guide

## ✅ What This System Does

- ✨ **Tracks product views** automatically when users view products
- 📊 **Sorts products by popularity** (most viewed first)
- 📈 **Admin dashboard** to see analytics and metrics
- 🔗 **Click tracking** from Google Ads and other sources
- 💾 **Persistent logging** of all views for detailed analytics

---

## 📁 Files Included

| File | Path | Purpose |
|------|------|---------|
| `add_product_views_tracking.sql` | `supabase/migrations/` | Database schema update |
| `route-track-view.ts` | `app/api/track-view/route.ts` | API for tracking views |
| `route-products-popular.ts` | `app/api/products/popular/route.ts` | API for fetching popular products |
| `lib-track-views.ts` | `lib/track-views.ts` | Tracking utilities |
| `hooks-useProductTracking.ts` | `hooks/useProductTracking.ts` | React hook for tracking |
| `product-card-updated.tsx` | `components/product-card.tsx` | Updated product card component |
| `shop-content-updated.tsx` | `app/shop/shop-content.tsx` | Updated shop page with sorting |
| `admin-analytics-page.tsx` | `app/admin/analytics/page.tsx` | Admin dashboard |

---

## 🚀 Step-by-Step Implementation

### Step 1: Update Database Schema
```bash
# Run the migration in Supabase
# Option A: Using Supabase CLI
supabase migration up

# Option B: Manually in Supabase Studio
# Go to SQL Editor → Copy content from add_product_views_tracking.sql → Run
```

### Step 2: Create/Update API Routes

1. **Create** `app/api/track-view/route.ts`
   - Copy content from `route-track-view.ts`

2. **Create** `app/api/products/popular/route.ts`
   - Copy content from `route-products-popular.ts`

### Step 3: Update Utilities

1. **Create/Update** `lib/track-views.ts`
   - Copy content from `lib-track-views.ts`

2. **Create/Update** `hooks/useProductTracking.ts`
   - Copy content from `hooks-useProductTracking.ts`

### Step 4: Update Components

1. **Update** `components/product-card.tsx`
   - Replace with content from `product-card-updated.tsx`
   - This adds click tracking to every product

2. **Update** `app/shop/shop-content.tsx`
   - Replace with content from `shop-content-updated.tsx`
   - This adds "Popularity" sorting button

### Step 5: Create Admin Dashboard

1. **Create folder** `app/admin/analytics/`
2. **Create** `app/admin/analytics/page.tsx`
   - Copy content from `admin-analytics-page.tsx`

### Step 6: Environment Variables

Make sure you have these in `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=your_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_key
SUPABASE_SERVICE_KEY=your_service_key
```

---

## 🎮 How It Works

### When User Clicks a Product:
```
1. Product Card renders → useProductTracking hook initializes
2. User clicks product → handleProductClick() called
3. trackProductView() sends POST to /api/track-view
4. API increments views count in database
5. View logged to product_views_log table
6. Product sorted to top (by views)
```

### Shop Page Sorting:
```
1. Click "Popularity" button
2. Shop page queries database ORDER BY views DESC
3. Most viewed products appear first
4. Google Ads clicks automatically increase views
```

### Admin Dashboard:
```
1. Visit /admin/analytics
2. See top products by views/clicks
3. View charts and conversion rates
4. All data updates in real-time
```

---

## 🔧 Customization

### Change Sort Order
In `shop-content-updated.tsx`, modify the switch statement:
```typescript
switch (sortBy) {
  case 'popular':
    query = query.order('views', { ascending: false }); // HIGH to LOW
    break;
}
```

### Add More Metrics
In `admin-analytics-page.tsx`, add new charts:
```typescript
// Example: Add revenue chart
const revenueData = topProducts.map(p => ({
  name: p.name,
  revenue: p.price * p.clicks
}));
```

### Track Custom Events
Use the tracking hook anywhere:
```typescript
import { useProductTracking } from '@/hooks/useProductTracking';

export default function MyComponent() {
  const { trackView } = useProductTracking();

  const handleCustomAction = async () => {
    await trackView(productId, 'custom-event');
  };
}
```

---

## 📊 Database Schema

### New Columns in `products` table:
- `views` (INTEGER) - Total views count
- `clicks` (INTEGER) - Total clicks count
- `last_viewed_at` (TIMESTAMP) - Last view timestamp

### New Table `product_views_log`:
| Column | Type | Purpose |
|--------|------|---------|
| id | UUID | Primary key |
| product_id | UUID | Product reference |
| user_id | UUID | User reference (optional) |
| viewed_at | TIMESTAMP | When viewed |
| referrer | TEXT | Page referrer |
| source | TEXT | Click source (google-ads, direct, etc) |

---

## ✨ Features

- ✅ **Real-time tracking** - Updates instantly
- ✅ **No API key needed** - Uses Supabase anon key
- ✅ **Automatic sorting** - Popularity button ready
- ✅ **Admin dashboard** - Full analytics view
- ✅ **Google Ads compatible** - Tracks ads clicks
- ✅ **Detailed logging** - Each view is logged
- ✅ **Performance optimized** - Indexed queries

---

## 🐛 Troubleshooting

### Views not incrementing?
1. Check `/api/track-view` is working (check Network tab in DevTools)
2. Verify Supabase connection and credentials
3. Check database has `views` column

### Sorting not working?
1. Make sure `views` column exists in products table
2. Check `order()` query syntax is correct
3. Verify data is being sent to database

### Admin dashboard empty?
1. Ensure there are products with views > 0
2. Check Supabase connection
3. Verify RLS policies allow reading products

---

## 📞 Support

If you face any issues:
1. Check browser console for errors
2. Check Supabase logs for API errors
3. Verify all files are created in correct paths
4. Make sure imports are correct

---

## 🚀 Next Steps

1. ✅ Implement the files above
2. ✅ Test with local `npm run dev`
3. ✅ Push to GitHub
4. ✅ Vercel will auto-deploy
5. ✅ Check admin dashboard: `/admin/analytics`
6. ✅ Watch products get sorted by popularity!

**Happy tracking! 📊🎉**
