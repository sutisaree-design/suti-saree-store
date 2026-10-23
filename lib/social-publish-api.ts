// ---------------------------------------------------------------------
// Auto-publish a product to Facebook (Page) and Instagram (Business
// account linked to that Page) via the Meta Graph API, the moment the
// product goes live — whether it came from a vendor's AI-processed
// listing (app/api/vendor/ai-process/[id]/route.ts) or an admin's
// direct "Add Product" (components/admin/products-panel.tsx via the
// new app/api/social/publish route).
//
// This file is server-only (uses fetch to graph.facebook.com and the
// Supabase admin client) — never import it from a 'use client' file.
//
// SETUP (one-time, in Admin > Marketing > Social Auto-Post):
//   1. Create a Meta App at developers.facebook.com, add the
//      "Facebook Login for Business" + Instagram Graph API products.
//   2. Get a long-lived Page Access Token for your Facebook Page, with
//      the pages_manage_posts, pages_read_engagement and
//      instagram_content_publish, instagram_basic permissions.
//   3. Note your Facebook Page ID.
//   4. If posting to Instagram too, the Page must have an Instagram
//      Business/Creator account linked — note that account's ID
//      (Graph API: GET /{page-id}?fields=instagram_business_account).
//   5. Paste the Page ID, Instagram Business Account ID, and the
//      access token into Admin > Marketing > Social Auto-Post, and
//      toggle Facebook / Instagram on.
//   6. Threads is a SEPARATE Meta app/OAuth flow (graph.threads.net,
//      not graph.facebook.com) — the token above will NOT work here.
//      Create/enable the Threads API product on your Meta App, get a
//      Threads access token with threads_basic + threads_content_publish,
//      then call GET https://graph.threads.net/v1.0/me?access_token=...
//      to get your Threads user id. Paste both into Admin > Marketing >
//      Social Auto-Post and toggle Threads on.
// ---------------------------------------------------------------------

import type { SupabaseClient } from '@supabase/supabase-js';

const GRAPH_API_VERSION = 'v21.0';
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

// Threads is also a Meta product, but it runs on a completely separate
// Graph API host/version with its own OAuth app, its own access token,
// and its own user id — the Facebook Page token used for FB/Instagram
// above does NOT work here.
const THREADS_API_BASE = 'https://graph.threads.net/v1.0';

export interface SocialPublishSettings {
  facebook_enabled: boolean;
  instagram_enabled: boolean;
  // Long-lived Page Access Token. The same token is used for both the
  // Facebook Page post and the linked Instagram Business account post
  // (that's how the Graph API works — Instagram publishing goes
  // through the Page's token, not a separate Instagram login).
  access_token: string;
  facebook_page_id: string;
  instagram_business_account_id: string;
  // Threads (separate Meta app/OAuth — see THREADS_API_BASE above).
  threads_enabled: boolean;
  threads_access_token: string;
  threads_user_id: string;
  // Template for the post caption. {name}, {price}, {url}, {description}
  // are replaced with the product's actual values. {mrp} and
  // {discount_percent} are also available — both resolve to an empty
  // string when the product has no MRP set or isn't actually discounted,
  // so a template line like "{discount_percent}% OFF" quietly disappears
  // instead of printing "0% OFF" or "% OFF".
  caption_template: string;
}

export const DEFAULT_SOCIAL_PUBLISH_SETTINGS: SocialPublishSettings = {
  facebook_enabled: false,
  instagram_enabled: false,
  access_token: '',
  facebook_page_id: '',
  instagram_business_account_id: '',
  threads_enabled: false,
  threads_access_token: '',
  threads_user_id: '',
  caption_template: '✨ New Arrival: {name}\n\n{description}\n\nPrice: ₹{price}\nShop now: {url}',
};

const SETTINGS_KEY = 'social_publish';

