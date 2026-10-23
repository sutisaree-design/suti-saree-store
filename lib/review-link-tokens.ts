// ---------------------------------------------------------------------
// Secret, login-free tokens that let a customer open
// app/review/[token] and rate/review every item in one order without
// signing in. Backed by review_link_tokens (service-role only -- see
// migration 20261002000000_guest_review_reward_flow.sql).
//
// Used by:
//   - lib/email-templates.ts (reviewRequestEmail / reviewReminderEmail)
//     via getOrCreateReviewToken(), so the CTA link always points at a
//     valid token instead of the login-gated /account/orders/[id].
//   - app/api/review-link/[token]/route.ts via verifyReviewToken(), to
//     resolve a token back to an order before doing anything with it.
// ---------------------------------------------------------------------

import { randomBytes } from 'crypto';
import { getSupabaseAdmin } from './supabase-admin';

const TOKEN_TTL_DAYS = 180;

function generateToken(): string {
  // 32 random bytes -> 43-char base64url string. Far more entropy than
  // a v4 UUID and still URL-safe with no padding characters to escape.
  return randomBytes(32).toString('base64url');
}

/**
 * Returns an existing, still-valid token for this order if one exists,
 * otherwise creates a new one. Idempotent by design: re-sending the
 * "Rate & Review" email (e.g. the reminder, or an admin "Send test")
 * should reuse the same link rather than minting a new one and quietly
 * orphaning the old one.
 */
export async function getOrCreateReviewToken(orderId: string): Promise<string> {
  const supabase = getSupabaseAdmin();

  const { data: existing, error: fetchError } = await supabase
    .from('review_link_tokens')
    .select('token, expires_at')
    .eq('order_id', orderId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (fetchError) throw fetchError;

  if (existing && new Date(existing.expires_at).getTime() > Date.now()) {
    return existing.token;
  }

  const token = generateToken();
  const expiresAt = new Date(Date.now() + TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { error: insertError } = await supabase
    .from('review_link_tokens')
    .insert({ order_id: orderId, token, expires_at: expiresAt });
  if (insertError) throw insertError;

  return token;
}

export interface VerifiedReviewToken {
  orderId: string;
}

/** Returns the order id if the token exists and hasn't expired, else null. */
export async function verifyReviewToken(token: string): Promise<VerifiedReviewToken | null> {
  if (!token) return null;
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('review_link_tokens')
    .select('order_id, expires_at')
    .eq('token', token)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  if (new Date(data.expires_at).getTime() < Date.now()) return null;
  return { orderId: data.order_id };
}

/** Builds the public review-link URL for an order, creating a token if needed. */
export async function buildReviewLinkUrl(orderId: string): Promise<string> {
  const token = await getOrCreateReviewToken(orderId);
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || '';
  return `${siteUrl}/review/${token}`;
}
