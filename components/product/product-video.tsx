'use client';

import { useEffect, useState } from 'react';
import { PlayCircle, X } from 'lucide-react';

/**
 * Optional short product video (fabric drape / texture / try-on).
 * Kept deliberately separate from ProductGallery's scroll-snap image strip
 * (which is tightly built around <Image> zoom + lightbox indices) — this
 * renders as its own compact "Watch Video" trigger that opens a simple
 * modal player, so it can't affect the existing photo gallery behaviour.
 */
export default function ProductVideo({
  videoUrl,
  posterUrl,
  alt,
}: {
  videoUrl?: string | null;
  posterUrl?: string;
  alt: string;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!videoUrl) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center justify-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-4 py-2.5 text-sm font-medium text-primary transition-colors hover:bg-primary/10"
      >
        <PlayCircle className="h-5 w-5" />
        Watch Product Video
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onClick={() => setOpen(false)}
        >
          <button
            type="button"
            aria-label="Close video"
            onClick={() => setOpen(false)}
            className="absolute right-4 top-4 rounded-full bg-background/20 p-2 text-white hover:bg-background/30"
          >
            <X className="h-5 w-5" />
          </button>
          <video
            src={videoUrl}
            poster={posterUrl}
            controls
            autoPlay
            playsInline
            className="max-h-[85vh] w-full max-w-lg rounded-lg bg-black"
            aria-label={`${alt} — product video`}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}