/** Server-side read (route handlers / cron — pass in the admin client you already have). */
export async function fetchSocialPublishSettingsServer(
  admin: SupabaseClient
): Promise<SocialPublishSettings> {
  const { data, error } = await admin
    .from('settings')
    .select('value')
    .eq('key', SETTINGS_KEY)
    .maybeSingle();
  if (error || !data) return DEFAULT_SOCIAL_PUBLISH_SETTINGS;
  return { ...DEFAULT_SOCIAL_PUBLISH_SETTINGS, ...(data.value as Partial<SocialPublishSettings>) };
}

/** Server-side write (used by the admin settings API route). */
export async function saveSocialPublishSettingsServer(
  admin: SupabaseClient,
  settings: SocialPublishSettings
): Promise<void> {
  const { error } = await admin
    .from('settings')
    .upsert({ key: SETTINGS_KEY, value: settings }, { onConflict: 'key' });
  if (error) throw error;
}

interface ProductForSocial {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  price: number;
  // Original/strike-through price shown on the product card (Admin >
  // Products "MRP" column). Optional — older rows or products with no
  // discount simply won't have {mrp}/{discount_percent} populated.
  mrp?: number | null;
  images?: string[] | null;
  social_posted_at?: string | null;
  social_post_ids?: Record<string, string> | null;
}

/** A single social platform this feature can post to. When omitted from
 *  publishProductToSocial()'s options, ALL enabled platforms are posted to
 *  (legacy/auto-post behaviour). When provided, only that one platform is
 *  gated on/attempted — used by the three separate per-platform Share
 *  buttons in Admin > Products. */
export type SocialPlatform = 'facebook' | 'instagram' | 'threads';

/** Same rule as lib/format.ts's discountPct(): an MRP only counts as a
 *  real discount if it's actually higher than the selling price — avoids
 *  showing "0% off" or a negative discount for non-discounted products. */
function discountPercentForCaption(price: number, mrp?: number | null): number {
  if (!mrp || mrp <= price) return 0;
  return Math.round(((mrp - price) / mrp) * 100);
}

function buildCaption(template: string, product: ProductForSocial, siteUrl: string): string {
  const description = (product.description || '').slice(0, 300);
  const url = `${siteUrl.replace(/\/$/, '')}/product/${product.slug}`;
  const discountPercent = discountPercentForCaption(product.price, product.mrp);
  return template
    .replaceAll('{name}', product.name || '')
    .replaceAll('{price}', String(product.price ?? ''))
    .replaceAll('{mrp}', product.mrp ? String(product.mrp) : '')
    .replaceAll('{discount_percent}', discountPercent > 0 ? String(discountPercent) : '')
    .replaceAll('{url}', url)
    .replaceAll('{description}', description);
}

async function postToFacebook(
  settings: SocialPublishSettings,
  caption: string,
  imageUrls: string[]
): Promise<string | null> {
  if (imageUrls.length === 0) {
    // Text-only post.
    const res = await fetch(`${GRAPH_API_BASE}/${settings.facebook_page_id}/feed`, {
      method: 'POST',
      body: new URLSearchParams({ access_token: settings.access_token, message: caption }),
    });
    const json = await res.json();
    if (!res.ok || json.error) {
      throw new Error(`Facebook post failed: ${json?.error?.message || res.statusText}`);
    }
    return json.id || null;
  }

  if (imageUrls.length === 1) {
    // Single photo post — photo + caption in one call.
    const res = await fetch(`${GRAPH_API_BASE}/${settings.facebook_page_id}/photos`, {
      method: 'POST',
      body: new URLSearchParams({
        access_token: settings.access_token,
        url: imageUrls[0],
        caption,
      }),
    });
    const json = await res.json();
    if (!res.ok || json.error) {
      throw new Error(`Facebook post failed: ${json?.error?.message || res.statusText}`);
    }
    return json.post_id || json.id || null;
  }

  // Multiple photos — Facebook's multi-photo post model: upload each photo
  // "unpublished" (it won't appear on its own), then create one feed post
  // that attaches all of them together as a single multi-image post.
  const photoIds: string[] = [];
  for (const url of imageUrls) {
    const res = await fetch(`${GRAPH_API_BASE}/${settings.facebook_page_id}/photos`, {
      method: 'POST',
      body: new URLSearchParams({
        access_token: settings.access_token,
        url,
        published: 'false',
      }),
    });
    const json = await res.json();
    if (!res.ok || json.error || !json.id) {
      throw new Error(`Facebook photo upload failed: ${json?.error?.message || res.statusText}`);
    }
    photoIds.push(json.id);
  }

  const feedRes = await fetch(`${GRAPH_API_BASE}/${settings.facebook_page_id}/feed`, {
    method: 'POST',
    body: new URLSearchParams({
      access_token: settings.access_token,
      message: caption,
      attached_media: JSON.stringify(photoIds.map((id) => ({ media_fbid: id }))),
    }),
  });
  const feedJson = await feedRes.json();
  if (!feedRes.ok || feedJson.error) {
    throw new Error(`Facebook multi-photo post failed: ${feedJson?.error?.message || feedRes.statusText}`);
  }
  return feedJson.id || null;
}

