/*
  - Remove the "Bridal" category. Any product currently tagged Bridal is
    NOT deleted — it just loses this category link (category_id/name go
    null on that row, same behaviour as deleting a category from the
    Admin > Categories panel). Re-tag that product to a different
    category from Admin > Products afterwards if needed.
  - Add "Blouse" and "Dress" as new categories, ready to pick from the
    Category dropdown when adding/editing a product.
*/

-- Unlink any products still tagged "Bridal" before removing the category,
-- so the delete doesn't fail on a foreign-key constraint.
UPDATE products
SET category_id = NULL, category_name = NULL
WHERE category_id = (SELECT id FROM categories WHERE slug = 'bridal');

DELETE FROM categories WHERE slug = 'bridal';

INSERT INTO categories (name, slug, description) VALUES
  ('Blouse', 'blouse', 'Ready-to-wear blouses'),
  ('Dress', 'dress', 'Ethnic and fusion dresses')
ON CONFLICT (slug) DO NOTHING;
