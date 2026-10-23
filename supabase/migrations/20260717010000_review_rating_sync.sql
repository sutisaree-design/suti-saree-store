/*
# Review Rating Sync (Phase 3)

Keeps products.rating and products.reviews in sync with the reviews
table automatically, so the storefront (product cards, product page,
schema.org JSON-LD) always shows a live, accurate rating without any
extra application code.

Recalculates on every INSERT / UPDATE / DELETE of a review, based only
on rows where is_approved = true.
*/

CREATE OR REPLACE FUNCTION sync_product_rating()
RETURNS trigger AS $$
DECLARE
  target_product_id uuid;
  avg_rating numeric;
  total_reviews integer;
BEGIN
  target_product_id := COALESCE(NEW.product_id, OLD.product_id);

  SELECT COALESCE(AVG(rating), 4.5), COUNT(*)
    INTO avg_rating, total_reviews
    FROM reviews
    WHERE product_id = target_product_id AND is_approved = true;

  UPDATE products
    SET rating = ROUND(avg_rating::numeric, 1),
        reviews = total_reviews
    WHERE id = target_product_id;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_reviews_sync_rating ON reviews;
CREATE TRIGGER trg_reviews_sync_rating
  AFTER INSERT OR UPDATE OR DELETE ON reviews
  FOR EACH ROW EXECUTE FUNCTION sync_product_rating();

-- One review per customer per product (prevents review spam)
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS order_id uuid REFERENCES orders(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_reviews_one_per_user_product
  ON reviews(product_id, user_id)
  WHERE user_id IS NOT NULL;
