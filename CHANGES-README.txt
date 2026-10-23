ADDED: GA4 / Google Ads "view_item" and "view_item_list" events

New/changed files (paths match your repo exactly — just overwrite):

1. app/product/[slug]/product-detail.tsx
   - Added a new useEffect that fires gtag('event','view_item', {...})
     once per product page load, with the product's id/name/category and
     the currently selected variant's price. This is what lets Google Ads
     do "dynamic remarketing" (show ads for the exact product someone
     viewed).

2. components/analytics/view-item-list-tracker.tsx  (NEW FILE)
   - Small reusable client component that fires gtag('event',
     'view_item_list', {...}). Needed because app/category/[slug]/page.tsx
     is a server component and can't call gtag directly.

3. app/category/[slug]/page.tsx
   - Mounts <ViewItemListTracker /> with the category's product grid, so
     visiting a category page fires view_item_list.

4. app/shop/shop-content.tsx
   - Added a debounced useEffect that fires view_item_list whenever the
     shop grid the shopper is looking at changes (filters/sort/search).
     Only the first 20 visible items are reported per event.

5. app/collection/[slug]/collection-page-client.tsx
   - Same idea as the shop page, fires view_item_list once a vendor's
     collection page products load.

How to apply:
1. Extract this zip.
2. Copy each file into your local repo at the exact same relative path
   (overwrite existing files; view-item-list-tracker.tsx is new, so it
   just gets added).
3. git add -A
4. git commit -m "feat: add GA4/Google Ads view_item and view_item_list events"
5. git push

After deploying, test in GA4 DebugView:
- Open a product page -> should see a "view_item" event.
- Open /shop, /category/<slug>, or a vendor /collection/<slug> page ->
  should see a "view_item_list" event.

Note: these events won't appear in GA4's "Recent events" list (Admin >
Events) immediately — GA4 normal reporting takes ~24-48h to process new
event names, same as add_to_cart/begin_checkout did earlier. DebugView
will show them in real time immediately though.
