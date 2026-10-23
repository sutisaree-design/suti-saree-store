Changes in this zip (extract and overwrite into your repo root, same folder
structure as below), then commit + push as usual.

1) lib/json-ld.ts                        [NEW FILE]
   Helper: safeJsonLd() — escapes "<" before JSON-LD gets injected via
   dangerouslySetInnerHTML, so a "</script>" inside a product description /
   blog title can never break out of the <script type="application/ld+json">
   tag and run as real JS on the page (stored XSS fix).

2) app/page.tsx                          [MODIFIED]
3) app/product/[slug]/page.tsx           [MODIFIED]
4) app/blog/[slug]/page.tsx              [MODIFIED]
5) app/category/[slug]/page.tsx          [MODIFIED]
   All four now import and use safeJsonLd(jsonLd) instead of the raw
   JSON.stringify(jsonLd) for their structured-data <script> tags.

6) components/admin/products-panel.tsx   [MODIFIED]
   - Manage Products table: rebalanced the 12-column grid (Product 4->3,
     Vendor 2->1, Actions 1->3) and added flex-wrap to the Actions cell,
     so the row of icon buttons (share/video/edit/delete etc.) wraps onto
     a new line instead of overlapping when there are many of them.
   - Vendor badge now truncates instead of overflowing.
   - Safe Profit / cost price: cost price is now remembered per product in
     this browser's localStorage (key: admin_cost_price:<product_id>) —
     still never sent to Supabase/products table, so it can't leak through
     the customer-facing product query. Reopening a product's edit dialog
     now pre-fills the cost price and shows Safe Profit immediately instead
     of it resetting to blank every time.
   - Safe Profit card made visually more prominent (highlighted box, larger
     bold figure) so it's obvious as soon as the Price field is filled in.

After extracting, run `npm run build` once locally to confirm a clean
compile before pushing.
