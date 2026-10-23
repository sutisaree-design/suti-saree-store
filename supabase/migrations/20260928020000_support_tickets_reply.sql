-- Lets the admin panel actually email the customer back from a support
-- ticket (previously only "status" + "admin_notes" existed, and
-- admin_notes is never customer-facing -- see components/admin/
-- support-tickets-panel.tsx). Mirrors the reply_message/replied_at
-- pattern already used by contact_messages.

ALTER TABLE support_tickets
  ADD COLUMN IF NOT EXISTS reply_message text,
  ADD COLUMN IF NOT EXISTS replied_at timestamptz;
