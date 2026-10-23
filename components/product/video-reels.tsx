'use client';

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Heart, Share2, Volume2, VolumeX, X, Truck, ChevronRight } from 'lucide-react';
import { hasLikedReel, toggleLikedReel } from '@/lib/video-reels-likes';
import { guessVideoMime } from '@/lib/video-mime';
import { fetchVariantsForProduct, ProductVariant } from '@/lib/variants-api';
import { getRecentlyViewed } from '@/lib/recently-viewed';

/** Fisher–Yates shuffle — never mutates the input array. */
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Decides the play order for every slide AFTER the one the shopper opened
 * on. Three rules, in priority order:
 *
 *  1. The category the shopper is currently watching plays out fully
 *     (in random order) before any other category is shown.
 *  2. Within any category block, products the shopper already visited on
 *     this browser (see lib/recently-viewed.ts) come first, most-recently
 *     visited first — the rest of that category is shuffled behind them.
 *  3. Once the current category is exhausted, the next category chosen is
 *     whichever one contains the shopper's most-recently-visited product;
 *     categories with no recently-viewed products are shuffled in after,
 *     in random order. This repeats category by category.
 *
 * `recentProductIds` is most-recent-first (see getRecentlyViewed). Items
 * are matched on productId so every colour variant of an already-viewed
 * product is treated as "recently viewed" too.
 */
function buildFeedOrder(
  rest: ReelItem[],
  currentCategory: string | null | undefined,
  recentProductIds: string[]
): ReelItem[] {
  const recentRank = new Map(recentProductIds.map((id, idx) => [id, idx]));
  const UNCATEGORIZED = '__uncategorized__';

  const byCategory = new Map<string, ReelItem[]>();
  for (const item of rest) {
    const key = item.category ?? UNCATEGORIZED;
    const list = byCategory.get(key);
    if (list) list.push(item);
    else byCategory.set(key, [item]);
  }

  // Recently-viewed items in this category first (most-recent-first),
  // everything else in the category shuffled behind them.
  const orderCategoryBlock = (list: ReelItem[]): ReelItem[] => {
    const recent = list
      .filter((i) => recentRank.has(i.productId))
      .sort((a, b) => recentRank.get(a.productId)! - recentRank.get(b.productId)!);
    const others = shuffle(list.filter((i) => !recentRank.has(i.productId)));
    return [...recent, ...others];
  };

  const currentKey = currentCategory ?? UNCATEGORIZED;
  const currentBlock = byCategory.has(currentKey) ? orderCategoryBlock(byCategory.get(currentKey)!) : [];
  byCategory.delete(currentKey);

  const bestRecentRankFor = (key: string): number => {
    let best = Infinity;
    for (const item of byCategory.get(key)!) {
      const r = recentRank.get(item.productId);
      if (r !== undefined && r < best) best = r;
    }
    return best;
  };

  const remainingKeys = Array.from(byCategory.keys());
  const withRecent = remainingKeys
    .filter((k) => bestRecentRankFor(k) !== Infinity)
    .sort((a, b) => bestRecentRankFor(a) - bestRecentRankFor(b));
  const withoutRecent = shuffle(remainingKeys.filter((k) => bestRecentRankFor(k) === Infinity));

  const remainingBlocks = [...withRecent, ...withoutRecent].flatMap((k) => orderCategoryBlock(byCategory.get(k)!));

  return [...currentBlock, ...remainingBlocks];
}

export type ReelItem = {
  id: string;
  slug: string;
  name: string;
  price: number;
  mrp?: number | null;
  image: string | null;
  videoUrl: string;
  likeCount: number;
  shareCount: number;
  /** Category label shown under the price on the bottom product card
   *  (e.g. "Jamdani Sarees"), same category used on the shop grid card.
   *  Optional/null for older callers (product-video-trigger.tsx,
   *  product-video-peek.tsx) that don't have it on hand — the row is
   *  simply omitted for those slides rather than showing a blank label. */
  category?: string | null;
  /** The base product's own id — always present, even when `id` above is a
   *  colour variant's own id. Used to look up every colour this product
   *  comes in (VariantSwatches uses the same field) so the reel can show
   *  a colour-picker strip under each video, same as the product page. */
  productId: string;
};

