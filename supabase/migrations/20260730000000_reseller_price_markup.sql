-- Reseller pricing switches from a % margin to a plain rupee amount.
-- e.g. base price ₹450, reseller sets customer price ₹550 → ₹100 profit.
-- Old percent columns are left in place (harmless) for backward compatibility;
-- the app no longer reads/writes them going forward.
ALTER TABLE reseller_profiles
  ADD COLUMN IF NOT EXISTS default_markup_amount numeric NOT NULL DEFAULT 100;
