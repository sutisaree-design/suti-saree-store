/*
  Fix: "Category" dropdown was empty when adding/editing a product.

  Root cause: the storefront nav (Shop All / Silk Sarees / Lehenga /
  Bridal / Kurti) is hardcoded in components/header.tsx, completely
  separate from the `categories` table that the admin Product form
  reads from. Nobody had ever added a row to that table, so the
  dropdown had nothing to show.

  Fix: seed it with the same four categories the storefront already
  advertises, so the admin dropdown works immediately. Safe to re-run;
  ON CONFLICT (slug) skips any that already exist (e.g. if you already
  added some manually from the Categories tab).
*/

INSERT INTO categories (name, slug, description) VALUES
  ('Silk Sarees', 'silk-sarees', 'Handwoven silk sarees crafted by master artisans'),
  ('Lehenga', 'lehenga', 'Festive and bridal lehengas'),
  ('Bridal', 'bridal', 'Curated bridal edit'),
  ('Kurti', 'kurti', 'Everyday and occasion kurtis')
ON CONFLICT (slug) DO NOTHING;
