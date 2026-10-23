-- Fix: the import always failed at the upsert step with a Postgres error
-- ("there is no unique or exclusion constraint matching the ON CONFLICT
-- specification"), because the previous migration created a *partial*
-- unique index (`WHERE email IS NOT NULL`), but app/api/admin/
-- woocommerce-import/route.ts upserts with a plain `onConflict: 'email'`.
-- Postgres can only satisfy that kind of ON CONFLICT target against a
-- full unique constraint/index, not a partial one (unless the upsert's
-- own WHERE clause matches the index predicate exactly, which Supabase's
-- upsert() does not add).
--
-- The partial WHERE was defensive but unnecessary: route.ts already skips
-- any order with no billing email (`if (!email) continue;`) before a row
-- is ever built, so every row upserted into this table is guaranteed to
-- have a non-null email. A plain, full unique index is safe and matches
-- what the application code actually sends.

DROP INDEX IF EXISTS idx_woocommerce_customers_email_unique;

CREATE UNIQUE INDEX IF NOT EXISTS idx_woocommerce_customers_email_unique
  ON woocommerce_customers (email);
