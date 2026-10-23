import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { verifyReviewToken } from '@/lib/review-link-tokens';
import { issueReviewReward, getReviewStepProgress } from '@/lib/review-rewards-server';
import { getReviewRewardSettings } from '@/lib/review-reward-settings';
import { sendEmail } from '@/lib/email';
import { reviewRewardIssuedEmail } from '@/lib/email-templates';

// ---------------------------------------------------------------------
// Public, login-free review flow behind a secret per-order token (see
// lib/review-link-tokens.ts). Backs app/review/[token]/page.tsx.
//
//   GET  -> order summary (items + which ones are already reviewed)
//   POST -> submit a rating/review/photos for one item in the order,
//           auto-issuing a discount coupon when the rating qualifies
//           (see lib/review-rewards-server.ts)
//
// Nothing here trusts the caller's identity beyond "knows the token" --
// the same trust level as a password-reset link. All writes go through
// getSupabaseAdmin() (service role), which is what makes the
// login-gated `auth_insert_reviews` RLS policy irrelevant here: this
// route IS the authorization check.
// ---------------------------------------------------------------------

interface OrderItem {
  product_id?: string;
  product_name?: string;
  name?: string;
  image_url?: string;
  image?: string;
  images?: string[];
  size?: string;
  slug?: string;
  quantity?: number;
  price?: number;
  /** Colour of the exact variant bought -- set at checkout, see
   *  app/checkout/page.tsx's orderItems.map. Carried onto the review
   *  row so the product page can show/filter "Reviewed: <colour>". */
  color?: string | null;
}

async function loadOrder(orderId: string) {
  const supabase = getSupabaseAdmin();
  const { data: order, error } = await supabase
    .from('orders')
    .select('id, items, status, customer_name, customer_email, created_at')
    .eq('id', orderId)
    .maybeSingle();
  if (error) throw error;
  return order;
}

