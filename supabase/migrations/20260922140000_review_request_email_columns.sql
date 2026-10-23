-- Review-request emails: after an order is delivered we now email the
-- customer (a few days later, so they've actually had time to use/wear the
-- product) asking for a star rating + written review + photo upload, and a
-- single follow-up reminder if they still haven't reviewed a bit later.
--
-- Same pattern as 20260902000000_order_email_log_columns.sql --
-- *_sent_at columns are the dedupe guard so the daily cron never sends
-- either of these twice for the same order.
--
-- review_request_email_sent_at -- set by lib/review-notifications.ts's
--   sendReviewRequestNotification(), fired by
--   lib/cron-jobs.ts's runReviewRequestEmailsJob() once an order has been
--   'delivered' for REVIEW_REQUEST_DELAY_DAYS.
--
-- review_reminder_email_sent_at -- set by sendReviewReminderNotification(),
--   fired by runReviewReminderEmailsJob() once the request email has been
--   out for REVIEW_REMINDER_DELAY_DAYS AND the customer still hasn't left a
--   review on any item in the order.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS review_request_email_sent_at timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS review_reminder_email_sent_at timestamptz;
