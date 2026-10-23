-- Track which WooCommerce store each imported customer actually came from.
--
-- Until now, woocommerce_customers had no record of the source store, so
-- if the admin imported from more than one WooCommerce site, every
-- customer's "source store" for the drip automation's disclosure line
-- ("you previously purchased from X") came from a single GLOBAL setting
-- (woocommerce_drip_automation_settings.sourceStoreName). That meant
-- customers actually imported from Store B would incorrectly get told
-- they'd purchased from Store A (whichever store name the admin happened
-- to have typed into the setting most recently) -- confusing and could
-- read as spammy/incorrect to the recipient.
--
-- email is still the one global de-dup key across every store (see
-- idx_woocommerce_customers_email_unique) -- this column doesn't change
-- that. It only records, per row, which store's orders that row's data
-- most recently came from, so the automation/campaign code can look up
-- the *correct* store name per customer instead of relying on one
-- global setting.
ALTER TABLE woocommerce_customers ADD COLUMN IF NOT EXISTS source_store_url text;

CREATE INDEX IF NOT EXISTS idx_woocommerce_customers_source_store_url
  ON woocommerce_customers (source_store_url);
