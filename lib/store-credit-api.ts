import { getSupabaseBrowser } from './supabase-browser';

// ---------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------

export interface StoreCredit {
  balance: number;
  updated_at: string | null;
}

export interface StoreCreditLedgerEntry {
  id: string;
  amount: number;
  type: 'issue' | 'refund' | 'redeem' | 'adjust' | 'expire';
  order_id: string | null;
  reason: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------
// Storefront (customer-facing) — reads use the auth-aware browser
// client so the RLS "own row only" policy carries the logged-in
// session, same pattern as loyalty-api's fetchMyLoyalty().
// ---------------------------------------------------------------------

/**
 * Current store credit balance for the logged-in shopper. Returns 0 for
 * guests (no session) and for logged-in users who've never had credit
 * issued (no store_credits row yet — nothing to redeem, not an error).
 * Used by the header's balance pill and the account page.
 */
export async function fetchMyStoreCredit(): Promise<StoreCredit> {
  const client = getSupabaseBrowser();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return { balance: 0, updated_at: null };

  const { data, error } = await client
    .from('store_credits')
    .select('balance, updated_at')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error || !data) return { balance: 0, updated_at: null };
  return { balance: Number(data.balance) || 0, updated_at: data.updated_at };
}

/** Full credit/debit history for the logged-in shopper, most recent first. */
export async function fetchMyStoreCreditHistory(): Promise<StoreCreditLedgerEntry[]> {
  const client = getSupabaseBrowser();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return [];

  const { data, error } = await client
    .from('store_credit_ledger')
    .select('id, amount, type, order_id, reason, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as StoreCreditLedgerEntry[];
}

// ---------------------------------------------------------------------
// Storefront — redeeming credit at checkout
// ---------------------------------------------------------------------

export interface RedeemStoreCreditResult {
  ok: boolean;
  error?: string;
  applied?: number; // rupee amount actually applied
  remainingBalance?: number;
}

/**
 * Asks the server to apply up to `amountDue` of the shopper's balance
 * to the current order total. Clamped server-side to both the wallet
 * balance and amountDue, same contract as coupons/gift cards, so it can
 * never take the payable total below zero.
 */
export async function redeemStoreCredit(amountDue: number): Promise<RedeemStoreCreditResult> {
  try {
    const res = await fetch('/api/store-credit/redeem', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amountDue }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: body.error || 'Could not apply store credit right now' };
    return body as RedeemStoreCreditResult;
  } catch {
    return { ok: false, error: 'Could not apply store credit right now' };
  }
}

// ---------------------------------------------------------------------
// Admin management (Admin > Store Credit tab) — goes through
// /api/admin/store-credit so requests are checked against the admin
// session cookie server-side, same as the gift cards / loyalty panels.
// ---------------------------------------------------------------------

export interface AdminStoreCreditOverview {
  totalOutstanding: number;
  customers: Array<{ user_id: string; email: string | null; balance: number; updated_at: string }>;
}

export async function fetchAdminStoreCreditOverview(): Promise<AdminStoreCreditOverview> {
  const res = await fetch('/api/admin/store-credit');
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to load store credit data');
  }
  return res.json();
}

/** Issue/adjust a customer's balance — positive amount credits, negative debits. */
export async function adjustStoreCredit(input: {
  email: string;
  amount: number;
  reason?: string;
}) {
  const res = await fetch('/api/admin/store-credit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'Failed to update store credit');
  return body;
}
