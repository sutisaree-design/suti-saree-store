'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Star, CheckCircle2, ImagePlus, X, Loader2, ThumbsUp, ChevronLeft, ChevronRight, Camera, Pin, SlidersHorizontal } from 'lucide-react';
import { toPublicMediaUrl } from '@/lib/media-url';
import { useAuth } from '@/lib/auth-context';
import {
  Review,
  fetchApprovedReviews,
  fetchReviewDisplaySettings,
  fetchMyReviewForProduct,
  filterReviewsByColor,
  getReviewColorOptions,
  hasPurchasedProduct,
  hasWrittenContent,
  scheduleAutoPublish,
  submitReview,
  summarizeReviews,
  updateMyReview,
  uploadReviewPhoto,
} from '@/lib/reviews-api';
import { DEFAULT_REVIEW_DISPLAY_SETTINGS, type ReviewDisplaySettings, type ReviewSort } from '@/lib/review-display-settings';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';

function StarRow({
  value,
  size = 'h-4 w-4',
}: {
  value: number;
  size?: string;
}) {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={`${size} ${
            i < Math.round(value) ? 'fill-secondary text-secondary' : 'text-muted-foreground/30'
          }`}
        />
      ))}
    </div>
  );
}

function StarPicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (n: number) => void;
}) {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: 5 }).map((_, i) => {
        const n = i + 1;
        return (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            onMouseEnter={() => setHover(n)}
            onMouseLeave={() => setHover(0)}
            aria-label={`Rate ${n} stars`}
          >
            <Star
              className={`h-7 w-7 transition-colors ${
                n <= (hover || value)
                  ? 'fill-secondary text-secondary'
                  : 'text-muted-foreground/30'
              }`}
            />
          </button>
        );
      })}
    </div>
  );
}

const RATING_LABELS: Record<1 | 2 | 3 | 4 | 5, string> = {
  5: 'Excellent',
  4: 'Very Good',
  3: 'Good',
  2: 'Average',
  1: 'Poor',
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
}

/** Public-facing reviews only ever show the reviewer's first name, for privacy. */
function firstName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts[0] ?? name;
}


// 64px thumbnails should not download the full-size review photo. New
// uploads get a "<name>-sm.webp" (480px) sibling (see
// app/api/upload-review-photo/route.ts); older photos get one from the
// admin "Resize backfill". The <img> falls back to the original on error.
function reviewThumbUrl(src: string): string {
  const full = toPublicMediaUrl(src) || src;
  const dot = full.lastIndexOf('.');
  if (dot === -1 || full.includes('data:') || full.startsWith('blob:')) return full;
  return `${full.slice(0, dot)}-sm.webp`;
}


type RatingFilter = 'all' | 'photos' | '5' | '4' | 'low';

interface PhotoItem {
  src: string;
  reviewId: string;
  name: string;
  rating: number;
  comment: string | null;
}

/** Square thumbnail that falls back to the original photo when the
 *  "-sm.webp" sibling does not exist yet (older / imported photos). */
function PhotoThumb({ src, alt, className }: { src: string; alt: string; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={reviewThumbUrl(src)}
      alt={alt}
      loading="lazy"
      decoding="async"
      onError={(e) => {
        const img = e.currentTarget;
        if (img.dataset.fallback) return;
        img.dataset.fallback = '1';
        img.src = toPublicMediaUrl(src) || src;
      }}
      className={className}
    />
  );
}

