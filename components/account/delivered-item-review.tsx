'use client';

import { useEffect, useState } from 'react';
import { Star, Loader2, CheckCircle2, ImagePlus, X } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import {
  Review,
  fetchMyReviewForProduct,
  hasWrittenContent,
  scheduleAutoPublish,
  submitReview,
  updateMyReview,
  uploadReviewPhoto,
} from '@/lib/reviews-api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

const MAX_PHOTOS = 4;

function MiniStarPicker({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (n: number) => void;
  disabled?: boolean;
}) {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => {
        const n = i + 1;
        return (
          <button
            key={n}
            type="button"
            disabled={disabled}
            onClick={() => onChange(n)}
            onMouseEnter={() => setHover(n)}
            onMouseLeave={() => setHover(0)}
            aria-label={`Rate ${n} stars`}
            className="disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Star
              className={`h-5 w-5 transition-colors ${
                n <= (hover || value) ? 'fill-secondary text-secondary' : 'text-muted-foreground/30'
              }`}
            />
          </button>
        );
      })}
    </div>
  );
}

/**
 * Inline "rate first, write a review later" prompt shown against a
 * delivered order item. Step 1 -- tap a star and it submits immediately as
 * a rating-only review. Step 2 -- once rated, an optional "Add a written
 * review" expander appears to attach a title/comment/photos to that same
 * review. Renders nothing for guests or while the initial check is loading.
 */
export default function DeliveredItemReview({
  productId,
  productName,
}: {
  productId: string;
  productName: string;
}) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [myReview, setMyReview] = useState<Review | null>(null);
  const [ratingSubmitting, setRatingSubmitting] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [comment, setComment] = useState('');
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
  const [savingDetails, setSavingDetails] = useState(false);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    fetchMyReviewForProduct(productId)
      .then((r) => {
        if (!cancelled) setMyReview(r);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user, productId]);

  useEffect(() => {
    const urls = photoFiles.map((f) => URL.createObjectURL(f));
    setPhotoPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [photoFiles]);

  const handleRate = async (n: number) => {
    setRatingSubmitting(true);
    try {
      const review = await submitReview({ productId, rating: n });
      setMyReview(review);
      scheduleAutoPublish(review.id, () => {
        setMyReview((prev) => (prev && prev.id === review.id ? { ...prev, is_approved: true } : prev));
      });
    } catch {
      // Quiet failure (e.g. not yet eligible) -- the widget just won't
      // update; this inline prompt isn't the place for a toast per star tap.
    } finally {
      setRatingSubmitting(false);
    }
  };

  const onPickPhotos = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (picked.length === 0) return;
    setPhotoFiles((prev) => [...prev, ...picked].slice(0, MAX_PHOTOS));
  };

  const removePhoto = (idx: number) => {
    setPhotoFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSaveDetails = async () => {
    if (!myReview) return;
    setSavingDetails(true);
    try {
      let photos: string[] = [];
      if (photoFiles.length > 0) {
        photos = await Promise.all(photoFiles.map(uploadReviewPhoto));
      }
      const updated = await updateMyReview(myReview.id, { title, comment, photos });
      setMyReview(updated);
      scheduleAutoPublish(updated.id, () => {
        setMyReview((prev) => (prev && prev.id === updated.id ? { ...prev, is_approved: true } : prev));
      });
      setDetailsOpen(false);
      setTitle('');
      setComment('');
      setPhotoFiles([]);
    } finally {
      setSavingDetails(false);
    }
  };

  if (!user || loading) return null;

  return (
    <div className="mt-2 rounded-md border border-border/60 bg-muted/20 p-3">
      {!myReview ? (
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium text-muted-foreground">Rate this product:</span>
          <MiniStarPicker value={0} onChange={handleRate} disabled={ratingSubmitting} />
          {ratingSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
        </div>
      ) : !hasWrittenContent(myReview) ? (
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-secondary" />
              You rated this {myReview.rating}★
            </div>
            {!detailsOpen && (
              <Button size="sm" variant="outline" onClick={() => setDetailsOpen(true)}>
                Add a written review
              </Button>
            )}
          </div>
          {detailsOpen && (
            <div className="mt-3 space-y-2">
              <Input
                placeholder="Review title (optional)"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={100}
              />
              <Textarea
                placeholder={`Share details about ${productName}'s fit, fabric, and quality...`}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
                maxLength={1000}
              />
              <div className="flex flex-wrap gap-2">
                {photoPreviews.map((src, idx) => (
                  <div
                    key={idx}
                    className="relative h-14 w-14 overflow-hidden rounded-md border border-border/60"
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
                  <label className="flex h-14 w-14 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border text-muted-foreground hover:border-primary/40 hover:text-primary">
                    <ImagePlus className="h-4 w-4" />
                    <input type="file" accept="image/*" multiple className="hidden" onChange={onPickPhotos} />
                  </label>
                )}
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={handleSaveDetails} disabled={savingDetails} className="bg-primary">
                  {savingDetails ? (
                    <>
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    'Submit Review'
                  )}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setDetailsOpen(false)}>
                  Maybe later
                </Button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-secondary" />
          {myReview.is_approved ? 'You reviewed this product.' : 'Your review is awaiting approval.'}
        </div>
      )}
    </div>
  );
}
