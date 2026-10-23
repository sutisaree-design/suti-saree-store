-- Partial / split shipments
--
-- One order can now go out as several Delhivery shipments (e.g. 2 sarees
-- ordered, 1 in stock today, the 2nd ships in the next lot 4-7 days later).
-- Each shipment has its own waybill, items, tracking and lifecycle state.
--
-- orders.tracking_number / courier_name still hold the FIRST shipment's
-- waybill so everything that already reads them (vendor dashboard, returns,
-- invoices, cancel gating, ...) keeps working unchanged.
--
-- Only ever read/written via the service-role client (getSupabaseAdmin) --
-- RLS is enabled with no anon/authenticated policies on purpose.

CREATE TABLE IF NOT EXISTS order_shipments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  shipment_no integer NOT NULL,
  waybill text NOT NULL,
  courier_name text NOT NULL DEFAULT 'Delhivery',
  shipping_mode text NOT NULL DEFAULT 'S',
  weight_grams integer,
  length_cm numeric,
  width_cm numeric,
  height_cm numeric,
  -- Positions (0-based) in orders.items[] that are inside this shipment, plus
  -- a frozen copy of those items for display/emails.
  item_indexes integer[] NOT NULL DEFAULT '{}',
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Cash Delhivery collects for THIS shipment (0 for prepaid).
  cod_amount numeric NOT NULL DEFAULT 0,
  -- true when other items of the order were still left behind at creation.
  is_partial boolean NOT NULL DEFAULT false,
  -- Promise shown to the customer for the remaining items ("4 to 7 days").
  next_shipment_min_days integer,
  next_shipment_max_days integer,
  expected_delivery_date date,
  delivery_status text,
  delivery_status_updated_at timestamptz,
  delivery_last_checked_at timestamptz,
  out_for_delivery boolean NOT NULL DEFAULT false,
  shipped_email_sent_at timestamptz,
  out_for_delivery_email_sent_at timestamptz,
  delivered_email_sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, shipment_no),
  UNIQUE (waybill)
);

CREATE INDEX IF NOT EXISTS order_shipments_order_id_idx ON order_shipments (order_id);
CREATE INDEX IF NOT EXISTS order_shipments_open_idx
  ON order_shipments (delivery_status)
  WHERE delivery_status IS DISTINCT FROM 'delivered'
    AND delivery_status IS DISTINCT FROM 'rto_delivered';

ALTER TABLE order_shipments ENABLE ROW LEVEL SECURITY;

-- Back-fill: every order that already has a waybill becomes shipment #1
-- (covering all its items) so old orders look identical in the new UI.
INSERT INTO order_shipments (
  order_id, shipment_no, waybill, courier_name, item_indexes, items, cod_amount,
  is_partial, expected_delivery_date, delivery_status, delivery_status_updated_at,
  out_for_delivery, shipped_email_sent_at, out_for_delivery_email_sent_at,
  delivered_email_sent_at, created_at
)
SELECT
  o.id, 1, o.tracking_number, COALESCE(o.courier_name, 'Delhivery'),
  COALESCE((SELECT array_agg(i - 1) FROM generate_series(1, jsonb_array_length(o.items)) AS i), '{}'),
  o.items,
  CASE WHEN o.payment_method = 'cod' THEN o.total_amount ELSE 0 END,
  false, o.expected_delivery_date, o.delivery_status, o.delivery_status_updated_at,
  COALESCE(o.out_for_delivery, false), o.shipped_email_sent_at, o.out_for_delivery_email_sent_at,
  o.delivered_email_sent_at, now()
FROM orders o
WHERE o.tracking_number IS NOT NULL
  AND jsonb_typeof(o.items) = 'array'
ON CONFLICT DO NOTHING;