/** Full-screen photo viewer with previous / next, keyboard and swipe. */
function PhotoLightbox({
  items,
  index,
  onIndex,
  onClose,
}: {
  items: PhotoItem[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
}) {
  const [touchX, setTouchX] = useState<number | null>(null);
  const item = items[index];
  const go = (dir: -1 | 1) => onIndex((index + dir + items.length) % items.length);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === 'ArrowRight') go(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, items.length]);

  if (!item) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/95"
      onClick={onClose}
      onTouchStart={(e) => setTouchX(e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touchX === null) return;
        const dx = e.changedTouches[0].clientX - touchX;
        setTouchX(null);
        if (Math.abs(dx) > 50 && items.length > 1) go(dx > 0 ? -1 : 1);
      }}
    >
      <div className="flex items-center justify-between px-4 py-3 text-white/80">
        <span className="text-xs font-medium tracking-wide">
          {index + 1} / {items.length}
        </span>
        <button
          type="button"
          aria-label="Close photo"
          onClick={onClose}
          className="rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center px-2 sm:px-14">
        {items.length > 1 && (
          <button
            type="button"
            aria-label="Previous photo"
            onClick={(e) => {
              e.stopPropagation();
              go(-1);
            }}
            className="absolute left-2 z-10 hidden rounded-full bg-white/10 p-2.5 text-white hover:bg-white/20 sm:block"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
        )}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={toPublicMediaUrl(item.src) || item.src}
          alt={`Photo from ${item.name}'s review`}
          className="max-h-full max-w-full rounded-xl object-contain"
          onClick={(e) => e.stopPropagation()}
        />
        {items.length > 1 && (
          <button
            type="button"
            aria-label="Next photo"
            onClick={(e) => {
              e.stopPropagation();
              go(1);
            }}
            className="absolute right-2 z-10 hidden rounded-full bg-white/10 p-2.5 text-white hover:bg-white/20 sm:block"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        )}
      </div>

      <div className="px-4 pb-6 pt-3 text-white" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto flex max-w-xl flex-col items-center gap-1.5 text-center">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">{item.name}</span>
            <StarRow value={item.rating} size="h-3.5 w-3.5" />
          </div>
          {item.comment && <p className="line-clamp-2 text-xs leading-relaxed text-white/70">{item.comment}</p>}
          {items.length > 1 && <p className="text-[11px] text-white/40 sm:hidden">Swipe left or right for more photos</p>}
        </div>
      </div>
    </div>
  );
}

const COMMENT_CLAMP = 220;

