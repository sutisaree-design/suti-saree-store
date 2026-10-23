/*
  Expand the categories table with the full range of women's handloom
  ethnic-wear categories, so the admin's "Category" dropdown (Add/Edit
  Product) has every commonly-needed option ready to select instead of
  the admin having to type a new one in every time. Safe to re-run —
  ON CONFLICT (slug) skips anything that already exists.

  This does not touch the 4 categories seeded earlier
  (20260717020100_seed_default_categories.sql) or any category an
  admin has already added by hand.
*/

INSERT INTO categories (name, slug, description) VALUES
  ('Cotton Sarees', 'cotton-sarees', 'Breathable handloom cotton sarees for everyday wear'),
  ('Linen Sarees', 'linen-sarees', 'Lightweight handwoven linen sarees'),
  ('Banarasi Sarees', 'banarasi-sarees', 'Silk sarees woven in Varanasi with signature zari work'),
  ('Kanjivaram Sarees', 'kanjivaram-sarees', 'Traditional South Indian silk sarees from Kanchipuram'),
  ('Tussar Silk Sarees', 'tussar-silk-sarees', 'Textured wild-silk sarees with a natural gold sheen'),
  ('Chanderi Sarees', 'chanderi-sarees', 'Sheer, lightweight sarees woven in Chanderi'),
  ('Handloom Sarees', 'handloom-sarees', 'General handloom sarees from weaver clusters across India'),
  ('Kurta Sets', 'kurta-sets', 'Kurta with matching bottoms and dupatta'),
  ('Salwar Suits', 'salwar-suits', 'Unstitched and stitched salwar suit sets'),
  ('Anarkali Suits', 'anarkali-suits', 'Flowing Anarkali-style suits for festive occasions'),
  ('Palazzo Sets', 'palazzo-sets', 'Kurti or top paired with palazzo pants'),
  ('Gowns', 'gowns', 'Party and evening gowns in handloom and silk fabrics'),
  ('Dupatta & Stoles', 'dupatta-stoles', 'Handwoven dupattas and stoles to pair with any outfit'),
  ('Blouse Pieces', 'blouse-pieces', 'Ready and unstitched blouse fabric for sarees'),
  ('Dress Material', 'dress-material', 'Unstitched fabric sets ready for tailoring')
ON CONFLICT (slug) DO NOTHING;
