-- Fix: "Verified Purchase" was previously hardcoded in the UI for every
-- review, regardless of whether the reviewer actually bought the product.
-- Google Merchant Center flagged this as a Misrepresentation risk (a false
-- trust badge). This migration adds a real verified_purchase column that
-- gets set at submit-time based on an actual delivered-order check, and the
-- storefront now only shows the badge when this is true.

ALTER TABLE reviews
  ADD COLUMN IF NOT EXISTS verified_purchase boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_reviews_verified_purchase ON reviews(verified_purchase);

-- Backfill existing reviews: mark verified_purchase = true for any review
-- whose author has a matching order_items row for that product, so past
-- genuine purchasers aren't downgraded.
UPDATE reviews r
SET verified_purchase = true
WHERE r.user_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    WHERE oi.product_id = r.product_id
      AND o.user_id = r.user_id
  );
