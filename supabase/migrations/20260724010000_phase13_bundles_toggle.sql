-- Adds the "bundles_enabled" master toggle to growth_settings for anyone
-- who already ran 20260724000000_phase13_growth_marketing.sql before this
-- key existed. Safe to run even if growth_settings doesn't exist yet.

UPDATE settings
SET value = value || '{"bundles_enabled": true}'::jsonb
WHERE key = 'growth_settings'
  AND NOT (value ? 'bundles_enabled');
