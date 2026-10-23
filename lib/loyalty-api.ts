import { supabase } from './supabase';
import { getSupabaseBrowser } from './supabase-browser';

// ---------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------

export interface LoyaltySettings {
  enabled: boolean;
  points_per_100_rupees: number;
  redeem_value_per_point: number; // ₹ value of 1 point when redeemed
  min_redeem_points: number; // minimum points a customer must redeem at once
}

export const DEFAULT_LOYALTY_SETTINGS: LoyaltySettings = {
  enabled: true,
  points_per_100_rupees: 5,
  redeem_value_per_point: 0.5,
  min_redeem_points: 100,
};

export interface LoyaltyLedgerEntry {
  id: string;
  user_id: string;
  order_id: string | null;
  points: number;
  type: 'earn' | 'redeem' | 'adjust' | 'expire';
  reason: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------
// Storefront (customer-facing) — reads use the auth-aware browser
// client so RLS-style "own data" queries carry the logged-in session.
// ---------------------------------------------------------------------

/** Public settings read — used at checkout to compute redeem value. */
export async function fetchLoyaltySettings(): Promise<LoyaltySettings> {
  const { data, error } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'loyalty_program')
    .maybeSingle();
  if (error || !data) return DEFAULT_LOYALTY_SETTINGS;
  return { ...DEFAULT_LOYALTY_SETTINGS, ...(data.value as Partial<LoyaltySettings>) };
}

/** Current logged-in customer's points balance. Returns 0 if not logged in. */
export async function fetchMyLoyaltyBalance(): Promise<number> {
  const client = getSupabaseBrowser();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return 0;

  const { data, error } = await client
    .from('profiles')
    .select('loyalty_balance')
    .eq('id', user.id)
    .maybeSingle();
  if (error || !data) return 0;
  return data.loyalty_balance ?? 0;
}

/** Current logged-in customer's points history, most recent first. */
export async function fetchMyLoyaltyLedger(): Promise<LoyaltyLedgerEntry[]> {
  const client = getSupabaseBrowser();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return [];

  const { data, error } = await client
    .from('loyalty_points_ledger')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as LoyaltyLedgerEntry[];
}

// ---------------------------------------------------------------------
// Admin management (Admin > Loyalty tab) — goes through /api/admin/loyalty
// so requests are checked against the admin session cookie server-side,
// same as the other admin panels (customers, returns, analytics).
// ---------------------------------------------------------------------

export interface AdminLoyaltyCustomer {
  userId: string;
  name: string;
  email: string | null;
  balance: number;
  totalEarned: number;
  totalRedeemed: number;
}

export interface AdminLoyaltyOverview {
  settings: LoyaltySettings;
  customers: AdminLoyaltyCustomer[];
}

export async function fetchAdminLoyaltyOverview(): Promise<AdminLoyaltyOverview> {
  const res = await fetch('/api/admin/loyalty');
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to load loyalty data');
  }
  return res.json();
}

export async function saveLoyaltySettings(settings: LoyaltySettings) {
  const res = await fetch('/api/admin/loyalty', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ settings }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to save loyalty settings');
  }
}

export async function adjustCustomerPoints(userId: string, points: number, reason: string) {
  const res = await fetch('/api/admin/loyalty', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, points, reason }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to adjust points');
  }
}