/**
 * Instagram/Threads media containers are processed asynchronously by
 * Meta's servers — publishing immediately after create() can fail
 * (silently, from our fire-and-forget caller's perspective) if the
 * container isn't ready yet. This polls the container's status_code
 * and waits for FINISHED (or bails on ERROR) before we try to publish.
 * Images are usually ready in 1-3 seconds; we allow up to ~20s.
 */
async function waitForContainerReady(
  apiBase: string,
  containerId: string,
  accessToken: string
): Promise<void> {
  const maxAttempts = 10;
  const delayMs = 2000;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const res = await fetch(
      `${apiBase}/${containerId}?fields=status_code&access_token=${encodeURIComponent(accessToken)}`
    );
    const json = await res.json();
    if (json.status_code === 'FINISHED') return;
    if (json.status_code === 'ERROR') {
      throw new Error(`Media container processing failed: ${json?.status || 'ERROR'}`);
    }
    // IN_PROGRESS or EXPIRED (too soon to tell) — wait and retry.
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  // Didn't confirm FINISHED in time — try the publish anyway rather than
  // giving up; many containers are actually ready but status lags.
}

async function postToInstagram(
  settings: SocialPublishSettings,
  caption: string,
  imageUrls: string[]
): Promise<string | null> {
  if (imageUrls.length === 0) return null; // Instagram requires at least one image.

  if (imageUrls.length === 1) {
    // Single-image post: create container, wait, publish.
    const createRes = await fetch(
      `${GRAPH_API_BASE}/${settings.instagram_business_account_id}/media`,
      {
        method: 'POST',
        body: new URLSearchParams({
          image_url: imageUrls[0],
          caption,
          access_token: settings.access_token,
        }),
      }
    );
    const createJson = await createRes.json();
    if (!createRes.ok || createJson.error || !createJson.id) {
      throw new Error(`Instagram container create failed: ${createJson?.error?.message || createRes.statusText}`);
    }
    await waitForContainerReady(GRAPH_API_BASE, createJson.id, settings.access_token);
    return publishInstagramContainer(settings, createJson.id);
  }

  // Carousel (2-10 images; Meta caps carousels at 10 items).
  const items = imageUrls.slice(0, 10);
  const childIds: string[] = [];
  for (const url of items) {
    const childRes = await fetch(
      `${GRAPH_API_BASE}/${settings.instagram_business_account_id}/media`,
      {
        method: 'POST',
        body: new URLSearchParams({
          image_url: url,
          is_carousel_item: 'true',
          access_token: settings.access_token,
        }),
      }
    );
    const childJson = await childRes.json();
    if (!childRes.ok || childJson.error || !childJson.id) {
      throw new Error(`Instagram carousel item failed: ${childJson?.error?.message || childRes.statusText}`);
    }
    await waitForContainerReady(GRAPH_API_BASE, childJson.id, settings.access_token);
    childIds.push(childJson.id);
  }

  const carouselRes = await fetch(
    `${GRAPH_API_BASE}/${settings.instagram_business_account_id}/media`,
    {
      method: 'POST',
      body: new URLSearchParams({
        media_type: 'CAROUSEL',
        children: childIds.join(','),
        caption,
        access_token: settings.access_token,
      }),
    }
  );
  const carouselJson = await carouselRes.json();
  if (!carouselRes.ok || carouselJson.error || !carouselJson.id) {
    throw new Error(`Instagram carousel create failed: ${carouselJson?.error?.message || carouselRes.statusText}`);
  }
  await waitForContainerReady(GRAPH_API_BASE, carouselJson.id, settings.access_token);
  return publishInstagramContainer(settings, carouselJson.id);
}