function ReviewCard({
  r,
  featured,
  helpful,
  helpfulCount,
  onToggleHelpful,
  onOpenPhoto,
}: {
  r: Review;
  featured: boolean;
  helpful: boolean;
  helpfulCount: number;
  onToggleHelpful: () => void;
  onOpenPhoto: (src: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const long = (r.comment?.length ?? 0) > COMMENT_CLAMP;
  const photos = (r.photos ?? []).filter(Boolean);
  return (
    <li className="rounded-2xl border border-border/60 bg-card p-4 shadow-[0_1px_12px_-6px_rgba(0,0,0,0.08)] sm:p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/70 text-xs font-semibold text-primary-foreground shadow-sm">
          {initials(r.customer_name)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-sm font-semibold text-foreground">{firstName(r.customer_name)}</span>
            {r.verified_purchase && (
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-400">
                <CheckCircle2 className="h-3 w-3" />
                Verified Purchase
              </span>
            )}
            {featured && (
              <span className="inline-flex items-center gap-1 rounded-full bg-secondary/15 px-2 py-0.5 text-[11px] font-semibold text-secondary">
                <Pin className="h-3 w-3" />
                Top review
              </span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-emerald-600 to-emerald-500 px-2 py-0.5 text-xs font-semibold text-white shadow-sm">
              {r.rating.toFixed(1)}
              <Star className="h-3 w-3 fill-white" />
            </span>
            <span className="text-xs text-muted-foreground">
              {new Date(r.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
            {r.variant_color && (
              <span className="rounded-full border border-border/60 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                {r.variant_color}
              </span>
            )}
          </div>

          {r.title && <p className="mt-3 text-sm font-semibold text-foreground">{r.title}</p>}
          {r.comment && (
            <p
              className={`mt-1.5 whitespace-pre-line break-words text-sm leading-relaxed text-foreground/80 ${
                long && !expanded ? 'line-clamp-4' : ''
              }`}
            >
              {r.comment}
            </p>
          )}
          {long && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="mt-1 text-xs font-semibold text-primary underline-offset-2 hover:underline"
            >
              {expanded ? 'Show less' : 'Read more'}
            </button>
          )}

          {photos.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {photos.map((src, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => onOpenPhoto(src)}
                  className="h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-border/60 transition-transform active:scale-95 sm:h-24 sm:w-24"
                  aria-label={`Open photo ${idx + 1} from ${firstName(r.customer_name)}`}
                >
                  <PhotoThumb
                    src={src}
                    alt={`Photo from ${firstName(r.customer_name)}'s review`}
                    className="h-full w-full object-cover"
                  />
                </button>
              ))}
            </div>
          )}

          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={onToggleHelpful}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-medium transition-all duration-200 active:scale-95 ${
                helpful
                  ? 'border-primary/40 bg-primary/10 text-primary'
                  : 'border-border/60 text-muted-foreground hover:border-primary/40 hover:text-primary'
              }`}
            >
              <ThumbsUp className={`h-3 w-3 ${helpful ? 'fill-primary' : ''}`} />
              Helpful{helpfulCount ? ` (${helpfulCount})` : ''}
            </button>
          </div>
        </div>
      </div>
    </li>
  );
}

const chipBase =
  'shrink-0 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors';
const chipOn = 'border-primary bg-primary text-primary-foreground shadow-sm';
const chipOff = 'border-border/60 bg-card text-muted-foreground hover:border-primary/40 hover:text-primary';

export default function ReviewsSection({
  productId,
  productSlug,
  selectedColor,
}: {
  productId: string;
  productSlug: string;
  /** Colour of the variant currently open on the page -- pre-highlighted
   *  (but not force-applied) in the "Filter by colour" row below, so a
   *  shopper looking at the Green variant sees Green offered first. */
  selectedColor?: string | null;
}) {
  const { user } = useAuth();
  const router = useRouter();

  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [myReview, setMyReview] = useState<Review | null>(null);
  const [eligible, setEligible] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [step, setStep] = useState<'rating' | 'details'>('rating');
  const [rating, setRating] = useState(0);
  const [title, setTitle] = useState('');
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [settings, setSettings] = useState<ReviewDisplaySettings>(DEFAULT_REVIEW_DISPLAY_SETTINGS);
  const [ratingFilter, setRatingFilter] = useState<RatingFilter>('all');
  const [sort, setSort] = useState<ReviewSort>(DEFAULT_REVIEW_DISPLAY_SETTINGS.defaultSort);
  const [visibleCount, setVisibleCount] = useState(DEFAULT_REVIEW_DISPLAY_SETTINGS.initialCount);
  const [helpfulVotes, setHelpfulVotes] = useState<Record<string, number>>({});
  const [markedHelpful, setMarkedHelpful] = useState<Record<string, boolean>>({});
  /** null = "All colours". Starts unset (showing every review) even when
   *  `selectedColor` is known -- filtering is something the shopper opts
   *  into via the chips, not something sprung on them by default. */
  const [colorFilter, setColorFilter] = useState<string | null>(null);

  const MAX_PHOTOS = 4;

  const toggleHelpful = (reviewId: string) => {
    setMarkedHelpful((prev) => {
      const next = { ...prev, [reviewId]: !prev[reviewId] };
      setHelpfulVotes((v) => ({
        ...v,
        [reviewId]: (v[reviewId] ?? 0) + (next[reviewId] ? 1 : -1),
      }));
      return next;
    });
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([fetchApprovedReviews(productId)]).then(([r]) => {
      if (!cancelled) {
        setReviews(r);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [productId]);

  useEffect(() => {
    let cancelled = false;
    fetchReviewDisplaySettings().then((s) => {
      if (cancelled) return;
      setSettings(s);
      setSort(s.defaultSort);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!user) {
      setMyReview(null);
      setEligible(false);
      return;
    }
    fetchMyReviewForProduct(productId).then(setMyReview).catch(() => {});
    hasPurchasedProduct(productId).then(setEligible).catch(() => {});
  }, [user, productId]);

  const summary = summarizeReviews(reviews);
  const colorOptions = getReviewColorOptions(reviews);
  const filteredReviews = filterReviewsByColor(reviews, colorFilter);

  const featuredSet = useMemo(() => new Set(settings.featuredReviewIds), [settings.featuredReviewIds]);

  // Every customer photo (pinned reviews first, then newest) -- feeds the
  // strip at the top and the full-screen viewer.
  const allPhotos = useMemo<PhotoItem[]>(() => {
    const ordered = [...reviews].sort((a, b) => Number(featuredSet.has(b.id)) - Number(featuredSet.has(a.id)));
    const out: PhotoItem[] = [];
    for (const r of ordered) {
      for (const src of r.photos ?? []) {
        if (src) out.push({ src, reviewId: r.id, name: firstName(r.customer_name), rating: r.rating, comment: r.comment });
      }
    }
    return out;
  }, [reviews, featuredSet]);

  const matchesRating = (r: Review) =>
    ratingFilter === 'all'
      ? true
      : ratingFilter === 'photos'
      ? (r.photos?.length ?? 0) > 0
      : ratingFilter === '5'
      ? r.rating === 5
      : ratingFilter === '4'
      ? r.rating === 4
      : r.rating <= 3;

  const chipCounts = {
    all: filteredReviews.length,
    photos: filteredReviews.filter((r) => (r.photos?.length ?? 0) > 0).length,
    '5': filteredReviews.filter((r) => r.rating === 5).length,
    '4': filteredReviews.filter((r) => r.rating === 4).length,
    low: filteredReviews.filter((r) => r.rating <= 3).length,
  };

  const sortedReviews = useMemo(() => {
    const list = filteredReviews.filter(matchesRating);
    const time = (r: Review) => new Date(r.created_at).getTime();
    const hasPhoto = (r: Review) => ((r.photos?.length ?? 0) > 0 ? 1 : 0);
    return list.sort((a, b) => {
      const pin = Number(featuredSet.has(b.id)) - Number(featuredSet.has(a.id));
      if (pin !== 0) return pin;
      if (sort === 'highest') return b.rating - a.rating || time(b) - time(a);
      if (sort === 'lowest') return a.rating - b.rating || time(b) - time(a);
      if (sort === 'photos') return hasPhoto(b) - hasPhoto(a) || time(b) - time(a);
      return time(b) - time(a);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredReviews, ratingFilter, sort, featuredSet]);

  // Back to the first page whenever the shopper changes what they are looking at.
  useEffect(() => {
    setVisibleCount(settings.initialCount);
  }, [ratingFilter, colorFilter, sort, settings.initialCount, productId]);

  const visibleReviews = sortedReviews.slice(0, visibleCount);
  const remaining = Math.max(0, sortedReviews.length - visibleReviews.length);

  const openPhoto = (reviewId: string, src: string) => {
    const idx = allPhotos.findIndex((p) => p.reviewId === reviewId && p.src === src);
    setLightboxIndex(idx >= 0 ? idx : 0);
  };
  const galleryItems = allPhotos.slice(0, settings.photoGalleryMax);
  const galleryExtra = Math.max(0, allPhotos.length - galleryItems.length);

  const onPickPhotos = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (picked.length === 0) return;
    setPhotoFiles((prev) => {
      const combined = [...prev, ...picked].slice(0, MAX_PHOTOS);
      if (prev.length + picked.length > MAX_PHOTOS) {
        toast.info(`You can attach up to ${MAX_PHOTOS} photos`);
      }
      return combined;
    });
  };

  useEffect(() => {
    const urls = photoFiles.map((f) => URL.createObjectURL(f));
    setPhotoPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [photoFiles]);

  const removePhoto = (idx: number) => {
    setPhotoFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmitRating = async () => {
    if (rating === 0) {
      toast.error('Please select a star rating');
      return;
    }
    setSubmitting(true);
    try {
      const review = await submitReview({ productId, rating, color: selectedColor || undefined });
      setMyReview(review);
      setStep('details');
      scheduleAutoPublish(review.id, () => {
        setMyReview((prev) => (prev && prev.id === review.id ? { ...prev, is_approved: true } : prev));
        fetchApprovedReviews(productId).then(setReviews).catch(() => {});
      });
      toast.success('Thanks for rating! Add a written review below, or come back anytime.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not submit rating');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitDetails = async () => {
    if (!myReview) return;
    setSubmitting(true);
    try {
      let photos: string[] = [];
      if (photoFiles.length > 0) {
        photos = await Promise.all(photoFiles.map(uploadReviewPhoto));
      }
      const updated = await updateMyReview(myReview.id, { title, comment, photos });
      setMyReview(updated);
      scheduleAutoPublish(updated.id, () => {
        setMyReview((prev) => (prev && prev.id === updated.id ? { ...prev, is_approved: true } : prev));
        fetchApprovedReviews(productId).then(setReviews).catch(() => {});
      });
      setFormOpen(false);
      setTitle('');
      setComment('');
      setPhotoFiles([]);
      toast.success('Thanks! Your review will go live within a few seconds.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not submit review');
    } finally {
      setSubmitting(false);
    }
  };

  const openForm = () => {
    if (!user) {
      toast.info('Login to write a review');
      router.push(`/login?next=/product/${productSlug}`);
      return;
    }
    if (myReview && !hasWrittenContent(myReview)) {
      // Already rated -- go straight to the "add details" step.
      setRating(myReview.rating);
      setStep('details');
    } else {
      setStep('rating');
      setRating(0);
    }
    setFormOpen(true);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[320px_1fr] lg:gap-8">
      <div className="relative flex flex-col gap-5 overflow-hidden rounded-3xl border border-secondary/25 bg-gradient-to-b from-secondary/[0.06] via-card to-card p-5 shadow-[0_2px_24px_-8px_rgba(0,0,0,0.08)]">
        <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-secondary/10 blur-2xl" />

        <div className="relative flex items-end gap-3">
          <p className="font-serif text-5xl font-bold leading-none text-primary">
            {summary.totalRatings > 0 ? summary.average.toFixed(1) : '—'}
          </p>
          <div className="flex flex-col gap-1 pb-0.5">
            <StarRow value={summary.totalRatings > 0 ? summary.average : 0} size="h-4 w-4" />
            <p className="text-xs font-medium tracking-wide text-muted-foreground">
              {summary.totalRatings.toLocaleString('en-IN')} Rating{summary.totalRatings === 1 ? '' : 's'} ·{' '}
              {summary.totalReviews.toLocaleString('en-IN')} Review{summary.totalReviews === 1 ? '' : 's'}
            </p>
          </div>
        </div>

        <div className="h-px w-full bg-gradient-to-r from-secondary/40 via-secondary/10 to-transparent" />

        <div className="flex flex-col gap-2.5">
          {([5, 4, 3, 2, 1] as const).map((star) => {
            const count = summary.breakdown[star];
            const pct = summary.totalRatings > 0 ? (count / summary.totalRatings) * 100 : 0;
            return (
              <div key={star} className="flex items-center gap-2.5 text-xs">
                <span className="w-[4.5rem] shrink-0 font-medium text-muted-foreground">{RATING_LABELS[star]}</span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted/80">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-secondary to-primary transition-all duration-700 ease-out"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="w-6 text-right font-medium text-muted-foreground">{count}</span>
              </div>
            );
          })}
        </div>

        <div className="h-px w-full bg-gradient-to-r from-secondary/40 via-secondary/10 to-transparent" />

        {myReview && hasWrittenContent(myReview) ? (
          <div className="flex items-center gap-2 rounded-lg border border-emerald-200/60 bg-emerald-50/60 p-3 text-xs font-medium text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            {myReview.is_approved
              ? 'You reviewed this product.'
              : 'Your review is awaiting approval.'}
          </div>
        ) : myReview ? (
          <div className="flex flex-col gap-2.5 rounded-lg border border-secondary/30 bg-secondary/[0.07] p-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-secondary" />
              You rated this {myReview.rating}★
              {myReview.is_approved ? '' : ' (awaiting approval)'}
            </div>
            <Button
              size="sm"
              onClick={openForm}
              className="w-fit bg-gradient-to-r from-primary to-primary/90 text-primary-foreground shadow-sm transition-transform hover:scale-[1.02] hover:shadow-md"
            >
              Add a written review
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            <Button
              onClick={openForm}
              className="w-full bg-gradient-to-r from-primary via-primary to-primary/90 text-primary-foreground shadow-sm transition-transform hover:scale-[1.02] hover:shadow-md"
            >
              <Star className="mr-1.5 h-4 w-4 fill-secondary text-secondary" />
              Rate this product
            </Button>
            {!loading && reviews.length === 0 && (
              <Button
                onClick={openForm}
                className="w-full bg-gradient-to-r from-primary via-primary to-primary/90 text-primary-foreground shadow-sm transition-transform hover:scale-[1.02] hover:shadow-md"
              >
                <Star className="mr-1.5 h-4 w-4 fill-secondary text-secondary" />
                Write the first review
              </Button>
            )}
          </div>
        )}

        {user && !myReview && !eligible && (
          <p className="text-xs leading-relaxed text-muted-foreground">
            Only customers who have purchased this product can leave a review.
          </p>
        )}
      </div>


      <div className="flex min-w-0 flex-col gap-5">
        {settings.showPhotoGallery && allPhotos.length > 0 && (
          <section className="rounded-3xl border border-border/60 bg-card p-4 shadow-[0_2px_24px_-12px_rgba(0,0,0,0.1)] sm:p-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Camera className="h-4 w-4 text-secondary" />
                Photos from customers
                <span className="rounded-full bg-secondary/15 px-2 py-0.5 text-[11px] font-semibold text-secondary">
                  {allPhotos.length}
                </span>
              </h3>
              {chipCounts.photos > 0 && settings.showFilters && (
                <button
                  type="button"
                  onClick={() => setRatingFilter('photos')}
                  className="text-xs font-semibold text-primary underline-offset-2 hover:underline"
                >
                  See reviews with photos
                </button>
              )}
            </div>
            <div className="-mx-4 flex snap-x snap-mandatory gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {galleryItems.map((p, i) => {
                const isLast = i === galleryItems.length - 1 && galleryExtra > 0;
                return (
                  <button
                    key={`${p.reviewId}-${i}`}
                    type="button"
                    onClick={() => setLightboxIndex(i)}
                    aria-label={isLast ? `See ${galleryExtra} more photos` : `Open customer photo ${i + 1}`}
                    className="relative h-24 w-24 shrink-0 snap-start overflow-hidden rounded-2xl border border-border/60 transition-transform active:scale-95 sm:h-28 sm:w-28"
                  >
                    <PhotoThumb src={p.src} alt={`Customer photo ${i + 1}`} className="h-full w-full object-cover" />
                    {isLast && (
                      <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-base font-semibold text-white">
                        +{galleryExtra + 1}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {formOpen && (
          <div className="rounded-lg border border-border/60 bg-card p-5">
            {step === 'rating' ? (
              <>
                <p className="mb-2 text-sm font-semibold">Rate this product</p>
                <p className="mb-3 text-xs text-muted-foreground">
                  Just tap a star to submit your rating. You can add a written review after, if you&apos;d like.
                </p>
                <StarPicker value={rating} onChange={setRating} />
                <div className="mt-4 flex gap-2">
                  <Button onClick={handleSubmitRating} disabled={submitting} className="bg-primary">
                    {submitting ? (
                      <>
                        <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                        Submitting...
                      </>
                    ) : (
                      'Submit Rating'
                    )}
                  </Button>
                  <Button variant="ghost" onClick={() => setFormOpen(false)}>
                    Cancel
                  </Button>
                </div>
              </>
            ) : (
              <>
                <p className="mb-1 text-sm font-semibold">Write a review</p>
                <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
                  <StarRow value={myReview?.rating ?? rating} size="h-3.5 w-3.5" />
                  Your rating &mdash; already saved
                </div>
                <Input
                  placeholder="Review title (optional)"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={100}
                />
                <Textarea
                  className="mt-3"
                  placeholder="Share details about the fit, fabric, and quality..."
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  rows={4}
                  maxLength={1000}
                />

                <div className="mt-3">
                  <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                    Add photos (optional) — {photoFiles.length}/{MAX_PHOTOS}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {photoPreviews.map((src, idx) => (
                      <div
                        key={idx}
                        className="relative h-16 w-16 overflow-hidden rounded-md border border-border/60"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={src} alt={`Attached photo ${idx + 1}`} className="h-full w-full object-cover" />
                        <button
                          type="button"
                          onClick={() => removePhoto(idx)}
                          className="absolute right-0.5 top-0.5 rounded-full bg-background/90 p-0.5 text-destructive shadow-sm hover:bg-background"
                          aria-label="Remove photo"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                    {photoFiles.length < MAX_PHOTOS && (
                      <label className="flex h-16 w-16 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border text-muted-foreground hover:border-primary/40 hover:text-primary">
                        <ImagePlus className="h-5 w-5" />
                        <span className="text-[10px]">Add</span>
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          className="hidden"
                          onChange={onPickPhotos}
                        />
                      </label>
                    )}
                  </div>
                </div>

                <div className="mt-3 flex gap-2">
                  <Button onClick={handleSubmitDetails} disabled={submitting} className="bg-primary">
                    {submitting ? (
                      <>
                        <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                        Submitting...
                      </>
                    ) : (
                      'Submit Review'
                    )}
                  </Button>
                  <Button variant="ghost" onClick={() => setFormOpen(false)}>
                    Maybe later
                  </Button>
                </div>
              </>
            )}
          </div>
        )}


        {settings.showFilters && reviews.length > 0 && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <SlidersHorizontal className="h-3.5 w-3.5" />
                Filter
              </p>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                Sort
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as ReviewSort)}
                  className="rounded-full border border-border/60 bg-card px-3 py-1.5 text-xs font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  <option value="newest">Most recent</option>
                  <option value="photos">Photos first</option>
                  <option value="highest">Highest rating</option>
                  <option value="lowest">Lowest rating</option>
                </select>
              </label>
            </div>

            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {([
                ['all', 'All'],
                ['photos', 'With photos'],
                ['5', '5 ★'],
                ['4', '4 ★'],
                ['low', '3 ★ & below'],
              ] as [RatingFilter, string][]).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setRatingFilter(key)}
                  className={`${chipBase} ${ratingFilter === key ? chipOn : chipOff}`}
                >
                  {label} ({chipCounts[key]})
                </button>
              ))}
            </div>

            {settings.showColorFilter && colorOptions.length > 1 && (
              <div className="flex flex-col gap-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Variation</p>
                <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  <button
                    type="button"
                    onClick={() => setColorFilter(null)}
                    className={`${chipBase} ${colorFilter === null ? chipOn : chipOff}`}
                  >
                    All variations ({reviews.length})
                  </button>
                  {colorOptions.map((color) => {
                    const count = reviews.filter((r) => r.variant_color?.trim().toLowerCase() === color.toLowerCase()).length;
                    const active = colorFilter?.toLowerCase() === color.toLowerCase();
                    return (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setColorFilter(color)}
                        className={`${chipBase} ${
                          active
                            ? chipOn
                            : color.toLowerCase() === selectedColor?.toLowerCase()
                            ? 'border-secondary/60 bg-card text-secondary'
                            : chipOff
                        }`}
                      >
                        {color} ({count})
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {loading ? (
          <div className="flex flex-col gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-28 w-full rounded-2xl" />
            ))}
          </div>
        ) : sortedReviews.length === 0 ? (
          reviews.length > 0 ? (
            <div className="rounded-2xl border border-dashed border-border/60 bg-card p-8 text-center text-sm text-muted-foreground">
              No reviews match these filters.{' '}
              <button
                type="button"
                onClick={() => {
                  setRatingFilter('all');
                  setColorFilter(null);
                }}
                className="font-semibold text-primary underline underline-offset-2"
              >
                Clear filters
              </button>
            </div>
          ) : null
        ) : (
          <>
            <ul className="flex flex-col gap-3 sm:gap-4">
              {visibleReviews.map((r) => (
                <ReviewCard
                  key={r.id}
                  r={r}
                  featured={featuredSet.has(r.id)}
                  helpful={!!markedHelpful[r.id]}
                  helpfulCount={helpfulVotes[r.id] ?? 0}
                  onToggleHelpful={() => toggleHelpful(r.id)}
                  onOpenPhoto={(src) => openPhoto(r.id, src)}
                />
              ))}
            </ul>

            <div className="flex flex-col items-center gap-2 pt-1">
              <p className="text-xs text-muted-foreground">
                Showing {visibleReviews.length} of {sortedReviews.length} review{sortedReviews.length === 1 ? '' : 's'}
              </p>
              {remaining > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setVisibleCount((c) => c + settings.loadMoreCount)}
                  className="w-full rounded-full border-primary/40 px-8 font-semibold text-primary hover:bg-primary/5 sm:w-auto"
                >
                  Load more reviews ({remaining} more)
                </Button>
              )}
            </div>
          </>
        )}
      </div>

      {lightboxIndex !== null && allPhotos.length > 0 && (
        <PhotoLightbox
          items={allPhotos}
          index={Math.min(lightboxIndex, allPhotos.length - 1)}
          onIndex={setLightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </div>
  );
}
