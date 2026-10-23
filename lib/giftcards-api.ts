import { supabase } from './supabase';
import { getSupabaseBrowser } from './supabase-browser';

// ---------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------

export interface GiftCardSettings {
  enabled: boolean;
  denominations: number[]; // rupee amounts shown as buy buttons on /gift-cards
  expiry_months: number; // validity from date of purchase
}

export const DEFAULT_GIFT_CARD_SETTINGS: GiftCardSettings = {
  enabled: true,
  denominations: [500, 1000, 2000, 5000],
  expiry_months: 12,
};

export interface GiftCard {
  id: string;
  code: string;
  initial_value: number;
  balance: number;
  status: 'pending' | 'active' | 'redeemed' | 'expired' | 'deactivated';
  purchased_by_user_id: string | null;
  purchaser_name: string | null;
  purchaser_email: string | null;
  recipient_name: string | null;
  recipient_email: string | null;
  message: string | null;
  expires_at: string | null;
  created_at: string;
}

export interface GiftCardResult {
  ok: boolean;
  error?: string;
  giftCard?: GiftCard;
  redeemable?: number; // rupee amount that can actually be applied right now
}

// ---------------------------------------------------------------------
// Storefront — purchasing a new gift card (Razorpay flow)
// ---------------------------------------------------------------------

/** Public settings read — used on /gift-cards to render denomination buttons. */
export async function fetchGiftCardSettings(): Promise<GiftCardSettings> {
  const { data, error } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'gift_card_program')
    .maybeSingle();
  if (error || !data) return DEFAULT_GIFT_CARD_SETTINGS;
  return { ...DEFAULT_GIFT_CARD_SETTINGS, ...(data.value as Partial<GiftCardSettings>) };
}

export interface CreateGiftCardInput {
  amount: number;
  purchaserName: string;
  purchaserEmail: string;
  recipientName?: string;
  recipientEmail?: string;
  message?: string;
}

/** Step 1 of purchase — creates a 'pending' gift_cards row (0 balance,
 *  no code redeemable yet) so we have an id to hand Razorpay as the
 *  receipt/internalOrderId. Nothing is spendable until /confirm runs. */
export async function createPendingGiftCard(
  input: CreateGiftCardInput
): Promise<{ giftCardId: string }> {
  const res = await fetch('/api/giftcards', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'Failed to start gift card purchase');
  return body;
}

/** Step 2 of purchase — called after Razorpay's checkout handler fires
 *  with payment ids. Re-verifies the signature server-side (never
 *  trusts the client-side "verified" flag alone) and issues the card. */
export async function confirmGiftCardPurchase(input: {
  giftCardId: string;
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}): Promise<{ code: string; balance: number }> {
  const res = await fetch('/api/giftcards/confirm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'Failed to confirm gift card purchase');
  return body;
}

/** Gift cards the logged-in customer purchased or received, most recent first. */
export async function fetchMyGiftCards(): Promise<GiftCard[]> {
  const client = getSupabaseBrowser();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return [];

  const { data, error } = await client
    .from('gift_cards')
    .select('*')
    .or(`purchased_by_user_id.eq.${user.id},recipient_email.eq.${user.email}`)
    .neq('status', 'pending')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as GiftCard[];
}

// ---------------------------------------------------------------------
// Storefront — redeeming an existing card at checkout
// ---------------------------------------------------------------------

/**
 * Looks up a gift card code and checks it's usable right now. Returns
 * the rupee amount that can be applied, clamped to both the card's
 * balance and whatever's left to pay (so it can never take a total
 * below zero) — same contract as coupons-api's validateCoupon.
 */
export async function validateGiftCard(code: string, amountDue: number): Promise<GiftCardResult> {
  const trimmed = code.trim().toUpperCase();
  if (!trimmed) return { ok: false, error: 'Enter a gift card code' };

  try {
    const res = await fetch('/api/giftcards/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: trimmed, amountDue }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: body.error || 'Could not validate gift card right now' };
    return body as GiftCardResult;
  } catch {
    return { ok: false, error: 'Could not validate gift card right now' };
  }
}

// ---------------------------------------------------------------------
// Admin management (Admin > Gift Cards tab) — goes through
// /api/admin/giftcards so requests are checked against the admin
// session cookie server-side, same as the loyalty/referrals panels.
// ---------------------------------------------------------------------

export interface AdminGiftCardsOverview {
  settings: GiftCardSettings;
  cards: GiftCard[];
  totals: { totalIssued: number; totalActiveBalance: number; totalRedeemed: number };
}

export async function fetchAdminGiftCardsOverview(): Promise<AdminGiftCardsOverview> {
  const res = await fetch('/api/admin/giftcards');
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to load gift card data');
  }
  return res.json();
}

export async function saveGiftCardSettings(settings: GiftCardSettings) {
  const res = await fetch('/api/admin/giftcards', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ settings }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to save gift card settings');
  }
}

/** Manually issue a free/comp gift card — no payment involved. */
export async function issueGiftCard(input: {
  amount: number;
  recipientName?: string;
  recipientEmail?: string;
  reason?: string;
}) {
  const res = await fetch('/api/admin/giftcards', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'Failed to issue gift card');
  return body;
}

export async function deactivateGiftCard(id: string) {
  const res = await fetch('/api/admin/giftcards', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to deactivate gift card');
  }
}
