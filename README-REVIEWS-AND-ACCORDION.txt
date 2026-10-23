REVIEWS SEPARATED + KEPT OPEN AT TOP, INFO SECTIONS NOW ACCORDION — 1 file
=============================================================================

WHAT CHANGED
------------
app/product/[slug]/product-detail.tsx

Old layout: one horizontal Tabs bar with 4 tabs -- "Reviews", "Description",
"Details", "Shipping & Returns" -- only one visible at a time, and Reviews
was just another tab a shopper had to remember to click.

New layout:
  1. "Reviews (N)" -- own section, ALWAYS open/visible, sits at the TOP
     (right after the buy box / coupon area, before everything else).
     Not inside any tab or accordion anymore -- nothing to click to see it.
  2. Below that, the remaining info collapses into an ACCORDION (matches
     the "Core Features / Details / Delivery & Returns / Care Guide"
     style from your reference screenshot):
       - Core Features   (was the "Description" tab -- product description
                           + colour style note + handcrafted-artisan blurb)
       - Details         (was the "Details" tab -- Fabric/Origin/Category/
                           Colors/Sizes/Stock/SKU. "Care: Dry clean only"
                           moved out of here into its own Care Guide item
                           below, since it deserves its own section per
                           your reference design)
       - Delivery & Returns  (was the "Shipping & Returns" tab -- same
                           live admin-driven text, unchanged)
       - Care Guide      (new item -- the dry-clean/storage line, now its
                           own expandable row instead of buried in Details)
     "Core Features" opens by default (defaultValue="core-features"); the
     other three start collapsed, exactly like your screenshot.

  - "Reviews" click-through from elsewhere on the page (e.g. tapping the
     star-rating summary near the top) now scrolls to the new
     #product-reviews section instead of switching a tab -- goToReviews()
     was updated accordingly.
  - Removed the now-unused activeTab/setActiveTab state and the Tabs/
    TabsList/TabsTrigger/TabsContent imports; added Accordion/
    AccordionItem/AccordionTrigger/AccordionContent from
    components/ui/accordion.tsx (already in your repo, Radix-based,
    no new dependency).

HOW TO APPLY
------------
1. Copy app/product/[slug]/product-detail.tsx from this zip into your
   repo at the same path (overwrite the existing file).
2. Commit and push:
     git add "app/product/[slug]/product-detail.tsx"
     git commit -m "redesign: reviews as standalone open section at top, info as accordion"
     git push
3. Vercel/Netlify will redeploy automatically on push if connected,
   otherwise trigger a deploy manually.
4. Spot check on mobile:
     - Reviews are visible immediately, no tap needed
     - Tapping the star-rating summary near the top scrolls down to Reviews
     - Core Features / Details / Delivery & Returns / Care Guide expand/
       collapse independently, Core Features open by default