/**
 * Full-screen, swipe-through video shopping feed — every product on the
 * site that has a video, one per screen, Reels/Shorts-style. Opened from
 * a product page's "Watch Video" trigger, starting on that product's own
 * video; swiping up/down moves through every other videoed product.
 * Closing (X) always returns to the exact product page the shopper was
 * on when they opened it — not necessarily the currently-showing reel —
 * so a shopper who swiped through five other products and closes still
 * lands back where they started.
 */
export default function VideoReels({
  items: rawItems,
  startProductId,
  baseProductId,
  returnSlug,
  startItem,
  onClose,
  returnHref,
}: {
  items: ReelItem[];
  startProductId: string;
  /** The BASE product's own id — always the same value regardless of which
   *  colour variant is being viewed, and always present on every feed item
   *  (see ReelItem.productId). This is the most reliable thing to match on:
   *  `startProductId` can point at either a base product row or a specific
   *  variant row depending on which one actually owns the video, so an id
   *  mismatch there doesn't necessarily mean "wrong product" — it can just
   *  mean the video lives one level up/down from where this prop expected.
   *  Matching on baseProductId as a second pass catches that case without
   *  ever needing to guess. */
  baseProductId?: string;
  returnSlug: string;
  /** Fully-known data for the exact product/video the shopper tapped,
   *  built directly from what's already loaded on the product page
   *  (name/price/video/image) — NOT sourced from the async video-feed
   *  fetch. When present this GUARANTEES slide 0 is the video the shopper
   *  actually tapped, no matter what `items` contains or how it's ordered.
   *
   *  Why this exists: the old behaviour searched for the shopper's own
   *  product inside `items` (id -> baseProductId -> slug) and, if all
   *  three passes missed, either fell back to index 0 (a genuinely
   *  unrelated, most-recently-added product — the original bug) or showed
   *  a "couldn't load" error (the later fix). Both outcomes are avoidable:
   *  the trigger/peek components already know exactly which product and
   *  video they were rendered for, so there's no need to re-*find* that
   *  same video inside a separately-fetched array at all. Passing it
   *  straight through removes an entire class of "wrong/no video opened"
   *  bugs caused by feed staleness, id mismatches, or ordering, while
   *  `items` is still used for every OTHER slide (swiping to more
   *  products). See resolvedItems below for how the two are merged. */
  startItem?: ReelItem;
  onClose: () => void;
  /** Where the X/close button navigates to. Defaults to `/product/${returnSlug}`
   *  (the original "opened from a product page" behaviour). Pass this when the
   *  feed was opened standalone (e.g. from the bottom-nav "Video Shopping" tab)
   *  so closing goes back to that entry point instead of assuming a product
   *  page exists to return to. */
  returnHref?: string;
}) {
  const router = useRouter();

  // Merge the guaranteed-correct `startItem` (when provided) with the
  // fetched feed. Prefer the feed's own copy of this same video when one
  // genuinely matches (it carries the real like/share counts), but only
  // when its videoUrl actually agrees with startItem's — otherwise (no
  // match, or a same-id-different-video mismatch) fall back to startItem
  // itself so the shopper can never end up watching a different product's
  // clip than the one they tapped.
  const items = useMemo(() => {
    if (!startItem) return rawItems;
    const matchIdx = rawItems.findIndex(
      (i) =>
        (i.id === startItem.id || i.productId === startItem.productId || i.slug === startItem.slug) &&
        i.videoUrl === startItem.videoUrl
    );
    if (matchIdx !== -1) {
      const confirmed = rawItems[matchIdx];
      const rest = rawItems.filter((_, idx) => idx !== matchIdx);
      return [confirmed, ...rest];
    }
    const withoutDuplicates = rawItems.filter((i) => i.slug !== startItem.slug && i.id !== startItem.id);
    return [startItem, ...withoutDuplicates];
  }, [rawItems, startItem]);

  // When startItem is provided, resolvedItems (above) guarantees it's
  // always at index 0 — no searching needed, and no "not found" state is
  // reachable. Older callers that don't pass startItem still fall back to
  // the original id -> baseProductId -> slug search against `items`.
  const startIndex = useMemo(() => {
    if (startItem) return 0;
    const byId = items.findIndex((i) => i.id === startProductId);
    if (byId !== -1) return byId;
    if (baseProductId) {
      const byBaseProductId = items.findIndex((i) => i.productId === baseProductId);
      if (byBaseProductId !== -1) return byBaseProductId;
    }
    const bySlug = items.findIndex((i) => i.slug === returnSlug);
    return bySlug;
  }, [items, startItem, startProductId, baseProductId, returnSlug]);

  // startIndex is -1 only on the legacy (no startItem) path when none of
  // the three passes found the shopper's own product in this feed. Kept as
  // a real error state rather than silently opening index 0 — see the
  // long-form explanation this replaced, above.
  const notFound = startIndex === -1;

  // Every OTHER slide (not the one the shopper opened on) gets reshuffled
  // per rules in buildFeedOrder: finish the current category (randomly)
  // before moving on, and surface recently-viewed products first. This is
  // computed once per feed load (items/startIndex don't change while the
  // overlay is open), so the order doesn't re-shuffle itself mid-scroll.
  // The opened video always stays at index 0 — `effectiveStartIndex` below
  // is what every other index-based calc uses from here on, since
  // reordering can move it away from the original `startIndex`.
  const orderedItems = useMemo(() => {
    if (notFound) return items;
    const current = items[startIndex];
    const rest = items.filter((_, idx) => idx !== startIndex);
    const recentProductIds = getRecentlyViewed(current.productId);
    return [current, ...buildFeedOrder(rest, current.category, recentProductIds)];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, startIndex, notFound]);

  const effectiveStartIndex = notFound ? startIndex : 0;

  const containerRef = useRef<HTMLDivElement>(null);
  const slideRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [activeIndex, setActiveIndex] = useState(effectiveStartIndex);
  // Starts unmuted — the shopper just tapped a "Watch Product Video"
  // button/bubble, which counts as the user gesture browsers require
  // before allowing audio autoplay, so this doesn't get silently blocked.
  // Still exposed via the mute button in case they'd rather watch silently.
  const [muted, setMuted] = useState(false);

  // Opens as a single video first — same full-screen player, but swiping to
  // any other product's video is disabled and the clip plays once (no loop)
  // instead of looping immediately. Unlocks (flips to true) on whichever
  // happens first: (a) that first watch finishing naturally, or (b) the
  // shopper trying to swipe/scroll themselves — see the touch/wheel
  // listener below. Either way it becomes the normal swipeable Reels
  // experience (looping + swipe up/down) without making anyone sit through
  // a full watch just to reach the next product.
  const [unlocked, setUnlocked] = useState(false);
  const handleUnlock = useCallback(() => {
    setUnlocked(true);
  }, []);

  // While still locked, a swipe/scroll attempt itself is what unlocks —
  // the shopper doesn't have to wait for the clip to finish playing if
  // they'd rather move on immediately. `touch-action: none` on the
  // container (below) stops the browser from actually scrolling on this
  // first gesture, but touch/wheel events still fire, so this still sees
  // the attempt and unlocks in response to it; the very next swipe then
  // actually scrolls, since overflow/snap turn on the moment `unlocked`
  // flips.
  useEffect(() => {
    if (unlocked) return;
    const el = containerRef.current;
    if (!el) return;

    let startY = 0;
    const SWIPE_THRESHOLD_PX = 10;

    const onTouchStart = (e: TouchEvent) => {
      startY = e.touches[0]?.clientY ?? 0;
    };
    const onTouchMove = (e: TouchEvent) => {
      const y = e.touches[0]?.clientY ?? startY;
      if (Math.abs(y - startY) > SWIPE_THRESHOLD_PX) handleUnlock();
    };
    // Desktop/trackpad equivalent of a swipe.
    const onWheel = () => handleUnlock();

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: true });
    el.addEventListener('wheel', onWheel, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('wheel', onWheel);
    };
  }, [unlocked, handleUnlock]);

  // Lock body scroll while the overlay is open, restore on close, and let
  // Escape close it the same as the X button (desktop convenience).
  useEffect(() => {
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  // Jump straight to the product's own video on open — no scroll animation,
  // so it doesn't look like the shopper accidentally swiped.
  useEffect(() => {
    if (notFound) return;
    const el = slideRefs.current[effectiveStartIndex];
    if (el) el.scrollIntoView({ behavior: 'instant' as ScrollBehavior, block: 'start' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Track which slide is on-screen so only the visible video plays — every
  // other <video> stays paused, keeping bandwidth/decode cost limited to
  // exactly one active video at a time.
  //
  // Deliberately scroll-position math instead of IntersectionObserver here.
  // IntersectionObserver (threshold-based) turned out unreliable in some
  // zoomed/scaled mobile viewports (e.g. Chrome DevTools device emulation
  // at non-100% zoom) — the browser's own intersection ratio calculations
  // get thrown off by the zoom transform, so entries never crossed the
  // 0.6 threshold and activeIndex silently got stuck on whichever slide
  // opened first, even while the user kept scrolling past it. Computing
  // the index directly from scrollTop / slide height doesn't depend on
  // intersection-ratio math at all, so it isn't affected by that.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let raf = 0;
    const onScroll = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const slideHeight = container.clientHeight || 1;
        const idx = Math.round(container.scrollTop / slideHeight);
        const clamped = Math.min(Math.max(idx, 0), orderedItems.length - 1);
        setActiveIndex((prev) => (prev === clamped ? prev : clamped));
      });
    };

    container.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      container.removeEventListener('scroll', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [orderedItems.length]);

  const activeItem = orderedItems[activeIndex];

  const goToProduct = useCallback(
    (slug: string) => {
      onClose();
      router.push(`/product/${slug}`);
    },
    [onClose, router]
  );

  // Same destination product-card.tsx's own category label uses
  // (/shop?category=...) — keeps this consistent with the rest of the
  // site instead of inventing a second category-linking convention.
  const goToCategory = useCallback(
    (category: string) => {
      onClose();
      router.push(`/shop?category=${encodeURIComponent(category)}`);
    },
    [onClose, router]
  );

  const handleClose = useCallback(() => {
    onClose();
    router.push(returnHref ?? `/product/${returnSlug}`);
  }, [onClose, returnHref, returnSlug, router]);

  if (orderedItems.length === 0) return null;

  // Never fall through to showing an unrelated product's video. This is the
  // deliberate replacement for the old `Math.max(0, -1) -> 0` fallback: if
  // the shopper's own product truly isn't in this feed response, say so and
  // let them close, instead of silently opening whatever product happens to
  // be newest.
  if (notFound) {
    return (
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4 text-center text-white"
        role="dialog"
        aria-modal="true"
        onClick={handleClose}
      >
        <p>Couldn&apos;t load this product&apos;s video right now — tap anywhere to close.</p>
      </div>
    );
  }

  return (
    // Full viewport on phones (unchanged). From the `sm` breakpoint up —
    // i.e. any desktop/tablet width — this centres a phone-proportioned
    // (9:16) "frame" on a dimmed backdrop instead of stretching the reel
    // edge-to-edge, which is what was blowing the video up into an
    // extreme, cropped close-up on wide screens. Mobile itself is
    // untouched: no sm: class here changes anything below that breakpoint.
    <div
      className="fixed inset-0 z-[100] bg-black sm:flex sm:items-center sm:justify-center sm:bg-black/90 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Product video feed"
    >
      <div className="relative h-full w-full overflow-hidden bg-black sm:aspect-[9/16] sm:h-[min(92vh,900px)] sm:w-auto sm:rounded-2xl sm:shadow-2xl sm:ring-1 sm:ring-white/10">
        <button
          type="button"
          onClick={handleClose}
          aria-label="Close video feed"
          className="absolute right-3 top-3 z-20 rounded-full bg-black/40 p-2 text-white backdrop-blur-sm transition-colors hover:bg-black/60 sm:right-4 sm:top-4"
        >
          <X className="h-6 w-6" />
        </button>

        {/* Small one-time hint that appears the moment the feed unlocks, so it's
            obvious the overlay just turned into a swipeable Reels feed instead
            of the shopper wondering why nothing happens on a swipe attempt
            during the single-video stage. Auto-hides itself via CSS animation. */}
        {unlocked && (
          <div
            key={activeItem?.id}
            className="pointer-events-none absolute inset-x-0 top-16 z-20 flex justify-center animate-[fadeOutUp_2.2s_ease-out_forwards]"
          >
            <span className="rounded-full bg-black/50 px-3 py-1 text-xs font-medium text-white backdrop-blur-sm">
              Swipe up for more ↑
            </span>
          </div>
        )}
        <style jsx>{`
          @keyframes fadeOutUp {
            0% {
              opacity: 0;
              transform: translateY(4px);
            }
            15% {
              opacity: 1;
              transform: translateY(0);
            }
            75% {
              opacity: 1;
            }
            100% {
              opacity: 0;
              transform: translateY(-4px);
            }
          }
        `}</style>

        <div
          ref={containerRef}
          className={`h-full w-full overflow-y-scroll scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${
            unlocked ? 'snap-y snap-mandatory' : 'overflow-hidden overscroll-none'
          }`}
          style={!unlocked ? { touchAction: 'none' } : undefined}
        >
          {orderedItems.map((item, idx) => (
            <ReelSlide
              key={item.id}
              item={item}
              isActive={idx === activeIndex}
              muted={muted}
              onToggleMute={() => setMuted((m) => !m)}
              onShopNow={() => goToProduct(item.slug)}
              onSelectColour={goToProduct}
              onGoToCategory={goToCategory}
              // Only the very first slide the shopper opened on plays "once,
              // then unlock"; every other slide behaves exactly as before
              // (loops while active) both before and after that unlock.
              loopVideo={unlocked || idx !== effectiveStartIndex}
              onVideoEnded={idx === effectiveStartIndex && !unlocked ? handleUnlock : undefined}
              ref={(el) => {
                slideRefs.current[idx] = el;
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function ReelSlide({
  item,
  isActive,
  muted,
  onToggleMute,
  onShopNow,
  onSelectColour,
  onGoToCategory,
  loopVideo = true,
  onVideoEnded,
  ref,
}: {
  item: ReelItem;
  isActive: boolean;
  muted: boolean;
  onToggleMute: () => void;
  onShopNow: () => void;
  /** Navigates straight to the clicked colour's own product page. */
  onSelectColour: (slug: string) => void;
  /** Navigates to the shop page filtered to this item's category
   *  (/shop?category=...), same destination the shop grid's own
   *  category label links to. */
  onGoToCategory: (category: string) => void;
  /** False only for the opening slide during its single "watch it once"
   *  stage — see VideoReels' `unlocked` state above. Every other slide,
   *  and this same slide once unlocked, loops normally. */
  loopVideo?: boolean;
  /** Fires once, when this slide's video finishes an unlooped play-through. */
  onVideoEnded?: () => void;
  ref: (el: HTMLDivElement | null) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(item.likeCount);
  const [shareCount, setShareCount] = useState(item.shareCount);
  const [colours, setColours] = useState<ProductVariant[] | null>(null);

  useEffect(() => {
    setLiked(hasLikedReel(item.id));
  }, [item.id]);

  // Colour swatches, same data source as the product page's own picker
  // (fetchVariantsForProduct). Loaded lazily once a slide is actually
  // seen, not for all 20+ slides up front, and cached per productId for
  // the life of the overlay so swiping back to a slide doesn't re-fetch.
  const coloursCacheRef = useRef<Map<string, ProductVariant[]>>(new Map());
  useEffect(() => {
    if (!isActive) return;
    const cached = coloursCacheRef.current.get(item.productId);
    if (cached) {
      setColours(cached);
      return;
    }
    let cancelled = false;
    fetchVariantsForProduct(item.productId)
      .then((v) => {
        coloursCacheRef.current.set(item.productId, v);
        if (!cancelled) setColours(v);
      })
      .catch(() => {
        if (!cancelled) setColours([]);
      });
    return () => {
      cancelled = true;
    };
  }, [isActive, item.productId]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (isActive) {
      // Belt-and-suspenders: some mobile browsers don't start fetching a
      // <source> child until load() is explicitly called, especially
      // when preload was previously 'none' on the inactive slide.
      video.currentTime = 0;
      video.load();
      video.play().catch(() => {
        // Autoplay with sound can be blocked — the muted-by-default state
        // handles that; nothing else to do if even muted autoplay fails.
      });
    } else {
      video.pause();
    }
  }, [isActive]);

  const handleLike = async () => {
    const next = toggleLikedReel(item.id);
    setLiked(next);
    setLikeCount((c) => Math.max(0, c + (next ? 1 : -1)));
    try {
      await fetch(`/api/products/${item.id}/video-like`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ liked: next }),
      });
    } catch {
      // Best-effort — the local heart state already updated, and a failed
      // network call here isn't worth surfacing an error over a like tap.
    }
  };

  const handleShare = async () => {
    const url = typeof window !== 'undefined' ? `${window.location.origin}/product/${item.slug}` : '';
    setShareCount((c) => c + 1);
    try {
      if (navigator.share) {
        await navigator.share({ title: item.name, url });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(url);
      }
    } catch {
      // User cancelled the native share sheet — not an error.
    }
    try {
      await fetch(`/api/products/${item.id}/video-share`, { method: 'POST' });
    } catch {
      // Best-effort, same reasoning as handleLike.
    }
  };

  const discountPct = useMemo(() => {
    if (!item.mrp || item.mrp <= item.price) return null;
    return Math.round(((item.mrp - item.price) / item.mrp) * 100);
  }, [item.mrp, item.price]);

  return (
    <div ref={ref} className="relative flex h-full w-full snap-start snap-always items-center justify-center">
      <video
        ref={videoRef}
        muted={muted}
        loop={loopVideo}
        onEnded={onVideoEnded}
        playsInline
        // eslint-disable-next-line react/no-unknown-property
        webkit-playsinline="true"
        preload={isActive ? 'auto' : 'none'}
        // Falls back to the product's own cover photo the instant this slide
        // becomes active, instead of the bare black background. Without this,
        // a video whose codec the browser can't decode (very common for
        // iPhone-recorded HEVC/H.265 clips on non-Safari browsers — the AAC
        // audio track still decodes fine, only the video track silently
        // fails to paint) looked exactly like "audio playing, no video" —
        // there was nothing on screen to distinguish that from a real bug.
        // ProductVideoPeek already does this (poster={posterUrl}); this
        // brings the full-screen Reels view in line with it.
        poster={item.image ?? undefined}
        className="h-full w-full object-contain sm:object-cover"
        aria-label={`${item.name} — product video`}
        onClick={onToggleMute}
      >
        {/* Explicit type= tag: on mobile Safari/Chrome, if the upstream
            Content-Type header is ever wrong/missing, the browser falls
            back to this instead of silently refusing to play. Guessed
            from the file extension in the URL. */}
        <source src={item.videoUrl} type={guessVideoMime(item.videoUrl)} />
      </video>

      {/* Bottom gradient keeps the product card and icons legible over any video */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-64 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />

      {/* Right-side action rail */}
      <div className="absolute bottom-28 right-3 z-10 flex flex-col items-center gap-5 sm:right-5">
        <button
          type="button"
          onClick={handleLike}
          aria-label={liked ? 'Unlike this video' : 'Like this video'}
          aria-pressed={liked}
          className="flex flex-col items-center gap-1 text-white"
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-black/40 backdrop-blur-sm">
            <Heart className={`h-6 w-6 transition-colors ${liked ? 'fill-red-500 text-red-500' : 'text-white'}`} />
          </span>
          <span className="text-xs font-medium drop-shadow">{likeCount}</span>
        </button>

        <button
          type="button"
          onClick={handleShare}
          aria-label="Share this video"
          className="flex flex-col items-center gap-1 text-white"
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-black/40 backdrop-blur-sm">
            <Share2 className="h-6 w-6" />
          </span>
          <span className="text-xs font-medium drop-shadow">{shareCount}</span>
        </button>

        <button
          type="button"
          onClick={onToggleMute}
          aria-label={muted ? 'Unmute' : 'Mute'}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm"
        >
          {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
        </button>
      </div>

      {/* Colour swatches — same colours as the product page's own picker.
          Tapping one navigates straight to that colour's product page,
          same behaviour as "Shop Now" but for a specific variant. Only
          rendered once fetched and only when there's more than one colour
          to choose from (a single-colour product has nothing to switch to). */}
      {colours && colours.length > 1 && (
        <div className="absolute bottom-32 left-3 right-16 z-10 flex gap-2 overflow-x-auto pb-1 sm:left-5 sm:right-20 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {colours.map((v) => {
            const isCurrentColour = v.slug === item.slug || v.id === item.id;
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => onSelectColour(v.slug)}
                title={v.color}
                aria-label={`View in ${v.color}`}
                className={`relative h-16 w-11 shrink-0 overflow-hidden rounded-lg border-2 bg-muted shadow-sm sm:h-[4.5rem] sm:w-12 ${
                  isCurrentColour ? 'border-white' : 'border-white/40'
                }`}
              >
                {v.images[0] ? (
                  <Image src={v.images[0]} alt={v.color} fill sizes="48px" className="object-cover object-top" />
                ) : v.color_hex ? (
                  <span className="block h-full w-full" style={{ backgroundColor: v.color_hex }} />
                ) : (
                  <span className="flex h-full w-full items-center justify-center bg-black/60 text-[9px] font-semibold uppercase text-white">
                    {v.color.slice(0, 2)}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Bottom-left product card */}
      <div className="absolute inset-x-3 bottom-4 z-10 sm:inset-x-5">
        <div className="flex items-center gap-3 rounded-2xl bg-black/50 p-2.5 pr-3 backdrop-blur-md">
          {item.image && (
            <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg">
              <Image src={item.image} alt={item.name} fill sizes="48px" className="object-cover" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-white">{item.name}</p>
            <p className="flex items-center gap-1.5 text-sm text-white/90">
              ₹{item.price.toLocaleString('en-IN')}
              {discountPct !== null && <span className="text-xs text-white/60 line-through">₹{item.mrp!.toLocaleString('en-IN')}</span>}
            </p>
            {item.category && (
              <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10px]">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onGoToCategory(item.category!);
                  }}
                  className="flex items-center gap-0.5 font-semibold uppercase tracking-wide text-white/70 underline-offset-2 hover:text-white hover:underline"
                >
                  {item.category}
                  <ChevronRight className="h-2.5 w-2.5" />
                </button>
                <span className="flex items-center gap-0.5 font-semibold uppercase tracking-wide text-emerald-400">
                  <Truck className="h-2.5 w-2.5" />
                  Free Delivery
                </span>
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onShopNow}
            className="shrink-0 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Shop Now
          </button>
        </div>
      </div>
    </div>
  );
}
