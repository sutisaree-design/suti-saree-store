// ---------------------------------------------------------------------
// Auto-issues a one-time discount coupon when a guest (or logged-in)
// customer leaves a >=minStars rating through app/review/[token]. Uses
// review_rewards.UNIQUE(order_id, product_id) as the actual duplicate
// guard -- see migration 20261002000000_guest_review_reward_flow.sql --
// so this stays correct even if the same product is submitted twice in
// a race (double-tap, retried request, etc).
//
// Server-only: imports getSupabaseAdmin, never call from a Client
// Component.
// ---------------------------------------------------------------------

import { randomBytes } from 'crypto';
import { getSupabaseAdmin } from './supabase-admin';
import { getReviewRewardSettings, type ReviewRewardSettings } from './review-reward-settings';

export interface IssuedReward {
  /** review_rewards.id -- callers use this to write back email_sent_at /
   *  email_error once they've attempted the confirmation email (see
   *  app/api/review-link/[token]/route.ts). Nothing here writes those
   *  columns itself; issuing the coupon and emailing it are deliberately
   *  kept as two separate steps so an email failure can never roll back
   *  or retry-duplicate an already-issued coupon. */
  id: string;
  code: string;
  discountType: 'percentage' | 'flat';
  discountValue: number;
  expiresAt: string;
}

/**
 * Per-step completion for ONE (order, product) review, independent of
 * whether a reward has actually been issued for it. Purely derived from
 * data that's already on the reviews row (rating/comment/photos) -- no
 * extra "progress" table needed. Used both to gate issueReviewReward
 * below and to tell the storefront which of the 3 steps still need
 * doing (see app/api/review-link/[token]/route.ts).
 */
export interface ReviewStepProgress {
  rated: boolean;
  reviewed: boolean;
  photoUploaded: boolean;
  /** All steps this store's settings actually require are done. */
  allRequiredStepsDone: boolean;
}

export function getReviewStepProgress(
  input: { rating?: number | null; comment?: string | null; photos?: string[] | null },
  settings: Pick<ReviewRewardSettings, 'minStars' | 'requireWrittenReview' | 'requirePhoto'>
): ReviewStepProgress {
  const rated = Number(input.rating) >= settings.minStars;
  const reviewed = Boolean(input.comment && input.comment.trim().length > 0);
  const photoUploaded = Array.isArray(input.photos) && input.photos.length > 0;

  const allRequiredStepsDone =
    rated &&
    (!settings.requireWrittenReview || reviewed) &&
    (!settings.requirePhoto || photoUploaded);

  return { rated, reviewed, photoUploaded, allRequiredStepsDone };
}

function generateCouponCode(): string {
  // e.g. THANKS-7F3K9A -- short enough to read out / type by hand,
  // long enough (6 base32-ish chars from hex) that collisions are rare;
  // a collision still fails safely (unique constraint) and is retried.
  const suffix = randomBytes(4).toString('hex').toUpperCase().slice(0, 6);
  return `THANKS-${suffix}`;
}

/**
 * Attempts to issue a reward for one (orderId, productId) pair.
 *
 * Step-gated: this is called again on EVERY step of the 3-step flow
 * (rate -> write -> upload photo), not just once. It only actually
 * issues a coupon the first time ALL of this store's required steps
 * (settings.requireWrittenReview / requirePhoto, on top of the
 * always-required star rating) are satisfied -- earlier partial calls
 * fall through and return null so a customer never gets a coupon per
 * step, only ever ONE coupon for the whole review. The UNIQUE
 * (order_id, product_id) constraint on review_rewards is still what
 * makes that safe under retries/races; the step check here is what
 * makes it correct on the *first* successful call specifically.
 *
 * Returns null if rewards are disabled, the required steps aren't all
 * complete yet, or a reward for this order+product already exists (no
 * error in that last case -- expected outcome of a repeat submission).
 */
export async function issueReviewReward(params: {
  orderId: string;
  productId: string;
  reviewId?: string | null;
  rating: number;
  comment?: string | null;
  photos?: string[] | null;
}): Promise<IssuedReward | null> {
  const { orderId, productId, reviewId, rating, comment, photos } = params;
  const supabase = getSupabaseAdmin();

  const settings = await getReviewRewardSettings(supabase);
  if (!settings.enabled) return null;

  const progress = getReviewStepProgress({ rating, comment, photos }, settings);
  if (!progress.allRequiredStepsDone) return null;

  // Someone already earned a reward for this exact order+product?
  // Cheap pre-check to avoid burning a coupon-code attempt in the
  // common case; the UNIQUE constraint below is what actually prevents
  // a double-issue under a race, this is just an optimization.
  const { data: existingReward } = await supabase
    .from('review_rewards')
    .select('id, coupon_id')
    .eq('order_id', orderId)
    .eq('product_id', productId)
    .maybeSingle();
  if (existingReward) return null;

  const expiresAt = new Date(Date.now() + settings.expiryDays * 24 * 60 * 60 * 1000).toISOString();

  // Try a few times in case of a coupon-code collision (extremely
  // unlikely at 6 hex-derived chars, but cheap to guard against).
  const MAX_ATTEMPTS = 5;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const code = generateCouponCode();

    const { data: coupon, error: couponError } = await supabase
      .from('coupons')
      .insert({
        code,
        discount_type: settings.discountType,
        discount_value: settings.discountValue,
        min_order_value: settings.minOrderValue,
        usage_limit: 1,
        expires_at: expiresAt,
        is_active: true,
      })
      .select('id, code, discount_type, discount_value, expires_at')
      .single();

    if (couponError) {
      // Unique violation on coupons.code -- try a new code.
      if ((couponError as { code?: string }).code === '23505') continue;
      throw couponError;
    }

    // Now claim the (order_id, product_id) slot. If someone else won
    // the race between our pre-check and here, this insert fails on
    // the UNIQUE(order_id, product_id) constraint -- in that case we
    // roll back the coupon we just created (it would otherwise be
    // orphaned and unredeemable-but-live) and report "no reward"
    // rather than a duplicate.
    const { data: rewardRow, error: rewardError } = await supabase
      .from('review_rewards')
      .insert({
        order_id: orderId,
        product_id: productId,
        review_id: reviewId ?? null,
        coupon_id: coupon.id,
        rating,
      })
      .select('id')
      .single();

    if (rewardError) {
      await supabase.from('coupons').delete().eq('id', coupon.id);
      if ((rewardError as { code?: string }).code === '23505') return null;
      throw rewardError;
    }

    return {
      id: rewardRow.id,
      code: coupon.code,
      discountType: coupon.discount_type,
      discountValue: coupon.discount_value,
      expiresAt: coupon.expires_at,
    };
  }

  throw new Error('Could not generate a unique coupon code after several attempts');
}

export type { ReviewRewardSettings };
