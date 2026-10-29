// ---------------------------------------------------------------------
// Storefront "Reviews" section display settings, managed from
// Admin -> Reviews -> Display settings. Stored in the `settings` table
// under key 'review_display_settings'. The storefront reads it with the
// public anon key (the key is public on purpose -- it only holds display
// preferences). Writes go ONLY through app/api/admin/review-display-settings
// (admin-token gated, service role). See migration
// 20261029010000_review_display_settings_lock.sql which also blocks anon
// writes to this one key.
//
// This file is pure (no browser/Supabase imports) so both the admin API
// route and client components can import it.
// ---------------------------------------------------------------------

export type ReviewSort = 'newest' | 'highest' | 'lowest' | 'photos';

export interface ReviewDisplaySettings {
  /** Reviews shown before the shopper taps "Load more". */
  initialCount: number;
  /** Reviews added on every "Load more" tap. */
  loadMoreCount: number;
  /** Show the "Photos from customers" strip at the top. */
  showPhotoGallery: boolean;
  /** Max thumbnails in that strip (the rest sit behind a "+N" tile). */
  photoGalleryMax: number;
  /** Show the rating / photo filter chips and the sort menu. */
  showFilters: boolean;
  /** Show the "Variation (colour)" chips when reviews carry a colour. */
  showColorFilter: boolean;
  /** Sort order a shopper sees first. Pinned reviews always come first. */
  defaultSort: ReviewSort;
  /** Review ids pinned to the top (and first in the photo strip). */
  featuredReviewIds: string[];
}

export const DEFAULT_REVIEW_DISPLAY_SETTINGS: ReviewDisplaySettings = {
  initialCount: 5,
  loadMoreCount: 5,
  showPhotoGallery: true,
  photoGalleryMax: 12,
  showFilters: true,
  showColorFilter: true,
  defaultSort: 'newest',
  featuredReviewIds: [],
};

const SORTS: ReviewSort[] = ['newest', 'highest', 'lowest', 'photos'];

const clampInt = (v: unknown, min: number, max: number, fallback: number) => {
  const n = typeof v === 'number' ? v : parseInt(String(v), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
};

export function mergeReviewDisplaySettings(
  value: Partial<ReviewDisplaySettings> | null | undefined
): ReviewDisplaySettings {
  const d = DEFAULT_REVIEW_DISPLAY_SETTINGS;
  const v = value || {};
  const ids = Array.isArray(v.featuredReviewIds)
    ? Array.from(new Set(v.featuredReviewIds.filter((x): x is string => typeof x === 'string' && x.length > 0)))
    : d.featuredReviewIds;
  return {
    initialCount: clampInt(v.initialCount, 1, 50, d.initialCount),
    loadMoreCount: clampInt(v.loadMoreCount, 1, 50, d.loadMoreCount),
    showPhotoGallery: typeof v.showPhotoGallery === 'boolean' ? v.showPhotoGallery : d.showPhotoGallery,
    photoGalleryMax: clampInt(v.photoGalleryMax, 4, 60, d.photoGalleryMax),
    showFilters: typeof v.showFilters === 'boolean' ? v.showFilters : d.showFilters,
    showColorFilter: typeof v.showColorFilter === 'boolean' ? v.showColorFilter : d.showColorFilter,
    defaultSort: SORTS.includes(v.defaultSort as ReviewSort) ? (v.defaultSort as ReviewSort) : d.defaultSort,
    featuredReviewIds: ids.slice(0, 100),
  };
}
