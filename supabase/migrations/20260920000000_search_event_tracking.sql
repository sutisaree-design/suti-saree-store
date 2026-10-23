-- Adds 'search' as a valid activity_events.event_type so every shopper
-- search (typed + submitted, or picked from the suggestion dropdown) can be
-- logged the same lightweight way page_view/product_view already are (see
-- 20260720000000_phase11_admin_analytics.sql). Powers the new Admin >
-- Analytics > Search tab: top searched terms, and specifically which
-- searches returned zero results, so the admin knows what to tag/add
-- products for.
--
-- Row shape for a search event (nothing new added to the table -- reuses
-- existing columns):
--   event_type   'search'
--   page_path    '/search' or '/shop' (wherever the search box that fired it lives)
--   metadata     { "query": "<what was typed>", "resultsCount": <number> }

ALTER TABLE activity_events DROP CONSTRAINT IF EXISTS activity_events_event_type_check;

ALTER TABLE activity_events
  ADD CONSTRAINT activity_events_event_type_check
  CHECK (event_type IN ('page_view', 'product_view', 'add_to_cart', 'wishlist', 'checkout_start', 'purchase', 'search'));
