'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { PlayCircle, X } from 'lucide-react';
import VideoReels, { type ReelItem } from './video-reels';
import { guessVideoMime } from '@/lib/video-mime';
import responsiveImageLoader from '@/lib/cloudflare-image-loader';

/**
 * Small floating "peek" preview of the product video, pinned to the
 * bottom-left corner of the main gallery photo (picture-in-picture style —
 * the pattern shoppers already know from Meesho/Instagram). Silently
 * autoplaying and dismissible, it's a second, more visible entry point
 * into the same full-screen video feed as the "Watch Product Video"
 * button below the gallery (components/product/product-video-trigger.tsx)
 * — tapping either one opens the identical VideoReels overlay.
 *
 * Performance is the whole point of this component, not an afterthought:
 * - The poster frame is the product's own cover photo, already being
 *   fetched for the gallery itself — reusing that URL means the poster
 *   paints with zero extra bytes.
 * - The actual video <source> is only attached once BOTH (a) the browser
 *   reports an idle moment (requestIdleCallback) and (b) the bubble is
 *   on-screen — so the clip can never compete with the hero image, fonts,
 *   or buy button for bandwidth during the page's first paint. This is
 *   the difference from components/catalog-card-media.tsx's autoplay
 *   video (which only needs the in-view gate, since most grid cards start
 *   off-screen): this bubble sits inside the above-the-fold gallery from
 *   the moment the page opens, so in-view alone would fire immediately —
 *   the idle gate is what actually protects initial page-open speed here.
 * - The file itself is served through /media/... which already sets a
 *   one-year immutable Cache-Control (see app/media/[...path]/route.ts),
 *   so every repeat view of this product page — and the identical clip
 *   inside the full Reels feed — reuses the same cached bytes instead of
 *   re-downloading.
 * - The video-feed JSON the full Reels overlay needs is prefetched during
 *   that same idle window, so the first tap opens instantly instead of
 *   showing a loading state.
 */
