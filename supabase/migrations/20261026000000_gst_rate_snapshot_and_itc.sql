-- ============================================================
-- 1) Per-product GST on every order (server-side, authoritative)
--
-- Checkout used one flat rate (Admin > Settings > gst_rate_percent) for the
-- whole cart, so a product set to 18% in products.gst_rate was still booked
-- at 5%. This trigger recomputes orders.gst_amount from each line's own
-- products.gst_rate (falling back to the flat rate), and writes the rate and
-- HSN used onto each line of orders.items so the GST report can use the rate
-- that applied AT SALE TIME even if the product is edited later.
--
-- Same maths as lib/gst-report.ts: invoice value = total_amount +
-- gift_card_discount (gift card is a payment, not a discount); discount and
-- shipping are spread over the lines pro-rata; GST is extracted from the
-- GST-inclusive amount. total_amount is NOT changed (prices stay inclusive).
-- Fires on INSERT and when value-bearing columns change, so it also covers
-- app/api/orders/[id]/apply-discount which recomputes totals.
-- ============================================================
CREATE OR REPLACE FUNCTION public.orders_set_gst()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_default numeric;
  v_inv numeric;
  v_merch numeric := 0;
  v_n integer;
  v_tax numeric := 0;
  v_elem jsonb;
  v_pid uuid;
  v_rate numeric;
  v_hsn text;
  v_share numeric;
  v_line numeric;
  v_new jsonb := '[]'::jsonb;
BEGIN
  IF NEW.items IS NULL OR jsonb_typeof(NEW.items) <> 'array' OR jsonb_array_length(NEW.items) = 0 THEN
    RETURN NEW;
  END IF;

  SELECT coalesce((value->>'gst_rate_percent')::numeric, 5) INTO v_default FROM settings WHERE key = 'shipping';
  v_default := coalesce(v_default, 5);
  v_n := jsonb_array_length(NEW.items);
  v_inv := coalesce(NEW.total_amount, 0) + coalesce(NEW.gift_card_discount, 0);

  SELECT coalesce(sum(coalesce((e->>'price')::numeric, 0) * coalesce((e->>'quantity')::numeric, 0)), 0)
    INTO v_merch FROM jsonb_array_elements(NEW.items) AS e;

  FOR v_elem IN SELECT t.value FROM jsonb_array_elements(NEW.items) WITH ORDINALITY AS t(value, ord) ORDER BY t.ord
  LOOP
    BEGIN
      v_pid := NULLIF(v_elem->>'product_id', '')::uuid;
    EXCEPTION WHEN others THEN
      v_pid := NULL;
    END;

    v_rate := NULLIF(v_elem->>'gst_rate', '')::numeric;       -- already snapshotted? keep it
    v_hsn := NULLIF(v_elem->>'hsn_code', '');
    IF v_rate IS NULL OR v_hsn IS NULL THEN
      SELECT coalesce(v_rate, p.gst_rate), coalesce(v_hsn, p.hsn_code)
        INTO v_rate, v_hsn FROM products p WHERE p.id = v_pid;
    END IF;
    v_rate := coalesce(v_rate, v_default);

    IF v_merch > 0 THEN
      v_share := (coalesce((v_elem->>'price')::numeric, 0) * coalesce((v_elem->>'quantity')::numeric, 0)) / v_merch;
    ELSE
      v_share := 1.0 / v_n;
    END IF;
    v_line := v_inv * v_share;
    v_tax := v_tax + (v_line - (v_line * 100) / (100 + v_rate));

    v_new := v_new || jsonb_build_array(
      v_elem || jsonb_build_object('gst_rate', v_rate)
             || CASE WHEN v_hsn IS NOT NULL THEN jsonb_build_object('hsn_code', v_hsn) ELSE '{}'::jsonb END
    );
  END LOOP;

  NEW.gst_amount := round(v_tax)::integer;
  NEW.items := v_new;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_set_gst ON orders;
CREATE TRIGGER trg_orders_set_gst
  BEFORE INSERT OR UPDATE OF items, total_amount, shipping_charge, gift_card_discount ON orders
  FOR EACH ROW EXECUTE FUNCTION public.orders_set_gst();

-- ============================================================
-- 2) Input tax credit (ITC) on Delhivery and Razorpay invoices
-- Money data: RLS on, NO policies -> only the service-role admin API can touch it.
-- ============================================================
CREATE TABLE IF NOT EXISTS gst_itc_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month text NOT NULL CHECK (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  vendor text NOT NULL CHECK (vendor IN ('delhivery', 'razorpay', 'other')),
  invoice_no text NOT NULL,
  invoice_date date,
  taxable numeric(12, 2) NOT NULL DEFAULT 0 CHECK (taxable >= 0),
  igst numeric(12, 2) NOT NULL DEFAULT 0 CHECK (igst >= 0),
  cgst numeric(12, 2) NOT NULL DEFAULT 0 CHECK (cgst >= 0),
  sgst numeric(12, 2) NOT NULL DEFAULT 0 CHECK (sgst >= 0),
  in_gstr2b boolean NOT NULL DEFAULT false,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (vendor, invoice_no)
);
ALTER TABLE gst_itc_entries ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_gst_itc_entries_month ON gst_itc_entries(month);

-- Editable defaults (rates only, nothing sensitive)
INSERT INTO settings (key, value)
VALUES ('gst_itc_defaults',
  '{"delhivery_gst_rate": 18, "razorpay_gst_rate": 18, "razorpay_fee_percent_ex_gst": 2, "logistics_cost_includes_gst": true}'::jsonb)
ON CONFLICT (key) DO NOTHING;
