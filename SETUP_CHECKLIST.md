# ⚡ Quick Setup Checklist

## 🏃 Fast Track (5 Minutes)

- [ ] Copy all files to respective folders
- [ ] Run SQL migration in Supabase
- [ ] Update `.env.local` with Supabase keys
- [ ] Test locally: `npm run dev`
- [ ] Git push: `git add . && git commit -m "Add product tracking"` 
- [ ] Vercel auto-deploys
- [ ] Visit `/admin/analytics` to see dashboard

---

## 📋 File-by-File Checklist

### Database
- [ ] Run `add_product_views_tracking.sql` in Supabase SQL Editor

### API Routes
- [ ] Create `app/api/track-view/route.ts`
- [ ] Create `app/api/products/popular/route.ts`

### Libraries & Hooks
- [ ] Create/Update `lib/track-views.ts`
- [ ] Create/Update `hooks/useProductTracking.ts`

### Components
- [ ] Update `components/product-card.tsx`
- [ ] Update `app/shop/shop-content.tsx`

### Admin
- [ ] Create folder `app/admin/analytics/`
- [ ] Create `app/admin/analytics/page.tsx`

### Environment
- [ ] Verify `.env.local` has Supabase keys

---

## 🧪 Testing Checklist

Local Testing (`npm run dev`):
- [ ] Open `/shop` page
- [ ] Verify "Popularity" sort button appears
- [ ] Click a product
- [ ] Check DevTools Network → `/api/track-view` called
- [ ] Refresh page → product views increased
- [ ] Open `/admin/analytics`
- [ ] Verify charts show data

Live Testing (Vercel):
- [ ] Visit your live shop
- [ ] Click products
- [ ] Wait 1-2 minutes
- [ ] Check `/admin/analytics` on live site
- [ ] Verify views increase

---

## 🔧 Common Issues & Fixes

| Issue | Solution |
|-------|----------|
| API call fails | Check SUPABASE keys in .env.local |
| Sorting doesn't work | Verify `views` column exists |
| Dashboard shows no data | Wait for data to sync, refresh page |
| 404 on `/admin/analytics` | Ensure file is in correct path |
| "Cannot find module" | Check imports paths match your file locations |

---

## 📊 Verification

After setup, you should see:

✅ **Shop Page:**
- Popularity sort button
- View counts under each product

✅ **Admin Dashboard (`/admin/analytics`):**
- Total Views counter
- Total Clicks counter  
- Conversion Rate percentage
- Bar charts showing top products
- Detailed table with all metrics

✅ **Database:**
- products table has `views` column
- product_views_log table exists
- Views incrementing on clicks

---

## 🚀 Go Live!

```bash
# After completing all checks:
git add .
git commit -m "✨ Add product tracking & analytics dashboard"
git push
# Vercel auto-deploys!

# Then visit:
# - Shop: yoursite.com/shop (click Popularity button)
# - Admin: yoursite.com/admin/analytics (see all data)
```

---

## 💡 Pro Tips

1. **Monitor in real-time**: Keep `/admin/analytics` open while clicking products
2. **Test Google Ads**: Click through from ads → views should increase
3. **Check logs**: Supabase → Logs tab for debugging
4. **Optimize images**: Keep product images under 500KB for fast loads

---

**Status:** Ready to deploy! ✨
