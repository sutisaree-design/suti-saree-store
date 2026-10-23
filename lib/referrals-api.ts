import { getSupabaseBrowser } from './supabase-browser';

// ---------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------

export interface ReferralSettings {
  enabled: boolean;
  referrer_reward_points: number; // credited to the person who referred
  referred_reward_points: number; // credited to the new customer
}

export const DEFAULT_REFERRAL_SETTINGS: ReferralSettings = {
  enabled: true,
  referrer_reward_points: 100,
  referred_reward_points: 50,
};

export interface MyReferral {
  id: string;
  referred_user_id: string;
  code: string;
  status: 'pending' | 'completed';
  referrer_reward_points: number;
  referred_reward_points: number;
  created_at: string;
  completed_at: string | null;
}

// ---------------------------------------------------------------------
// Storefront (customer-facing) — goes through /api/referrals so the
// code lookup/creation is checked against the logged-in Supabase auth
// session server-side (same pattern used for order-confirm etc).
// ---------------------------------------------------------------------

export interface MyReferralOverview {
  code: string;
  settings: ReferralSettings;
  referrals: MyReferral[];
}

/** Fetches (and lazily creates) the current customer's referral code,
 *  plus their referral history. Requires the customer to be logged in. */
export async function fetchMyReferralOverview(): Promise<MyReferralOverview> {
  const res = await fetch('/api/referrals');
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to load referral data');
  }
  return res.json();
}

/** Public settings read — used on the signup page to show the referral
 *  perk without requiring a login. */
export async function fetchReferralSettings(): Promise<ReferralSettings> {
  const client = getSupabaseBrowser();
  const { data, error } = await client
    .from('settings')
    .select('value')
    .eq('key', 'referral_program')
    .maybeSingle();
  if (error || !data) return DEFAULT_REFERRAL_SETTINGS;
  return { ...DEFAULT_REFERRAL_SETTINGS, ...(data.value as Partial<ReferralSettings>) };
}

// ---------------------------------------------------------------------
// Admin management (Admin > Referrals tab) — goes through
// /api/admin/referrals so requests are checked against the admin
// session cookie server-side, same as the loyalty admin panel.
// ---------------------------------------------------------------------

export interface AdminReferralRow {
  id: string;
  referrerName: string;
  referrerEmail: string | null;
  referredName: string;
  referredEmail: string | null;
  code: string;
  status: 'pending' | 'completed';
  referrerRewardPoints: number;
  referredRewardPoints: number;
  createdAt: string;
  completedAt: string | null;
}

export interface AdminReferralsOverview {
  settings: ReferralSettings;
  referrals: AdminReferralRow[];
  totalReferrers: number;
  totalCompleted: number;
  totalPending: number;
}

export async function fetchAdminReferralsOverview(): Promise<AdminReferralsOverview> {
  const res = await fetch('/api/admin/referrals');
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to load referral data');
  }
  return res.json();
}

export async function saveReferralSettings(settings: ReferralSettings) {
  const res = await fetch('/api/admin/referrals', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ settings }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to save referral settings');
  }
}
