-- Order email log: fills in the two lifecycle emails that didn't already
-- have a dedicated "when did we send this" column, so Admin -> Orders can
-- show a complete send-log per order (Confirmed / Shipped / Arriving /
-- Out for Delivery / Delivered), matching what already existed for
-- confirmation_email_sent_at (20260930010000) and arriving/out-for-delivery
-- (20260817000000).
--
-- shipped_email_sent_at is set by app/api/admin/delhivery/create-shipment,
-- the moment orderShippedEmail actually sends.
--
-- delivered_email_sent_at is set by lib/orders-api.ts's updateOrderStatus()
-- (the real path -- admin dropdown or the auto-detect cron both funnel
-- through here) whenever the status-change email fires for a transition
-- INTO 'delivered', and by lib/delivery-notifications.ts's
-- sendDeliveredNotification() force-resend branch (admin test panel).
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipped_email_sent_at timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivered_email_sent_at timestamptz;
