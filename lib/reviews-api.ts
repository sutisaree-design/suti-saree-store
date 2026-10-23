import { getSupabaseBrowser } from './supabase-browser';

export interface Review {
  id: string;
  product_id: string;
  user_id: string | null;
  customer_name: string;
  rating: number;
  title: string | null;
  comment: string | null;
  photos: string[];
  is_approved: boolean;
  /** True only when the reviewer had a matching delivered order at submit
   *  time -- checked server-side (see submitReview), never trust this from
   *  client input. Used to gate the "Verified Purchase" badge so it's never
   *  shown for reviews that aren't actually from a purchaser. */
  verified_purchase: boolean;
  created_at: string;
  /** Colour of the variant this review was left on, when known (guest
   *  reviews via /review/[token] always set it; older/logged-in reviews
   *  may be null). Used to filter the reviews list by the colour the
   *  shopper currently has selected on the product page. */
  variant_color?: string | null;
  variant_slug?: string | null;
}

export interface RatingSummary {
  average: number;
  /** Everyone who left a star rating (writing text is optional, so this is
   *  every approved review row). */
  totalRatings: number;
  /** Subset of totalRatings who also wrote something -- a title or a
   *  comment. Photos-only, no text, still counts as a rating only. */
  totalReviews: number;
  breakdown: Record<1 | 2 | 3 | 4 | 5, number>;
}

export const hasWrittenContent = (r: Review) =>
  Boolean(r.title?.trim()) || Boolean(r.comment?.trim());

export function summarizeReviews(reviews: Review[]): RatingSummary {
  const breakdown: RatingSummary['breakdown'] = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let totalReviews = 0;
  for (const r of reviews) {
    breakdown[r.rating as 1 | 2 | 3 | 4 | 5] = (breakdown[r.rating as 1 | 2 | 3 | 4 | 5] || 0) + 1;
    if (hasWrittenContent(r)) totalReviews += 1;
  }
  const totalRatings = reviews.length;
  const average =
    totalRatings === 0 ? 0 : reviews.reduce((sum, r) => sum + r.rating, 0) / totalRatings;
  return { average: Math.round(average * 10) / 10, totalRatings, totalReviews, breakdown };
}

/** Approved reviews for a product, newest first. Public — no auth required. */
export async function fetchApprovedReviews(productId: string): Promise<Review[]> {
  const supabase = getSupabaseBrowser();
  const { data, error } = await supabase
    .from('reviews')
    .select('*')
    .eq('product_id', productId)
    .eq('is_approved', true)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r: any) => ({ ...r, photos: r.photos ?? [] })) as Review[];
}

/**
 * Every distinct colour that has at least one review, in first-seen
 * order -- feeds the "Filter by colour" chip row on the product page.
 * Reviews with no recorded colour (variant_color null) are left out of
 * this list but still show up under "All colours".
 */
export function getReviewColorOptions(reviews: Review[]): string[] {
  const seen = new Set<string>();
  const colors: string[] = [];
  for (const r of reviews) {
    const c = r.variant_color?.trim();
    if (c && !seen.has(c)) {
      seen.add(c);
      colors.push(c);
    }
  }
  return colors;
}

/** Reviews for a given colour, or every review when `color` is null/empty
 *  (the "All colours" state). Case-insensitive so "Green" / "green" match. */
export function filterReviewsByColor(reviews: Review[], color: string | null | undefined): Review[] {
  if (!color) return reviews;
  const target = color.trim().toLowerCase();
  return reviews.filter((r) => r.variant_color?.trim().toLowerCase() === target);
}

/** Has the current logged-in user already reviewed this product? */
export async function fetchMyReviewForProduct(productId: string): Promise<Review | null> {
  const supabase = getSupabaseBrowser();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('reviews')
    .select('*')
    .eq('product_id', productId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) throw error;
  return data ? ({ ...data, photos: (data as any).photos ?? [] } as Review) : null;
}

export interface AdminReview extends Review {
  product_name: string;
  product_slug: string;
}

/**
 * Admin: every review regardless of approval status, newest first, with the
 * parent product's name/slug joined in for display.
 *
 * SECURITY: moved server-side (was a direct anon-key select using an
 * over-broad "read every review" RLS policy) — see
 * app/api/admin/reviews/route.ts.
 */
export async function fetchAllReviewsAdmin(): Promise<AdminReview[]> {
  const res = await fetch('/api/admin/reviews');
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Failed to load reviews');
  return (json.reviews ?? []) as AdminReview[];
}

/**
 * Self-service: approve the CURRENT user's own review. Used only by
 * scheduleAutoPublish below, always for a review the caller themselves just
 * wrote. Relies on the "customers_update_own_review" RLS policy
 * (auth.uid() = user_id) — NOT usable to approve someone else's review.
 */
export async function approveReview(id: string): Promise<void> {
  const supabase = getSupabaseBrowser();
  const { error } = await supabase.from('reviews').update({ is_approved: true }).eq('id', id);
  if (error) throw error;
}

const AUTO_PUBLISH_DELAY_MS = 5000;

