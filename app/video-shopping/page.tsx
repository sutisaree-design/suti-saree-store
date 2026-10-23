'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import VideoReels, { type ReelItem } from '@/components/product/video-reels';

// Entry point for the bottom-nav "Video Shopping" tab — same full-screen
// Reels-style feed used by a product page's "Watch Product Video" trigger
// (components/product/product-video-trigger.tsx), just opened directly with
// no specific starting product. Starts on the newest videoed product (feed
// is already ordered newest-first by the API) and closes back to home.
export default function VideoShoppingPage() {
  const router = useRouter();
  const [items, setItems] = useState<ReelItem[] | null>(null);

  useEffect(() => {
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
  }, []);

  // Loading
  if (items === null) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black text-white">
        <p className="text-sm text-white/70">Loading videos…</p>
      </div>
    );
  }

  // Nothing to show — no product has a video yet
  if (items.length === 0) {
    return (
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4 text-center text-white"
        onClick={() => router.push('/')}
      >
        <p>No product videos available right now — tap anywhere to go back.</p>
      </div>
    );
  }

  const first = items[0];

  return (
    <VideoReels
      items={items}
      startProductId={first.id}
      baseProductId={first.productId}
      returnSlug={first.slug}
      returnHref="/"
      onClose={() => router.push('/')}
    />
  );
}
