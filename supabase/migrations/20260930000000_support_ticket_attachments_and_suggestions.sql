-- Support ticket attachments + admin product suggestions
--
-- Two additive features on top of support_tickets:
--   1. Attachments: a shopper can attach one photo when raising a ticket
--      from the chat widget (customer_attachment_url), and the admin can
--      attach one photo/file when replying (reply_attachment_url) --
--      e.g. a size-chart photo, a replacement item photo, a courier POD.
--   2. Product suggestion: when replying, the admin can pick a product
--      from the catalog to recommend to the shopper. Stored both as a
--      normalized FK (suggested_product_id, for joins / catalog changes)
--      and a denormalized snapshot (suggested_product jsonb -- name,
--      slug, image, price at the time it was suggested) so the chat
--      widget can render it without an extra product lookup and the
--      email/reply keeps showing the right thing even if the product is
--      later edited or removed from the catalog.

ALTER TABLE support_tickets
  ADD COLUMN IF NOT EXISTS attachment_url text,
  ADD COLUMN IF NOT EXISTS reply_attachment_url text,
  ADD COLUMN IF NOT EXISTS suggested_product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS suggested_product jsonb;

-- Storage bucket for both directions of attachment (customer + admin),
-- public read (same pattern as review-images / product-images).
INSERT INTO storage.buckets (id, name, public)
VALUES ('support-attachments', 'support-attachments', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "anon_read_support_attachments" ON storage.objects;
CREATE POLICY "anon_read_support_attachments" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'support-attachments');

-- Upload is open to anon+authenticated, same reasoning as
-- anon_insert_support_tickets in 20260727000000_chat_support_tickets.sql:
-- shoppers raise tickets (and now attach a photo) before ever having an
-- account, straight from the chat widget. Server-side routes
-- (app/api/chat/upload-attachment, app/api/admin/support-tickets/
-- upload-attachment) do the actual size/type validation either way.
DROP POLICY IF EXISTS "anon_insert_support_attachments" ON storage.objects;
CREATE POLICY "anon_insert_support_attachments" ON storage.objects
  FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id = 'support-attachments');