async function publishInstagramContainer(
  settings: SocialPublishSettings,
  creationId: string
): Promise<string | null> {
  const publishRes = await fetch(
    `${GRAPH_API_BASE}/${settings.instagram_business_account_id}/media_publish`,
    {
      method: 'POST',
      body: new URLSearchParams({
        creation_id: creationId,
        access_token: settings.access_token,
      }),
    }
  );
  const publishJson = await publishRes.json();
  if (!publishRes.ok || publishJson.error) {
    throw new Error(`Instagram publish failed: ${publishJson?.error?.message || publishRes.statusText}`);
  }
  return publishJson.id || null;
}

async function postToThreads(
  settings: SocialPublishSettings,
  rawCaption: string,
  imageUrls: string[]
): Promise<string | null> {
  // Threads hard-caps the `text` param at 500 characters (unlike Facebook's
  // feed message or Instagram's 2200-char caption) -- the same caption that
  // works fine on FB/IG can still be rejected here with "Param text must be
  // at most 500 characters long". Truncate on a word boundary and keep an
  // ellipsis so it doesn't cut off mid-word.
  const THREADS_TEXT_LIMIT = 500;
  const caption =
    rawCaption.length > THREADS_TEXT_LIMIT
      ? rawCaption.slice(0, THREADS_TEXT_LIMIT - 1).replace(/\s+\S*$/, '') + '…'
      : rawCaption;

  if (imageUrls.length === 0) {
    // Text-only thread.
    const createRes = await fetch(`${THREADS_API_BASE}/${settings.threads_user_id}/threads`, {
      method: 'POST',
      body: new URLSearchParams({
        access_token: settings.threads_access_token,
        text: caption,
        media_type: 'TEXT',
      }),
    });
    const createJson = await createRes.json();
    if (!createRes.ok || createJson.error || !createJson.id) {
      throw new Error(`Threads container create failed: ${createJson?.error?.message || createRes.statusText}`);
    }
    await waitForContainerReady(THREADS_API_BASE, createJson.id, settings.threads_access_token);
    return publishThreadsContainer(settings, createJson.id);
  }

  if (imageUrls.length === 1) {
    const createRes = await fetch(`${THREADS_API_BASE}/${settings.threads_user_id}/threads`, {
      method: 'POST',
      body: new URLSearchParams({
        access_token: settings.threads_access_token,
        text: caption,
        media_type: 'IMAGE',
        image_url: imageUrls[0],
      }),
    });
    const createJson = await createRes.json();
    if (!createRes.ok || createJson.error || !createJson.id) {
      throw new Error(`Threads container create failed: ${createJson?.error?.message || createRes.statusText}`);
    }
    await waitForContainerReady(THREADS_API_BASE, createJson.id, settings.threads_access_token);
    return publishThreadsContainer(settings, createJson.id);
  }

  // Carousel (Threads accepts up to 10-20 items depending on API version;
  // we cap at 10 to stay consistent with Instagram's limit).
  const items = imageUrls.slice(0, 10);
  const childIds: string[] = [];
  for (const url of items) {
    const childRes = await fetch(`${THREADS_API_BASE}/${settings.threads_user_id}/threads`, {
      method: 'POST',
      body: new URLSearchParams({
        access_token: settings.threads_access_token,
        media_type: 'IMAGE',
        image_url: url,
        is_carousel_item: 'true',
      }),
    });
    const childJson = await childRes.json();
    if (!childRes.ok || childJson.error || !childJson.id) {
      throw new Error(`Threads carousel item failed: ${childJson?.error?.message || childRes.statusText}`);
    }
    await waitForContainerReady(THREADS_API_BASE, childJson.id, settings.threads_access_token);
    childIds.push(childJson.id);
  }

  const carouselRes = await fetch(`${THREADS_API_BASE}/${settings.threads_user_id}/threads`, {
    method: 'POST',
    body: new URLSearchParams({
      access_token: settings.threads_access_token,
      media_type: 'CAROUSEL',
      children: childIds.join(','),
      text: caption,
    }),
  });
  const carouselJson = await carouselRes.json();
  if (!carouselRes.ok || carouselJson.error || !carouselJson.id) {
    throw new Error(`Threads carousel create failed: ${carouselJson?.error?.message || carouselRes.statusText}`);
  }
  await waitForContainerReady(THREADS_API_BASE, carouselJson.id, settings.threads_access_token);
  return publishThreadsContainer(settings, carouselJson.id);
}

