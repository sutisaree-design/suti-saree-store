-- Support tickets raised directly from the on-site AI chat widget
-- (e.g. "my order is delayed", "wrong item received") when the AI /
-- quick-reply flow can't fully resolve the shopper's issue and they
-- want a human to follow up. Visible + manageable from
-- Admin > Support Tickets.

CREATE TABLE IF NOT EXISTS support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES orders(id) ON DELETE SET NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  customer_name text,
  customer_email text NOT NULL,
  subject text NOT NULL,
  message text NOT NULL,
  source text NOT NULL DEFAULT 'chat' CHECK (source IN ('chat', 'admin', 'email', 'other')),
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  admin_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;

-- Ticket creation happens through the server-side chat API routes
-- (service-role client), same pattern used for orders/returns, so we
-- keep policies permissive here and enforce access in the API layer.
DROP POLICY IF EXISTS "anon_insert_support_tickets" ON support_tickets;
CREATE POLICY "anon_insert_support_tickets" ON support_tickets FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "own_select_support_tickets" ON support_tickets;
CREATE POLICY "own_select_support_tickets" ON support_tickets FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_update_support_tickets" ON support_tickets;
CREATE POLICY "anon_update_support_tickets" ON support_tickets FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_support_tickets_order_id ON support_tickets(order_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_support_tickets_email ON support_tickets(customer_email);

DROP TRIGGER IF EXISTS trg_support_tickets_touch_updated_at ON support_tickets;
CREATE TRIGGER trg_support_tickets_touch_updated_at
  BEFORE UPDATE ON support_tickets
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
