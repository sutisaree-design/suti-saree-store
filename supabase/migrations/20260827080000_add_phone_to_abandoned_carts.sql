-- Adds a phone column to abandoned_carts so the admin panel can offer a
-- free "Send WhatsApp" recovery action (a wa.me click-to-chat link) next
-- to the existing "Send recovery email" button, with no WhatsApp Business
-- API / per-message billing involved.
ALTER TABLE abandoned_carts ADD COLUMN IF NOT EXISTS phone text;