async function publishThreadsContainer(
  settings: SocialPublishSettings,
  creationId: string
): Promise<string | null> {
  const publishRes = await fetch(`${THREADS_API_BASE}/${settings.threads_user_id}/threads_publish`, {
    method: 'POST',
    body: new URLSearchParams({
      creation_id: creationId,
      access_token: settings.threads_access_token,
    }),
  });
  const publishJson = await publishRes.json();
  if (!publishRes.ok || publishJson.error) {
    throw new Error(`Threads publish failed: ${publishJson?.error?.message || publishRes.statusText}`);
  }
  return publishJson.id || null;
}

/** Outcome of a publishProductToSocial() call — the API route and the
 *  client-side Share buttons use this to show an honest success/failure
 *  toast instead of always assuming success. */
export interface PublishResult {
  /** True only if at least one requested platform actually posted. */
  posted: boolean;
  /** Human-readable reason nothing was posted (config/gating issue), when posted is false and there were no hard errors. */
  reason?: string;
  /** Hard errors returned by the Graph API calls themselves, if any were attempted. */
  errors?: string[];
}

/**
 * Posts a single product to Facebook and/or Instagram per whatever's
 * enabled in settings, then stamps social_posted_at so it never gets
 * posted twice. Designed to be called fire-and-forget with .catch() —
 * a social-post failure must NEVER block or unwind the product actually
 * going live in the store. Returns a PublishResult so callers (the API
 * route, and ultimately the admin Share button) can tell the difference
 * between "actually posted" and "silently skipped" instead of assuming
 * success just because nothing threw.
 */
