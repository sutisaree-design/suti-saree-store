-- ============================================================
-- Track whether the "here's your reward code" confirmation email
-- (lib/email-templates.ts -> reviewRewardIssuedEmail, sent from
-- app/api/review-link/[token]/route.ts right after issueReviewReward())
-- actually went out for a given reward -- so Admin -> Orders -> Email
-- Log can show it the same way it already shows Order
-- Confirmed/Shipped/Arriving/Out for Delivery/Delivered (see
-- 20260930010000_order_confirmation_email_sent_at.sql and
-- 20260817000000_delivery_lifecycle_emails.sql for that existing
-- pattern -- this is the same idea, just per (order, product) instead
-- of per order, since a single order can earn more than one reward
-- (one per reviewed product).
-- ============================================================

ALTER TABLE review_rewards ADD COLUMN IF NOT EXISTS email_sent_at timestamptz;
ALTER TABLE review_rewards ADD COLUMN IF NOT EXISTS email_error text;