export default function ProductVideoPeek({
  videoUrl,
  posterUrl,
  productId,
  baseProductId,
  productSlug,
  alt,
  name,
  price,
  mrp,
}: {
  videoUrl: string;
  posterUrl?: string;
  productId: string;
  /** The base product's own id, even when `productId` above points at a
   *  colour variant's own id. Used to look up every colour this product
   *  comes in (VariantSwatches uses the same field) so the reel can show
   *  a colour-picker strip under each video, same as the product page. */
  baseProductId?: string;
  productSlug: string;
  alt: string;
  /** Display data for the exact product this bubble's clip belongs to —
   *  lets VideoReels open guaranteed-correct on this video instead of
   *  re-finding it inside the separately-fetched feed. See the
   *  `startItem` doc comment in video-reels.tsx. Optional so this still
   *  falls back to feed-search if a caller hasn't been updated. */
  name?: string;
  price?: number;
  mrp?: number | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const fetchStartedRef = useRef(false);

  const [dismissed, setDismissed] = useState(false);
  const [idle, setIdle] = useState(false);
  const [inView, setInView] = useState(false);
  // Gate 3 -- bandwidth saver. The clip is often several MB (one real file
  // here is ~4.7 MB), and it used to download on EVERY product-page view.
  // Now it only auto-plays on a fast, non-metered connection. On mobile
  // data, Data-Saver, slow networks, or browsers that don't expose the
  // connection (iOS Safari) the bubble stays a poster + play icon, and the
  // video downloads only when the shopper taps it.
  const [goodNetwork, setGoodNetwork] = useState(false);
  useEffect(() => {
    const conn = (navigator as unknown as {
      connection?: { saveData?: boolean; effectiveType?: string; type?: string };
    }).connection;
    if (!conn) {
      setGoodNetwork(false);
      return;
    }
    const saveData = !!conn.saveData;
    const slow = !!conn.effectiveType && conn.effectiveType !== '4g';
    const cellular = conn.type === 'cellular';
    setGoodNetwork(!saveData && !slow && !cellular);
  }, []);
  const canLoad = idle && inView && goodNetwork;

  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<ReelItem[] | null>(null);

  // A colour/variant swap can bring in a different video — dismissing one
  // clip shouldn't permanently hide the next one.
  useEffect(() => {
    setDismissed(false);
  }, [videoUrl]);

  // Gate 1 — wait for a genuinely idle moment (falls back to a short
  // timeout on browsers without requestIdleCallback, e.g. Safari) before
  // even considering loading the clip.
  useEffect(() => {
    const hasIdleApi = typeof window.requestIdleCallback === 'function';
    const id = hasIdleApi
      ? window.requestIdleCallback(() => setIdle(true), { timeout: 2000 })
      : window.setTimeout(() => setIdle(true), 300);
    return () => {
      if (hasIdleApi) window.cancelIdleCallback(id);
      else window.clearTimeout(id);
    };
  }, []);

  // Gate 2 — only decode/play while the bubble is actually on screen.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), {
      threshold: 0.2,
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Prefetch the Reels feed during the same idle window as the preview
  // clip, so expanding to full-screen never shows a loading spinner.
  useEffect(() => {
    if (!idle || fetchStartedRef.current) return;
    fetchStartedRef.current = true;
    let cancelled = false;
    fetch('/api/products/video-feed', { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setItems(Array.isArray(data.items) ? data.items : []);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, [idle]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (canLoad) {
      video.muted = true;
      video.load();
      video.play().catch(() => {
        // Autoplay blocked (low-power mode, data-saver, etc.) — the poster
        // just stays put as a still image; tapping still opens the video.
      });
    } else {
      video.pause();
    }
  }, [canLoad]);

  const handleExpand = useCallback(async () => {
    setOpen(true);
    if (items !== null) return; // prefetched during idle time, or a previous tap
    fetchStartedRef.current = true;
    try {
      const res = await fetch('/api/products/video-feed', { cache: 'no-store' });
      const data = await res.json();
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch {
      setItems([]);
    }
  }, [items]);

  const startItem: ReelItem | undefined =
    name != null && price != null
      ? {
          id: productId,
          slug: productSlug,
          name,
          price,
          mrp: mrp ?? null,
          image: posterUrl ?? null,
          videoUrl,
          likeCount: 0,
          shareCount: 0,
          productId: baseProductId ?? productId,
        }
      : undefined;

  if (dismissed) return null;

  // The bubble is only ~80-96px wide, but `posterUrl` is the full-size cover
  // photo -- and because the <video> has preload="none", the browser fetches
  // the poster immediately, so a second, large copy of the cover photo was
  // downloading in parallel with the main (LCP) photo. Use the small (-sm)
  // resized file instead. Same URL as before when the Responsive Images
  // toggle is off; the original posterUrl is still used for the reels view.
  const bubblePoster = posterUrl ? responsiveImageLoader({ src: posterUrl, width: 200 }) : undefined;

  return (
    <>
      <div ref={containerRef} className="absolute bottom-3 left-3 z-20 h-24 w-20 sm:h-28 sm:w-24">
        <button
          type="button"
          onClick={handleExpand}
          aria-label={`Watch ${alt} product video`}
          className="relative block h-full w-full overflow-hidden rounded-xl bg-black shadow-lg ring-2 ring-background"
        >
          <video
            ref={videoRef}
            muted
            loop
            playsInline
            // eslint-disable-next-line react/no-unknown-property
            webkit-playsinline="true"
            preload="none"
            poster={bubblePoster}
            aria-hidden="true"
            className="h-full w-full object-cover"
          >
            {canLoad && <source src={videoUrl} type={guessVideoMime(videoUrl)} />}
          </video>
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/10">
            <PlayCircle className="h-6 w-6 text-white drop-shadow" />
          </span>
        </button>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setDismissed(true);
          }}
          aria-label="Dismiss video preview"
          className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-foreground/90 text-background shadow-sm"
        >
          <X className="h-3 w-3" />
        </button>
      </div>

      {open && (startItem || (items && items.length > 0)) && (
        <VideoReels
          items={items ?? []}
          startProductId={productId}
          baseProductId={baseProductId}
          returnSlug={productSlug}
          startItem={startItem}
          onClose={() => setOpen(false)}
        />
      )}

      {open && !startItem && !!items && items.length === 0 && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4 text-center text-white"
          onClick={() => setOpen(false)}
        >
          <p>Couldn&apos;t load videos right now — tap anywhere to close.</p>
        </div>
      )}
    </>
  );
}