export async function publishProductToSocial(
  admin: SupabaseClient,
  product: ProductForSocial,
  options?: { force?: boolean; platform?: SocialPlatform }
): Promise<PublishResult> {
  const { platform } = options ?? {};
  // Per-platform gating: when a specific platform is requested (one of the
  // three separate admin Share buttons), only that platform's "already
  // posted" state blocks a re-post — the other two platforms' history is
  // irrelevant to this call. Legacy/auto-post calls (no platform) keep the
  // old any-platform-posted-at check.
  const alreadyPostedThisPlatform = platform
    ? Boolean(product.social_post_ids?.[`${platform}_post_id`] ?? product.social_post_ids?.[`${platform}_media_id`])
    : Boolean(product.social_posted_at);
  if (alreadyPostedThisPlatform && !options?.force) {
    // already posted once — don't duplicate
    return { posted: false, reason: 'Already posted once. Use re-share to force a repost.' };
  }

  const settings = await fetchSocialPublishSettingsServer(admin);
  const wantFacebook = (!platform || platform === 'facebook') && settings.facebook_enabled;
  const wantInstagram = (!platform || platform === 'instagram') && settings.instagram_enabled;
  const wantThreads = (!platform || platform === 'threads') && settings.threads_enabled;
  const anyEnabled = wantFacebook || wantInstagram || wantThreads;
  if (!anyEnabled) {
    return {
      posted: false,
      reason: 'Not enabled — turn it on in Admin > Marketing > Social Auto-Post.',
    };
  }
  const hasUsableCredentials =
    ((wantFacebook || wantInstagram) && settings.access_token) ||
    (wantThreads && settings.threads_access_token);
  if (!hasUsableCredentials) {
    return {
      posted: false,
      reason: 'Missing access token — add it in Admin > Marketing > Social Auto-Post.',
    };
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://your-store.example.com';

  // If this product has color variants (each with its own images/SEO page),
  // pull them in as ONE combined post rather than posting once per variant.
  // Carousels get materially better engagement/reach than a burst of
  // near-duplicate single-image posts, and it doesn't eat into the
  // platforms' daily post-count limits as fast. See the "variation
  // products" discussion for why this was chosen over per-variant posts.
  const { data: variants } = await admin
    .from('product_variants')
    .select('color, images')
    .eq('product_id', product.id)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: true });

  let caption = buildCaption(settings.caption_template, product, siteUrl);

  const imageUrls = [...(product.images || [])].filter(Boolean);
  if (variants && variants.length > 0) {
    const colors: string[] = [];
    for (const v of variants) {
      if (v.color) colors.push(v.color);
      const firstVariantImage = (v.images || []).find(Boolean);
      if (firstVariantImage && !imageUrls.includes(firstVariantImage)) {
        imageUrls.push(firstVariantImage);
      }
    }
    if (colors.length > 0) {
      caption += `\n\nAvailable in: ${colors.join(', ')}`;
    }
  }
  // Meta caps carousels at 10 items across Instagram/Threads.
  const finalImageUrls = imageUrls.slice(0, 10);

  // Start from whatever's already been posted on other platforms so this
  // call only ever adds/overwrites the platform(s) it actually attempted —
  // it must never wipe out a sibling platform's post id.
  const postIds: Record<string, string> = { ...(product.social_post_ids ?? {}) };
  const errors: string[] = [];
  // Tracks whether we actually attempted at least one platform below (vs.
  // every requested platform being skipped for missing Page/Account IDs),
  // and whether any attempt actually succeeded — these decide the final
  // `posted` flag returned to the caller.
  let attemptedAny = false;

  if (wantFacebook) {
    if (!settings.facebook_page_id) {
      errors.push('Facebook enabled but Page ID is missing in Marketing settings.');
    } else {
      attemptedAny = true;
      try {
        const id = await postToFacebook(settings, caption, finalImageUrls);
        if (id) postIds.facebook_post_id = id;
      } catch (err) {
        console.error('[social-publish] Facebook post failed for product', product.id, err);
        errors.push(String(err));
      }
    }
  }

  if (wantInstagram) {
    if (!settings.instagram_business_account_id) {
      errors.push('Instagram enabled but Business Account ID is missing in Marketing settings.');
    } else if (finalImageUrls.length === 0) {
      console.error('[social-publish] Instagram skipped for product', product.id, '— no image');
      errors.push('Instagram requires at least one product image.');
    } else {
      attemptedAny = true;
      try {
        const id = await postToInstagram(settings, caption, finalImageUrls);
        if (id) postIds.instagram_media_id = id;
      } catch (err) {
        console.error('[social-publish] Instagram post failed for product', product.id, err);
        errors.push(String(err));
      }
    }
  }

  if (wantThreads) {
    if (!settings.threads_user_id) {
      errors.push('Threads enabled but User ID is missing in Marketing settings.');
    } else {
      attemptedAny = true;
      try {
        const id = await postToThreads(settings, caption, finalImageUrls);
        if (id) postIds.threads_post_id = id;
      } catch (err) {
        console.error('[social-publish] Threads post failed for product', product.id, err);
        errors.push(String(err));
      }
    }
  }

  const newlyPosted =
    postIds.facebook_post_id !== product.social_post_ids?.facebook_post_id ||
    postIds.instagram_media_id !== product.social_post_ids?.instagram_media_id ||
    postIds.threads_post_id !== product.social_post_ids?.threads_post_id;

  if (!attemptedAny) {
    // Every requested platform was missing its Page/Account ID — nothing
    // was ever attempted, so don't stamp social_posted_at at all.
    return { posted: false, reason: errors[0] ?? 'Platform is missing required IDs in Marketing settings.', errors };
  }

  // Stamp as posted even on partial failure, so a permanently-broken
  // token doesn't retry-loop forever on every future product. Full
  // success/failure detail is in postIds / server logs. social_posted_at
  // stays a single "has this product ever been shared, on any platform"
  // timestamp — per-platform state lives in social_post_ids.
  await admin
    .from('products')
    .update({ social_posted_at: new Date().toISOString(), social_post_ids: postIds })
    .eq('id', product.id);

  return {
    posted: newlyPosted,
    reason: newlyPosted ? undefined : errors[0] ?? 'Post did not succeed on any platform.',
    errors: errors.length > 0 ? errors : undefined,
  };
}

