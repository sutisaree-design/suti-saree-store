-- GST report support: HSN code per product (GSTR-1 HSN summary needs it).
-- products.gst_rate already exists (default 5).
ALTER TABLE products ADD COLUMN IF NOT EXISTS hsn_code text;

-- Default HSN used for products that have no hsn_code of their own.
INSERT INTO settings (key, value)
VALUES ('gst_settings', '{"default_hsn": "5007", "default_description": "Sarees and ethnic wear"}'::jsonb)
ON CONFLICT (key) DO NOTHING;
