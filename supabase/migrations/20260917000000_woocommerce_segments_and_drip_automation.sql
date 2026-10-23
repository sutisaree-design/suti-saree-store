-- WooCommerce campaign click tracking + cold/warm/hot audience segmentation
-- + welcome -> follow-up drip automation.
--
-- Segmentation is computed on read (app/api/admin/woocommerce-import/segments),
-- not stored, using:
--   HOT  = clicked the email AND (purchased afterwards OR viewed 2+ pages)
--   WARM = clicked the email (visited the site) but not HOT
--   COLD = never opened, or opened but never clicked
--
-- Click tracking: every real link in a sent campaign is rewritten to
-- /api/track/click/<send id>?u=<original url> (see
-- lib/campaign-templates.ts -> wrapCampaignLinksForClickTracking). That
-- route stamps clicked_at/click_count below and drops a `wc_sid` cookie;
-- lib/track-api.ts then tags every later activity_events row (page_view,
-- purchase, ...) from that visitor with the same send id.

ALTER TABLE woocommerce_campaign_sends
  ADD COLUMN IF NOT EXISTS clicked_at timestamptz,
  ADD COLUMN IF NOT EXISTS click_count integer NOT NULL DEFAULT 0,
  -- 'welcome' | 'followup' | NULL (a manual/one-off campaign send)
  ADD COLUMN IF NOT EXISTS automation_step text;

CREATE INDEX IF NOT EXISTS idx_woocommerce_campaign_sends_customer_step
  ON woocommerce_campaign_sends (customer_id, automation_step, status);

ALTER TABLE activity_events
  ADD COLUMN IF NOT EXISTS campaign_send_id uuid
    REFERENCES woocommerce_campaign_sends(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_activity_events_campaign_send_id
  ON activity_events (campaign_send_id) WHERE campaign_send_id IS NOT NULL;

-- Every campaign send that isn't sent immediately -- a manual "send later"
-- schedule, or a step of the automated welcome/follow-up drip -- is
-- written here first with a `scheduled_at`. The daily cron
-- (lib/woocommerce-automation.ts -> runWooCommerceDripJob, wired into
-- lib/cron-jobs.ts) picks up due rows oldest-first ("top of the imported
-- list first") and stops once it hits the admin's daily send cap
-- (Admin -> WooCommerce Import -> Automation, default 50/day), so the
-- whole imported list never gets emailed in one shot.
CREATE TABLE IF NOT EXISTS woocommerce_send_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES woocommerce_customers(id) ON DELETE CASCADE,
  campaign_type text NOT NULL DEFAULT 'manual', -- 'manual' | 'welcome' | 'followup'
  subject text NOT NULL,
  html text, -- NULL for welcome/followup: built fresh (current products/stock) at send time
  scheduled_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'queued', -- 'queued' | 'sent' | 'failed' | 'skipped' | 'canceled'
  send_id uuid REFERENCES woocommerce_campaign_sends(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_woocommerce_send_queue_due
  ON woocommerce_send_queue (status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_woocommerce_send_queue_customer_type
  ON woocommerce_send_queue (customer_id, campaign_type, status);

ALTER TABLE woocommerce_send_queue ENABLE ROW LEVEL SECURITY;
-- No policies on purpose (service-role only), same pattern as
-- woocommerce_customers / woocommerce_campaign_sends -- this queue holds
-- personal data (email) and must only ever be touched by the
-- admin-authenticated API routes / cron, never directly from the browser.

-- Automation on/off + cap + delay + templates are stored in the existing
-- generic `settings` key-value table under key
-- 'woocommerce_drip_automation_settings' (same pattern already used for
-- 'email_automation_settings' -- see lib/email-automation-api.ts), so no
-- dedicated table/columns are needed for that part.
