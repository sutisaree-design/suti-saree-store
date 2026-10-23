import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAdminToken, ADMIN_SESSION_COOKIE } from '@/lib/admin-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import {
  fetchDripSettings,
  saveDripSettings,
  runWooCommerceDripJob,
  DEFAULT_WOOCOMMERCE_DRIP_SETTINGS,
  type WooCommerceDripSettings,
} from '@/lib/woocommerce-automation';

async function requireAdmin() {
  const cookie = cookies().get(ADMIN_SESSION_COOKIE)?.value ?? null;
  const verified = await verifyAdminToken(cookie);
  return verified.valid;
}

// GET /api/admin/woocommerce-import/automation
// Returns the current welcome/follow-up automation settings, plus a
// snapshot of today's progress against the daily cap and how many are
// still waiting in the queue -- so the admin panel can show
// "23/50 sent today, 1,842 still queued" without a separate call.
export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const settings = await fetchDripSettings(supabase);

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  // "Not opened" = welcome was sent at least followupDelayDays ago and still
  // has no opened_at -- these are exactly the people the follow-up step now
  // skips (see followupRequiresOpen in lib/woocommerce-automation.ts), so
  // the admin can see and manually re-target them instead of them just
  // silently never hearing from us again.
  const followupCutoffIso = new Date(
    Date.now() - Math.max(0, Number(settings.followupDelayDays) || 0) * 24 * 60 * 60 * 1000
  ).toISOString();

  const [
    { count: sentToday },
    { count: queuedWelcome },
    { count: queuedFollowup },
    { count: sentWelcomeTotal },
    { count: sentFollowupTotal },
    { count: notOpenedWelcome },
  ] = await Promise.all([
    supabase
      .from('woocommerce_campaign_sends')
      .select('id', { count: 'exact', head: true })
      .gte('sent_at', todayStart.toISOString())
      .in('status', ['sent', 'failed']),
    supabase.from('woocommerce_send_queue').select('id', { count: 'exact', head: true }).eq('campaign_type', 'welcome').eq('status', 'queued'),
    supabase.from('woocommerce_send_queue').select('id', { count: 'exact', head: true }).eq('campaign_type', 'followup').eq('status', 'queued'),
    supabase.from('woocommerce_campaign_sends').select('id', { count: 'exact', head: true }).eq('automation_step', 'welcome').eq('status', 'sent'),
    supabase.from('woocommerce_campaign_sends').select('id', { count: 'exact', head: true }).eq('automation_step', 'followup').eq('status', 'sent'),
    supabase
      .from('woocommerce_campaign_sends')
      .select('id', { count: 'exact', head: true })
      .eq('automation_step', 'welcome')
      .eq('status', 'sent')
      .lte('sent_at', followupCutoffIso)
      .is('opened_at', null),
  ]);

  return NextResponse.json({
    settings,
    progress: {
      sentToday: sentToday ?? 0,
      dailyCap: settings.dailySendCap,
      queuedWelcome: queuedWelcome ?? 0,
      queuedFollowup: queuedFollowup ?? 0,
      sentWelcomeTotal: sentWelcomeTotal ?? 0,
      sentFollowupTotal: sentFollowupTotal ?? 0,
      notOpenedWelcome: notOpenedWelcome ?? 0,
    },
  });
}

// POST /api/admin/woocommerce-import/automation
// Body: { settings: WooCommerceDripSettings, runNow?: boolean }
// Saves settings; if runNow is true, also immediately kicks off one drip
// tick (enqueue + send up to the daily cap) instead of waiting for the
// next scheduled cron run.
export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { settings?: Partial<WooCommerceDripSettings>; runNow?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (!body.settings) {
    return NextResponse.json({ error: 'settings is required' }, { status: 400 });
  }

  const merged: WooCommerceDripSettings = {
    ...DEFAULT_WOOCOMMERCE_DRIP_SETTINGS,
    ...body.settings,
    welcome: { ...DEFAULT_WOOCOMMERCE_DRIP_SETTINGS.welcome, ...(body.settings.welcome ?? {}) },
    followup: { ...DEFAULT_WOOCOMMERCE_DRIP_SETTINGS.followup, ...(body.settings.followup ?? {}) },
    dailySendCap: Math.max(1, Number(body.settings.dailySendCap) || DEFAULT_WOOCOMMERCE_DRIP_SETTINGS.dailySendCap),
    followupDelayDays: Math.max(0, Number(body.settings.followupDelayDays) ?? DEFAULT_WOOCOMMERCE_DRIP_SETTINGS.followupDelayDays),
    sendHourIST: Math.min(
      23,
      Math.max(0, Math.round(Number(body.settings.sendHourIST) ?? DEFAULT_WOOCOMMERCE_DRIP_SETTINGS.sendHourIST))
    ),
  };

  try {
    await saveDripSettings(merged);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to save' }, { status: 500 });
  }

  let runResult: any = null;
  if (body.runNow) {
    try {
      // force=true: "Run Now" means send immediately, ignore the preferred
      // send-hour window.
      runResult = await runWooCommerceDripJob(true);
    } catch (err) {
      runResult = { error: err instanceof Error ? err.message : 'Failed to run' };
    }
  }

  return NextResponse.json({ success: true, settings: merged, runResult });
}
