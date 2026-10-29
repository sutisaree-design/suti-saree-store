'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAdminFocus } from './use-admin-focus';
import Link from 'next/link';
import { Check, EyeOff, Trash2, Star, Search, X, Pin, PinOff, Settings2, Loader2 } from 'lucide-react';
import {
  fetchAllReviewsAdmin,
  approveReviewAdmin,
  rejectReviewAdmin,
  deleteReviewAdmin,
  fetchReviewDisplaySettingsAdmin,
  saveReviewDisplaySettingsAdmin,
  hasWrittenContent,
  AdminReview,
} from '@/lib/reviews-api';
import {
  DEFAULT_REVIEW_DISPLAY_SETTINGS,
  mergeReviewDisplaySettings,
  type ReviewDisplaySettings,
  type ReviewSort,
} from '@/lib/review-display-settings';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';

type StatusFilter = 'all' | 'pending' | 'approved';
type Section = 'reviews' | 'ratings';

export default function ReviewsPanel() {
  const [reviews, setReviews] = useState<AdminReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [section, setSection] = useState<Section>('reviews');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [confirmTarget, setConfirmTarget] = useState<AdminReview | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  // Storefront display settings (how the product-page Reviews section looks).
  const [displaySettings, setDisplaySettings] = useState<ReviewDisplaySettings>(DEFAULT_REVIEW_DISPLAY_SETTINGS);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  // The list can hold hundreds of reviews -- render it in pages.
  const PAGE = 40;
  const [listLimit, setListLimit] = useState(PAGE);

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetchAllReviewsAdmin();
      setReviews(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load reviews');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    fetchReviewDisplaySettingsAdmin()
      .then(setDisplaySettings)
      .catch(() => {
        /* keep defaults; saving will create the setting */
      });
  }, []);

  useEffect(() => {
    setListLimit(PAGE);
  }, [section, statusFilter, search]);

  const saveSettings = async (next: ReviewDisplaySettings, okMessage = 'Display settings saved') => {
    setSavingSettings(true);
    try {
      const saved = await saveReviewDisplaySettingsAdmin(mergeReviewDisplaySettings(next));
      setDisplaySettings(saved);
      toast.success(okMessage);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save settings');
    } finally {
      setSavingSettings(false);
    }
  };

  const togglePin = async (r: AdminReview) => {
    const pinned = displaySettings.featuredReviewIds.includes(r.id);
    const ids = pinned
      ? displaySettings.featuredReviewIds.filter((id) => id !== r.id)
      : [r.id, ...displaySettings.featuredReviewIds];
    await saveSettings(
      { ...displaySettings, featuredReviewIds: ids },
      pinned ? 'Unpinned' : 'Pinned to the top of the product page'
    );
  };

  // Bell deep link: switch to the right tab (written review vs star-only
  // rating), clear filters so it's visible, then highlight it.
  const focusId = useAdminFocus(!loading && reviews.length > 0);
  useEffect(() => {
    if (!focusId) return;
    const target = reviews.find((x) => x.id === focusId);
    if (!target) return;
    setSection(hasWrittenContent(target) ? 'reviews' : 'ratings');
    setStatusFilter('all');
    setSearch('');
  }, [focusId, reviews]);

  // Reviews = wrote a title/comment. Ratings = star only, no text.
  const writtenReviews = useMemo(() => reviews.filter(hasWrittenContent), [reviews]);
  const ratingsOnly = useMemo(() => reviews.filter((r) => !hasWrittenContent(r)), [reviews]);

  const applyFilters = (list: AdminReview[]) => {
    let out = list;
    if (statusFilter === 'pending') out = out.filter((r) => !r.is_approved);
    if (statusFilter === 'approved') out = out.filter((r) => r.is_approved);
    const q = search.trim().toLowerCase();
    if (q) {
      out = out.filter((r) =>
        [r.customer_name, r.product_name, r.title, r.comment]
          .filter(Boolean)
          .some((field) => field!.toLowerCase().includes(q))
      );
    }
    return out;
  };

  const sectionSource = section === 'reviews' ? writtenReviews : ratingsOnly;
  const filtered = useMemo(
    () => applyFilters(sectionSource),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sectionSource, statusFilter, search]
  );

  const pendingCount = (section === 'reviews' ? writtenReviews : ratingsOnly).filter(
    (r) => !r.is_approved
  ).length;

  const handleApprove = async (r: AdminReview) => {
    setBusyId(r.id);
    try {
      await approveReviewAdmin(r.id);
      toast.success('Published — now live on the product page');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to approve');
    } finally {
      setBusyId(null);
    }
  };

  const handleHide = async (r: AdminReview) => {
    setBusyId(r.id);
    try {
      await rejectReviewAdmin(r.id);
      toast.success('Hidden from the storefront');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update');
    } finally {
      setBusyId(null);
    }
  };

  const confirmDelete = async () => {
    if (!confirmTarget) return;
    setBusyId(confirmTarget.id);
    try {
      await deleteReviewAdmin(confirmTarget.id);
      toast.success('Deleted');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setBusyId(null);
      setConfirmTarget(null);
    }
  };

  const renderList = (list: AdminReview[], emptyLabel: string) => {
    if (loading) {
      return (
        <div className="grid gap-3">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-lg" />
          ))}
        </div>
      );
    }
    if (list.length === 0) {
      return (
        <div className="rounded-lg border border-dashed border-border/60 bg-card p-8 text-center text-sm text-muted-foreground">
          {emptyLabel}
        </div>
      );
    }
    return (
      <div className="grid gap-3">
        {list.slice(0, listLimit).map((r) => (
          <div key={r.id} data-focus-id={r.id} className="rounded-lg border border-border/60 bg-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold">{r.customer_name}</p>
                  <div className="flex items-center gap-0.5 text-amber-500">
                    {[...Array(5)].map((_, i) => (
                      <Star
                        key={i}
                        className={`h-3.5 w-3.5 ${i < r.rating ? 'fill-current' : ''}`}
                      />
                    ))}
                  </div>
                  <Badge variant={r.is_approved ? 'default' : 'outline'} className="text-xs">
                    {r.is_approved ? 'Published' : 'Pending'}
                  </Badge>
                  {displaySettings.featuredReviewIds.includes(r.id) && (
                    <Badge variant="secondary" className="gap-1 text-xs">
                      <Pin className="h-3 w-3" /> Pinned
                    </Badge>
                  )}
                </div>
                {r.product_slug ? (
                  <Link
                    href={`/product/${r.product_slug}`}
                    target="_blank"
                    className="text-xs text-secondary hover:underline"
                  >
                    {r.product_name}
                  </Link>
                ) : (
                  <p className="text-xs text-muted-foreground">{r.product_name}</p>
                )}
                {r.title && <p className="mt-2 text-sm font-medium">{r.title}</p>}
                {r.comment && <p className="mt-1 text-sm text-muted-foreground">{r.comment}</p>}
                {r.photos && r.photos.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {r.photos.map((url, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setLightboxUrl(url)}
                        className="overflow-hidden rounded-md border border-border/60 transition-transform hover:scale-105"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={url}
                          alt={`${r.customer_name} review photo ${idx + 1}`}
                          className="h-14 w-14 object-cover"
                        />
                      </button>
                    ))}
                  </div>
                )}
                <p className="mt-2 text-xs text-muted-foreground">
                  {new Date(r.created_at).toLocaleString()}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                {!r.is_approved ? (
                  <Button
                    size="sm"
                    onClick={() => handleApprove(r)}
                    disabled={busyId === r.id}
                    className="bg-primary"
                  >
                    <Check className="mr-1 h-3.5 w-3.5" /> Publish
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleHide(r)}
                    disabled={busyId === r.id}
                  >
                    <EyeOff className="mr-1 h-3.5 w-3.5" /> Hide
                  </Button>
                )}
                {r.is_approved && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => togglePin(r)}
                    disabled={savingSettings}
                    title={
                      displaySettings.featuredReviewIds.includes(r.id)
                        ? 'Unpin from the top of the product page'
                        : 'Pin to the top of the product page'
                    }
                  >
                    {displaySettings.featuredReviewIds.includes(r.id) ? (
                      <PinOff className="h-3.5 w-3.5" />
                    ) : (
                      <Pin className="h-3.5 w-3.5" />
                    )}
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className="text-destructive hover:bg-destructive/10"
                  onClick={() => setConfirmTarget(r)}
                  disabled={busyId === r.id}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>
        ))}
        {list.length > listLimit && (
          <div className="flex flex-col items-center gap-2 pt-1">
            <p className="text-xs text-muted-foreground">
              Showing {listLimit} of {list.length}
            </p>
            <Button variant="outline" onClick={() => setListLimit((n) => n + PAGE)}>
              Show {Math.min(PAGE, list.length - listLimit)} more
            </Button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-secondary">Admin</p>
          <h1 className="mt-1 font-serif text-3xl font-bold text-primary sm:text-4xl">
            Review Moderation
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {loading
              ? 'Loading…'
              : `${pendingCount} pending · ${sectionSource.length} in this section · ${reviews.length} total`}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            New ratings/reviews publish automatically 5 seconds after submission — use Hide to
            take one down.
          </p>
        </div>
      </div>

      <div className="mb-6 rounded-lg border border-border/60 bg-card">
        <button
          type="button"
          onClick={() => setSettingsOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-3 p-4 text-left"
        >
          <span className="flex items-center gap-2 text-sm font-semibold">
            <Settings2 className="h-4 w-4 text-secondary" />
            Product page display settings
          </span>
          <span className="text-xs text-muted-foreground">
            {displaySettings.initialCount} shown first · +{displaySettings.loadMoreCount} per &ldquo;Load more&rdquo; ·{' '}
            {displaySettings.featuredReviewIds.length} pinned
          </span>
        </button>
        {settingsOpen && (
          <div className="grid gap-4 border-t border-border/60 p-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="grid gap-1 text-xs font-medium text-muted-foreground">
                Reviews shown first
                <Input
                  type="number"
                  min={1}
                  max={50}
                  value={displaySettings.initialCount}
                  onChange={(e) => setDisplaySettings((d) => ({ ...d, initialCount: Number(e.target.value) || 1 }))}
                />
              </label>
              <label className="grid gap-1 text-xs font-medium text-muted-foreground">
                Added on each &ldquo;Load more&rdquo;
                <Input
                  type="number"
                  min={1}
                  max={50}
                  value={displaySettings.loadMoreCount}
                  onChange={(e) => setDisplaySettings((d) => ({ ...d, loadMoreCount: Number(e.target.value) || 1 }))}
                />
              </label>
              <label className="grid gap-1 text-xs font-medium text-muted-foreground">
                Photos in the top strip
                <Input
                  type="number"
                  min={4}
                  max={60}
                  value={displaySettings.photoGalleryMax}
                  onChange={(e) => setDisplaySettings((d) => ({ ...d, photoGalleryMax: Number(e.target.value) || 4 }))}
                />
              </label>
            </div>

            <div className="grid gap-2 sm:grid-cols-3">
              {([
                ['showPhotoGallery', 'Show "Photos from customers" strip'],
                ['showFilters', 'Show filters and sort menu'],
                ['showColorFilter', 'Show variation (colour) filter'],
              ] as [keyof ReviewDisplaySettings, string][]).map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-primary"
                    checked={Boolean(displaySettings[key])}
                    onChange={(e) => setDisplaySettings((d) => ({ ...d, [key]: e.target.checked }))}
                  />
                  {label}
                </label>
              ))}
            </div>

            <label className="grid max-w-xs gap-1 text-xs font-medium text-muted-foreground">
              Default sort (pinned reviews always stay first)
              <Select
                value={displaySettings.defaultSort}
                onValueChange={(v) => setDisplaySettings((d) => ({ ...d, defaultSort: v as ReviewSort }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">Most recent</SelectItem>
                  <SelectItem value="photos">Photos first</SelectItem>
                  <SelectItem value="highest">Highest rating</SelectItem>
                  <SelectItem value="lowest">Lowest rating</SelectItem>
                </SelectContent>
              </Select>
            </label>

            <p className="text-xs text-muted-foreground">
              Pin a review with the pin button on any published review below; pinned reviews show first
              on the product page and their photos lead the photo strip. Changes show up on the next page load
              of the product page.
            </p>

            <div>
              <Button onClick={() => saveSettings(displaySettings)} disabled={savingSettings} className="bg-primary">
                {savingSettings ? (
                  <>
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Saving...
                  </>
                ) : (
                  'Save display settings'
                )}
              </Button>
            </div>
          </div>
        )}
      </div>

      <Tabs value={section} onValueChange={(v) => setSection(v as Section)}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <TabsList>
            <TabsTrigger value="reviews">
              Reviews
              <Badge variant="secondary" className="ml-2">
                {writtenReviews.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="ratings">
              Ratings
              <Badge variant="secondary" className="ml-2">
                {ratingsOnly.length}
              </Badge>
            </TabsTrigger>
          </TabsList>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search customer, product, text..."
                className="w-64 pl-8"
              />
            </div>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="approved">Published</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <TabsContent value="reviews">
          {renderList(
            filtered,
            search
              ? 'No written reviews match your search.'
              : 'No written reviews here yet.'
          )}
        </TabsContent>
        <TabsContent value="ratings">
          {renderList(
            filtered,
            search ? 'No ratings match your search.' : 'No star-only ratings here yet.'
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={!!confirmTarget} onOpenChange={(o) => !o && setConfirmTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl text-primary">Delete this entry?</DialogTitle>
            <DialogDescription>This action cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 flex animate-in fade-in items-center justify-center bg-black/90 p-4 duration-200"
          onClick={() => setLightboxUrl(null)}
        >
          <button
            type="button"
            aria-label="Close photo"
            onClick={() => setLightboxUrl(null)}
            className="absolute right-4 top-4 rounded-full bg-background/20 p-2 text-white hover:bg-background/30"
          >
            <X className="h-5 w-5" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightboxUrl}
            alt="Review photo enlarged"
            className="max-h-[85vh] max-w-full animate-in zoom-in-95 rounded-lg object-contain duration-200"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
