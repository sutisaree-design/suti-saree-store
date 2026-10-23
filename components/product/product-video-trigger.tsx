'use client';

import { useState } from 'react';
import { PlayCircle } from 'lucide-react';
import VideoReels, { type ReelItem } from './video-reels';

/**
 * Replaces the old single-video modal (components/product/product-video.tsx)
 * with a trigger that opens the full Reels-style swipeable feed instead,
 * starting on this product's own video. Kept as its own component (same
 * reasoning as the old ProductVideo) so it can't affect the photo gallery.
 */
export default function ProductVideoTrigger({
  productId,
  baseProductId,
  productSlug,
  videoUrl,
  posterUrl,
  name,
  price,
  mrp,
}: {
  productId: string;
  /** The base product's own id, even when `productId` above points at a
   *  colour variant's row — see the matching note in video-reels.tsx. */
  baseProductId?: string;
  productSlug: string;
  /** This product's own resolved video URL, plus the display data below —
   *  together these let VideoReels guarantee it opens THIS exact video,
   *  instead of having to re-find it inside the separately-fetched feed
   *  (see the `startItem` doc comment in video-reels.tsx for why that
   *  matters). All optional so this still degrades gracefully to the old
   *  feed-search behaviour if a caller doesn't have them yet. */
  videoUrl?: string | null;
  posterUrl?: string | null;
  name?: string;
  price?: number;
  mrp?: number | null;
}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<ReelItem[] | null>(null);
  const [loading, setLoading] = useState(false);

  const startItem: ReelItem | undefined =
    videoUrl && name != null && price != null
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

  const handleOpen = async () => {
    setOpen(true);
    if (items) return; // already fetched this page-view
    setLoading(true);
    try {
      const res = await fetch('/api/products/video-feed', { cache: 'no-store' });
      const data = await res.json();
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        className="flex items-center justify-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-4 py-2.5 text-sm font-medium text-primary transition-colors hover:bg-primary/10"
      >
        <PlayCircle className="h-5 w-5" />
        Watch Product Video
      </button>

      {/* startItem alone is enough to open immediately and correctly — the
          feed fetch (items) only adds the rest of the swipeable list, so
          this no longer waits on `items` before opening when we already
          know exactly which video to show. Falls back to waiting on
          `items` only for callers/situations without a startItem. */}
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

      {open && !startItem && !loading && items && items.length === 0 && (
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