/**
 * Auto-publish: 5 seconds after a customer submits a rating/review, it goes
 * live automatically without needing manual admin approval. Admins can still
 * hide it any time afterwards from the moderation panel (that's what the
 * Hide button is for). If the browser tab closes before the 5 seconds are
 * up, the review simply stays pending until an admin approves or hides it
 * manually -- nothing breaks either way.
 *
 * `onPublished` (optional) lets the caller update local UI state the moment
 * the auto-publish fires, without needing a page refresh.
 */
export function scheduleAutoPublish(id: string, onPublished?: () => void): void {
  setTimeout(() => {
    approveReview(id)
      .then(() => onPublished?.())
      .catch(() => {
        // Silent -- if this fails (e.g. the review was deleted or hidden by
        // an admin in the meantime), there's nothing useful to surface here.
      });
  }, AUTO_PUBLISH_DELAY_MS);
}

/**
 * Admin: approve someone else's review from the moderation panel.
 *
 * SECURITY: this is distinct from approveReview() above — approveReview()
 * only works on the caller's own review (RLS-enforced). Admin approval of
 * an arbitrary review needs the service role, so it goes through the admin
 * API route instead. See app/api/admin/reviews/route.ts.
 */
export async function approveReviewAdmin(id: string): Promise<void> {
  const res = await fetch('/api/admin/reviews', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, approved: true }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Failed to approve review');
}

/** Admin: reject/unpublish someone else's review — hides it storefront-side. */
export async function rejectReviewAdmin(id: string): Promise<void> {
  const res = await fetch('/api/admin/reviews', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, approved: false }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Failed to reject review');
}

/**
 * Admin: permanently delete a review.
 *
 * SECURITY: moved server-side (was a direct anon-key delete using an
 * over-broad "delete any review" RLS policy) — see
 * app/api/admin/reviews/route.ts.
 */
export async function deleteReviewAdmin(id: string): Promise<void> {
  const res = await fetch(`/api/admin/reviews?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Failed to delete review');
}

/** Only customers who purchased the product (delivered order) may review it. */
export async function hasPurchasedProduct(productId: string): Promise<boolean> {
  const supabase = getSupabaseBrowser();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { data, error } = await supabase
    .from('order_items')
    .select('id, orders!inner(user_id, status)')
    .eq('product_id', productId)
    .eq('orders.user_id', user.id);
  if (error) return false;
  return (data ?? []).length > 0;
}

/**
 * Upload one review photo via the server-side dual-write route.
 * Returns a canonical aruhihandlooms.com/media/... URL.
 * Previously uploaded directly to Supabase from the browser — routing
 * through /api/upload-review-photo gives dual-write (Supabase + R2 mirror)
 * and ensures the stored URL is always the canonical /media/ form.
 */
export async function uploadReviewPhoto(file: File): Promise<string> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch('/api/upload-review-photo', { method: 'POST', body: form });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.error || 'Could not upload review photo.');
  if (!json?.url) throw new Error('Upload succeeded but no URL returned.');
  return json.url as string;
}

export async function submitReview(input: {
  productId: string;
  rating: number;
  title?: string;
  comment?: string;
  photos?: string[];
  /** Colour of the variant the reviewer is on, if known (e.g. the
   *  colour-variant page they reviewed from). Optional -- omit when the
   *  base product has no colour variants. */
  color?: string;
  variantSlug?: string;
}): Promise<Review> {
  const supabase = getSupabaseBrowser();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Please login to write a review');

  const customerName =
    (user.user_metadata?.full_name as string | undefined) ||
    user.email?.split('@')[0] ||
    'Customer';

  // Re-check purchase status here (not just trust the "eligible" UI state
  // from the page) so verified_purchase always reflects a real order at the
  // moment of submission -- this is what the "Verified Purchase" badge in
  // reviews-section.tsx is gated on.
  const verifiedPurchase = await hasPurchasedProduct(input.productId);

  const { data, error } = await supabase
    .from('reviews')
    .insert({
      product_id: input.productId,
      user_id: user.id,
      customer_name: customerName,
      rating: input.rating,
      title: input.title || null,
      comment: input.comment || null,
      photos: input.photos ?? [],
      variant_color: input.color || null,
      variant_slug: input.variantSlug || null,
      is_approved: false,
      verified_purchase: verifiedPurchase,
    })
    .select('*')
    .single();

  if (error) {
    if (error.code === '23505') {
      throw new Error('You have already reviewed this product');
    }
    throw error;
  }
  return data as Review;
}

/**
 * Adds/updates the title, comment, and photos on the current user's own
 * review (used by the "rate first, write a review later" flow -- the
 * rating itself is already saved via submitReview). Re-submits it for
 * moderation since new written content hasn't been checked yet, even if
 * the rating-only version was already approved.
 */
export async function updateMyReview(
  id: string,
  input: { title?: string; comment?: string; photos?: string[] }
): Promise<Review> {
  const supabase = getSupabaseBrowser();
  const { data, error } = await supabase
    .from('reviews')
    .update({
      title: input.title?.trim() || null,
      comment: input.comment?.trim() || null,
      photos: input.photos ?? [],
      is_approved: false,
    })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return { ...data, photos: (data as any).photos ?? [] } as Review;
}