export async function GET(_req: Request, { params }: { params: { token: string } }) {
  try {
    const verified = await verifyReviewToken(params.token);
    if (!verified) {
      return NextResponse.json({ error: 'This review link is invalid or has expired.' }, { status: 404 });
    }

    const order = await loadOrder(verified.orderId);
    if (!order) {
      return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
    }

    const items: OrderItem[] = Array.isArray(order.items) ? order.items : [];
    const productIds = Array.from(new Set(items.map((it) => it.product_id).filter(Boolean))) as string[];

    const supabase = getSupabaseAdmin();
    const { data: existingReviews, error: reviewsError } = await supabase
      .from('reviews')
      .select('id, product_id, rating, title, comment, photos, is_approved, variant_color')
      .eq('order_id', order.id)
      .in('product_id', productIds.length ? productIds : ['00000000-0000-0000-0000-000000000000']);
    if (reviewsError) throw reviewsError;

    const reviewedByProduct = new Map((existingReviews ?? []).map((r) => [r.product_id, r]));

    // Which of this order's products already have an issued reward --
    // checked directly against review_rewards rather than re-derived
    // from progress, since a reward may have been (or not been) issued
    // under settings that have since changed.
    const { data: existingRewards } = await supabase
      .from('review_rewards')
      .select('product_id')
      .eq('order_id', order.id);
    const rewardedProductIds = new Set((existingRewards ?? []).map((r) => r.product_id));

    // Drives the frontend's 3-step progress UI: which steps this store
    // actually requires before a reward fires (a store that turned
    // requirePhoto off, say, should only show 2 steps, not 3).
    const settings = await getReviewRewardSettings(supabase);

    return NextResponse.json({
      order: {
        id: order.id,
        shortId: order.id.slice(0, 8).toUpperCase(),
        customerName: order.customer_name,
      },
      reward: {
        enabled: settings.enabled,
        minStars: settings.minStars,
        requireWrittenReview: settings.requireWrittenReview,
        requirePhoto: settings.requirePhoto,
        discountType: settings.discountType,
        discountValue: settings.discountValue,
      },
      items: items.map((it) => {
        const existing = it.product_id ? reviewedByProduct.get(it.product_id) ?? null : null;
        const progress = getReviewStepProgress(
          { rating: existing?.rating, comment: existing?.comment, photos: existing?.photos },
          settings
        );
        return {
          productId: it.product_id ?? null,
          name: it.product_name || it.name || 'Item',
          image: it.image_url || it.image || it.images?.[0] || null,
          size: it.size || null,
          slug: it.slug || null,
          color: it.color || null,
          existingReview: existing,
          progress: {
            ...progress,
            rewardIssued: it.product_id ? rewardedProductIds.has(it.product_id) : false,
          },
        };
      }),
    });
  } catch (err) {
    console.error('[review-link GET] error:', err);
    return NextResponse.json({ error: 'Could not load this order right now.' }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: { params: { token: string } }) {
  try {
    const verified = await verifyReviewToken(params.token);
    if (!verified) {
      return NextResponse.json({ error: 'This review link is invalid or has expired.' }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));
    const { productId, rating, title, comment, photos, guestEmail } = body || {};

    if (!productId) {
      return NextResponse.json({ error: 'A product is required.' }, { status: 400 });
    }

    const order = await loadOrder(verified.orderId);
    if (!order) {
      return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
    }

    const items: OrderItem[] = Array.isArray(order.items) ? order.items : [];
    const item = items.find((it) => it.product_id === productId);
    if (!item) {
      return NextResponse.json({ error: 'This product is not part of this order.' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    // 3-step flow (rate -> write a review -> upload a real photo) calls
    // this same endpoint once per step, so -- unlike before -- a second
    // call for the same (order, product) is expected, not an error: it
    // fills in the next step on the SAME review row instead of being
    // rejected or creating a duplicate. Whatever field a given call
    // doesn't send is left as it already was.
    const { data: existing } = await supabase
      .from('reviews')
      .select('id, rating, title, comment, photos')
      .eq('order_id', order.id)
      .eq('product_id', productId)
      .maybeSingle();

    const nextRating = rating !== undefined && rating !== null ? Number(rating) : existing?.rating;
    if (!Number.isFinite(nextRating) || nextRating < 1 || nextRating > 5) {
      return NextResponse.json({ error: 'A 1-5 star rating is required.' }, { status: 400 });
    }

    const nextTitle = title !== undefined ? (title || null) : existing?.title ?? null;
    const nextComment = comment !== undefined ? (comment || null) : existing?.comment ?? null;
    const nextPhotos = Array.isArray(photos) ? photos.slice(0, 4) : existing?.photos ?? [];

    const customerName = order.customer_name || (guestEmail ? String(guestEmail).split('@')[0] : 'Customer');

    // The exact colour-variant this order line was bought in, so the
    // review can be tagged/filtered by variation on the product page.
    const variantColor = item.color || null;
    const variantSlug = item.slug || null;

    let review;
    if (existing) {
      const { data, error: updateError } = await supabase
        .from('reviews')
        .update({
          rating: nextRating,
          title: nextTitle,
          comment: nextComment,
          photos: nextPhotos,
          variant_color: variantColor,
          variant_slug: variantSlug,
          // New/changed content should go back through moderation even
          // if an earlier partial step was already approved.
          is_approved: false,
        })
        .eq('id', existing.id)
        .select('*')
        .single();
      if (updateError) throw updateError;
      review = data;
    } else {
      const { data, error: insertError } = await supabase
        .from('reviews')
        .insert({
          product_id: productId,
          order_id: order.id,
          guest_email: guestEmail || order.customer_email || null,
          customer_name: customerName,
          rating: nextRating,
          title: nextTitle,
          comment: nextComment,
          photos: nextPhotos,
          variant_color: variantColor,
          variant_slug: variantSlug,
          is_approved: false,
          verified_purchase: true,
        })
        .select('*')
        .single();
      if (insertError) throw insertError;
      review = data;
    }

    let reward = null;
    try {
      // Safe to call on every step: issueReviewReward only actually
      // creates a coupon the first time all required steps are done
      // (see lib/review-rewards-server.ts) -- so step 1 and 2 calls
      // here simply return null, and only the call that completes the
      // last required step produces a reward. Exactly one reward per
      // order+product either way.
      reward = await issueReviewReward({
        orderId: order.id,
        productId,
        reviewId: review.id,
        rating: nextRating,
        comment: nextComment,
        photos: nextPhotos,
      });
    } catch (rewardErr) {
      // A reward failure should never lose the review the customer just
      // submitted -- log it and still return success for the review.
      console.error('[review-link POST] reward issue failed:', rewardErr);
    }

    // Reward was just newly issued (not merely already-existing from an
    // earlier step) -- also email the code, since the on-screen banner on
    // app/review/[token]/page.tsx is otherwise the ONLY place a guest ever
    // sees it: no account, no order history, nowhere to look it up again
    // if the tab is closed before it's copied. Best-effort: a failed/skipped
    // send (e.g. no email provider configured, or a guest who never gave an
    // email) must never fail the review submission itself, which is already
    // saved by this point.
    if (reward) {
      const recipientEmail = guestEmail || order.customer_email || null;
      // Write back onto the SAME review_rewards row every branch below --
      // this is exactly what powers the "Review Reward" row in Admin ->
      // Orders -> Email Log (see attachReviewRewards() in
      // lib/orders-api.ts). Not just the success path: an admin looking
      // at "why didn't the customer get their code" needs to see *why*
      // it didn't send (no email on file vs. provider not configured vs.
      // an actual send failure), not just a blank "Not sent yet" that
      // looks identical to "hasn't been attempted yet".
      if (!recipientEmail) {
        await supabase
          .from('review_rewards')
          .update({ email_error: 'No email address on this order/review' })
          .eq('id', reward.id);
      } else {
        try {
          const { subject, html } = reviewRewardIssuedEmail({
            order: { id: order.id, customer_name: order.customer_name },
            reward,
          });
          const result = await sendEmail({ to: recipientEmail, subject, html });
          if (result.success) {
            await supabase.from('review_rewards').update({ email_sent_at: new Date().toISOString() }).eq('id', reward.id);
          } else {
            const errMsg = typeof result.error === 'string' ? result.error : JSON.stringify(result.error);
            await supabase.from('review_rewards').update({ email_error: errMsg.slice(0, 500) }).eq('id', reward.id);
          }
        } catch (emailErr) {
          console.error('[review-link POST] reward email failed:', emailErr);
          const errMsg = emailErr instanceof Error ? emailErr.message : String(emailErr);
          await supabase.from('review_rewards').update({ email_error: errMsg.slice(0, 500) }).eq('id', reward.id);
        }
      }
    }

    const settings = await getReviewRewardSettings(supabase);
    const progress = getReviewStepProgress(
      { rating: nextRating, comment: nextComment, photos: nextPhotos },
      settings
    );

    // If this call didn't itself issue a reward but the steps are all
    // done and rewards are on, a reward must already exist from an
    // earlier call (issueReviewReward's own pre-check is what actually
    // guarantees this -- see its docstring).
    const rewardIssued = Boolean(reward) || (settings.enabled && progress.allRequiredStepsDone);

    return NextResponse.json({ review, reward, progress: { ...progress, rewardIssued } });
  } catch (err) {
    console.error('[review-link POST] error:', err);
    return NextResponse.json({ error: 'Could not submit your review right now.' }, { status: 500 });
  }
}
