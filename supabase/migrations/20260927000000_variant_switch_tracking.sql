-- Adds 'variant_switch' as a valid activity_events.event_type so we can
-- log every time a shopper switches colour/variant on a product page.
-- This is what powers "which variation do people switch to the most"
-- in the admin analytics dashboard (see app/api/admin/variant-switches/route.ts).
--
-- Logged from: app/product/[slug]/product-detail.tsx -> handleSelectVariant()
--   event_type   'variant_switch'
--   product_id   the BASE product id (so all colours of one product roll up together)
--   metadata     { fromColor, toColor, toVariantId, toSlug }

ALTER TABLE activity_events DROP CONSTRAINT IF EXISTS activity_events_event_type_check;

ALTER TABLE activity_events
  ADD CONSTRAINT activity_events_event_type_check
  CHECK (event_type IN ('page_view', 'product_view', 'add_to_cart', 'wishlist', 'checkout_start', 'purchase', 'search', 'variant_switch'));