// ---------------------------------------------------------------------
// VIDEO posting (Admin > Products > "Generate Video" → per-platform Post
// Video buttons). Separate from the photo/carousel flow above because:
//   - it's always manually triggered (never auto-post-on-publish)
//   - video containers take much longer to process than photos, so the
//     polling window below is wider
//   - Instagram requires media_type=REELS specifically for video (a plain
//     "VIDEO" media_type on the /media endpoint is for Stories, which
//     aren't shareable/postable the same way)
// ---------------------------------------------------------------------

/** Same as waitForContainerReady but with a longer timeout — Meta can take
 *  30-90s to finish transcoding a video, vs 1-3s for a photo. */
async function waitForVideoContainerReady(
  apiBase: string,
  containerId: string,
  accessToken: string
): Promise<void> {
  const maxAttempts = 30;
  const delayMs = 4000; // up to ~2 minutes total
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const res = await fetch(
      `${apiBase}/${containerId}?fields=status_code&access_token=${encodeURIComponent(accessToken)}`
    );
    const json = await res.json();
    if (json.status_code === 'FINISHED') return;
    if (json.status_code === 'ERROR') {
      throw new Error(`Video processing failed: ${json?.status || 'ERROR'}`);
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  // Didn't confirm in time — try publishing anyway, same fallback logic as photos.
}

async function postVideoToInstagram(
  settings: SocialPublishSettings,
  caption: string,
  videoUrl: string
): Promise<string | null> {
  const createRes = await fetch(`${GRAPH_API_BASE}/${settings.instagram_business_account_id}/media`, {
    method: 'POST',
    body: new URLSearchParams({
      media_type: 'REELS',
      video_url: videoUrl,
      caption,
      access_token: settings.access_token,
    }),
  });
  const createJson = await createRes.json();
  if (!createRes.ok || createJson.error || !createJson.id) {
    throw new Error(`Instagram Reels container create failed: ${createJson?.error?.message || createRes.statusText}`);
  }
  await waitForVideoContainerReady(GRAPH_API_BASE, createJson.id, settings.access_token);
  return publishInstagramContainer(settings, createJson.id);
}

async function postVideoToFacebook(
  settings: SocialPublishSettings,
  caption: string,
  videoUrl: string
): Promise<string | null> {
  // Facebook's /{page-id}/videos endpoint uploads-by-URL and publishes
  // in one call (no separate container/publish step like Instagram).
  const res = await fetch(`${GRAPH_API_BASE}/${settings.facebook_page_id}/videos`, {
    method: 'POST',
    body: new URLSearchParams({
      file_url: videoUrl,
      description: caption,
      access_token: settings.access_token,
    }),
  });
  const json = await res.json();
  if (!res.ok || json.error) {
    throw new Error(`Facebook video post failed: ${json?.error?.message || res.statusText}`);
  }
  return json.id || null;
}

async function postVideoToThreads(
  settings: SocialPublishSettings,
  caption: string,
  videoUrl: string
): Promise<string | null> {
  const createRes = await fetch(`${THREADS_API_BASE}/${settings.threads_user_id}/threads`, {
    method: 'POST',
    body: new URLSearchParams({
      access_token: settings.threads_access_token,
      text: caption,
      media_type: 'VIDEO',
      video_url: videoUrl,
    }),
  });
  const createJson = await createRes.json();
  if (!createRes.ok || createJson.error || !createJson.id) {
    throw new Error(`Threads video container create failed: ${createJson?.error?.message || createRes.statusText}`);
  }
  await waitForVideoContainerReady(THREADS_API_BASE, createJson.id, settings.threads_access_token);
  return publishThreadsContainer(settings, createJson.id);
}

export interface VideoProductForSocial {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  price: number;
  video_url?: string | null;
  social_post_ids?: Record<string, string> | null;
}

/**
 * Posts a product's already-generated slideshow video (products.video_url,
 * set by /api/admin/product-video/upload) to one platform. Always
 * manually triggered from the admin's per-platform "Post Video" buttons —
 * never part of the auto-post-on-publish flow, so there's no `force`
 * concept here: re-clicking simply posts again (each platform naturally
 * allows re-uploading a video as a new post).
 */
export async function publishVideoToSocial(
  admin: SupabaseClient,
  product: VideoProductForSocial,
  platform: SocialPlatform
): Promise<PublishResult> {
  if (!product.video_url) {
    return { posted: false, reason: 'No video generated yet for this product — use "Generate Video" first.' };
  }

  const settings = await fetchSocialPublishSettingsServer(admin);
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://your-store.example.com';
  const caption = buildCaption(settings.caption_template, product, siteUrl);

  if (platform === 'facebook' && !settings.facebook_enabled) {
    return { posted: false, reason: 'Facebook is not enabled in Marketing settings.' };
  }
  if (platform === 'instagram' && !settings.instagram_enabled) {
    return { posted: false, reason: 'Instagram is not enabled in Marketing settings.' };
  }
  if (platform === 'threads' && !settings.threads_enabled) {
    return { posted: false, reason: 'Threads is not enabled in Marketing settings.' };
  }

  const postIds: Record<string, string> = { ...(product.social_post_ids ?? {}) };
  try {
    if (platform === 'facebook') {
      if (!settings.facebook_page_id) return { posted: false, reason: 'Facebook Page ID is missing in Marketing settings.' };
      const id = await postVideoToFacebook(settings, caption, product.video_url);
      if (id) postIds.facebook_video_post_id = id;
    } else if (platform === 'instagram') {
      if (!settings.instagram_business_account_id) {
        return { posted: false, reason: 'Instagram Business Account ID is missing in Marketing settings.' };
      }
      const id = await postVideoToInstagram(settings, caption, product.video_url);
      if (id) postIds.instagram_video_media_id = id;
    } else {
      if (!settings.threads_user_id) return { posted: false, reason: 'Threads User ID is missing in Marketing settings.' };
      const id = await postVideoToThreads(settings, caption, product.video_url);
      if (id) postIds.threads_video_post_id = id;
    }
  } catch (err) {
    console.error(`[social-publish] ${platform} video post failed for product`, product.id, err);
    return { posted: false, reason: String(err) };
  }

  await admin.from('products').update({ social_post_ids: postIds }).eq('id', product.id);
  return { posted: true };
}
