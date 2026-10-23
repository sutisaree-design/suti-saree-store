-- Optional brand/business name a reseller can attach to a resale order,
-- entered directly at checkout (shown on their own invoice to their customer).
ALTER TABLE orders ADD COLUMN IF NOT EXISTS reseller_brand_name text;
