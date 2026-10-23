-- Phase 12: Google Merchant Center required apparel attributes
--
-- Google requires color, size, gender, and age_group for every Apparel &
-- Accessories product (both free listings and Shopping ads) -- products
-- missing these get disapproved. `color` and `size` are already covered by
-- the existing `colors[]` / `sizes[]` arrays; this adds the remaining two,
-- plus `material` and `pattern` (recommended, improves Shopping match
-- quality / search relevance).

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS gender text NOT NULL DEFAULT 'female'
    CHECK (gender IN ('male', 'female', 'unisex')),
  ADD COLUMN IF NOT EXISTS age_group text NOT NULL DEFAULT 'adult'
    CHECK (age_group IN ('newborn', 'infant', 'toddler', 'kids', 'adult')),
  ADD COLUMN IF NOT EXISTS material text,
  ADD COLUMN IF NOT EXISTS pattern text;
