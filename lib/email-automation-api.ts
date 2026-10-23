import { supabase } from './supabase';

// ---------------------------------------------------------------------
// Phase 13 — Email lifecycle automation: welcome series + win-back
// Settings live in `settings` (key = 'email_automation_settings').
// Sends are tracked in `email_automation_log` so the daily cron never
// emails the same person twice for the same automation.
// ---------------------------------------------------------------------

export interface EmailAutomationSettings {
  welcome_enabled: boolean;
  welcome_delay_hours: number; // how long after signup to send
  welcome_coupon_code: string;
  winback_enabled: boolean;
  winback_days_inactive: number; // days since last order to qualify
  winback_coupon_code: string;
}

export const DEFAULT_EMAIL_AUTOMATION_SETTINGS: EmailAutomationSettings = {
  welcome_enabled: false,
  welcome_delay_hours: 1,
  welcome_coupon_code: 'WELCOME10',
  winback_enabled: false,
  winback_days_inactive: 45,
  winback_coupon_code: 'COMEBACK15',
};

export async function fetchEmailAutomationSettings(): Promise<EmailAutomationSettings> {
  const { data, error } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'email_automation_settings')
    .maybeSingle();
  if (error || !data) return DEFAULT_EMAIL_AUTOMATION_SETTINGS;
  return { ...DEFAULT_EMAIL_AUTOMATION_SETTINGS, ...(data.value as Partial<EmailAutomationSettings>) };
}

export async function saveEmailAutomationSettings(settings: EmailAutomationSettings) {
  const { error } = await supabase
    .from('settings')
    .upsert({ key: 'email_automation_settings', value: settings }, { onConflict: 'key' });
  if (error) throw error;
}

export interface EmailAutomationLogEntry {
  id: string;
  email: string;
  automation_type: 'welcome' | 'winback';
  sent_at: string;
}

export async function fetchEmailAutomationLog(): Promise<EmailAutomationLogEntry[]> {
  const { data, error } = await supabase
    .from('email_automation_log')
    .select('*')
    .order('sent_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []) as EmailAutomationLogEntry[];
}
