// ---------------------------------------------------------------------
// Client-side helpers for the public, login-free review page
// (app/review/[token]/page.tsx). Talks only to
// app/api/review-link/[token]/route.ts and app/api/upload-review-photo
// (with a reviewToken field) -- never touches Supabase directly, and
// never imports from lib/reviews-api.ts, so the existing logged-in
// review flow (submitReview, uploadReviewPhoto, etc.) is completely
// untouched by this guest flow.
// ---------------------------------------------------------------------

export interface ReviewStepProgress {
  rated: boolean;
  reviewed: boolean;
  photoUploaded: boolean;
  allRequiredStepsDone: boolean;
  rewardIssued: boolean;
}

export interface ReviewLinkItem {
  productId: string | null;
  name: string;
  image: string | null;
  size: string | null;
  slug: string | null;
  /** Colour of the exact variant bought -- shown as "Reviewing: <colour>". */
  color: string | null;
  existingReview: {
    id: string;
    product_id: string;
    rating: number;
    title: string | null;
    comment: string | null;
    photos: string[];
    is_approved: boolean;
    variant_color?: string | null;
  } | null;
  progress: ReviewStepProgress;
}

export interface ReviewLinkRewardConfig {
  enabled: boolean;
  minStars: number;
  requireWrittenReview: boolean;
  requirePhoto: boolean;
  discountType: 'percentage' | 'flat';
  discountValue: number;
}

export interface ReviewLinkOrder {
  order: {
    id: string;
    shortId: string;
    customerName: string | null;
  };
  /** Which steps this store currently requires + the coupon shape --
   *  drives how many steps the stepper shows. */
  reward: ReviewLinkRewardConfig;
  items: ReviewLinkItem[];
}

export interface ReviewLinkReward {
  code: string;
  discountType: 'percentage' | 'flat';
  discountValue: number;
  expiresAt: string;
}

/** GET the order + items behind a review-link token. Throws with a
 *  user-facing message on an invalid/expired token or any other failure. */
export async function fetchReviewLinkOrder(token: string): Promise<ReviewLinkOrder> {
  const res = await fetch(`/api/review-link/${encodeURIComponent(token)}`);
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.error || 'This review link is invalid or has expired.');
  return json as ReviewLinkOrder;
}

/** Uploads one review photo through the guest token (no login required). */
export async function uploadGuestReviewPhoto(token: string, file: File): Promise<string> {
  const form = new FormData();
  form.append('file', file);
  form.append('reviewToken', token);
  const res = await fetch('/api/upload-review-photo', { method: 'POST', body: form });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.error || 'Could not upload photo.');
  if (!json?.url) throw new Error('Upload succeeded but no URL returned.');
  return json.url as string;
}

/** Submits one step (rate / write / photo) for one item. Safe to call more
 *  than once for the same item -- each call fills in the next step on the
 *  same review row; the caller decides which fields to send. */
export async function submitGuestReview(
  token: string,
  input: {
    productId: string;
    rating?: number;
    title?: string;
    comment?: string;
    photos?: string[];
    guestEmail?: string;
  }
): Promise<{ review: unknown; reward: ReviewLinkReward | null; progress: ReviewStepProgress }> {
  const res = await fetch(`/api/review-link/${encodeURIComponent(token)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.error || 'Could not submit your review.');
  return json;
}
