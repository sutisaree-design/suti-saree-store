-- COD one-tap confirmation (additive only -- no existing column or flow changes).
-- The customer gets a secret link by email / WhatsApp; tapping it on
-- /confirm-order/[token] stamps cod_confirmed_at. Order status is NOT changed,
-- so shipping, Delhivery, invoices and reports behave exactly as before.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS cod_confirm_token text,
  ADD COLUMN IF NOT EXISTS cod_confirm_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS cod_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS cod_confirmed_via text;

CREATE UNIQUE INDEX IF NOT EXISTS orders_cod_confirm_token_key
  ON public.orders (cod_confirm_token)
  WHERE cod_confirm_token IS NOT NULL;
