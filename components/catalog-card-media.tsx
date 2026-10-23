'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { guessVideoMime } from '@/lib/video-mime';
import { THUMB_BLUR_DATA_URL, resolveBlurDataUrl } from '@/lib/image-placeholder';

/**
 * Thumbnail area for a catalog/shop grid product card.
 *
 * Normally just renders the product's image (with the existing hover-swap
 * to a second photo). But if the admin has switched on "Autoplay video in
 * catalog thumbnail" for this product (products.autoplay_video_in_catalog)
 * and it has a video_url, this instead renders that video, muted/looping/
 * autoplaying, so shoppers get a silent moving preview right in the grid
 * (same idea as Myntra/Instagram Reels-style catalog cards).
 *
 * The video element only gets a `src` (and therefore only loads/plays)
 * once the card has actually scrolled into the viewport, via
 * IntersectionObserver — so a long catalog grid never pays the bandwidth/
 * decode cost for videos the shopper hasn't scrolled to yet, and it stops
 * playing again once the card scrolls back out.
 */
export default function CatalogCardMedia({
  img,
  hoverImg,
  altText,
  videoUrl,
  autoplayVideo,
  priority,
  compact,
  blurDataUrl,
  hoverBlurDataUrl,
}: {
  img: string;
  hoverImg?: string;
  altText: string;
  videoUrl?: string | null;
  autoplayVideo?: boolean;
  priority?: boolean;
  compact?: boolean;
  /** Real per-image blur preview (LQIP) for `img`, if one exists yet —
   *  see the matching prop on ProductCardProps. Falls back to the
   *  generic shimmer (THUMB_BLUR_DATA_URL) when undefined. */
  blurDataUrl?: string;
  /** Same, for `hoverImg`. */
  hoverBlurDataUrl?: string;
}) {
  const useVideo = !!(autoplayVideo && videoUrl);
  // Respects Admin > Settings > Blur Placeholder's two independent
  // toggles (same helper + same generic shimmer as the product-detail
  // gallery — see lib/image-placeholder.ts / lib/blur-placeholder-flag.ts).
  // Previously this component had its own hardcoded shimmer
  // (lib/utils.ts) that never checked either toggle at all, so switching
  // them in Admin had no effect on the shop/category grid — only on the
  // product page.
  const resolvedBlurDataUrl = resolveBlurDataUrl(blurDataUrl, THUMB_BLUR_DATA_URL);
  const resolvedHoverBlurDataUrl = resolveBlurDataUrl(hoverBlurDataUrl, THUMB_BLUR_DATA_URL);

  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    if (!useVideo) return;
    const el = containerRef.current;
    if (!el) return;

    // Load a little before the card is actually on screen so playback has
    // already started by the time the shopper's eyes reach it.
    const observer = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { rootMargin: '200px 0px', threshold: 0.01 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [useVideo]);

  useEffect(() => {
    if (!useVideo) return;
    const video = videoRef.current;
    if (!video) return;
    if (inView) {
      // Belt-and-suspenders mute: some browsers only honour autoplay if
      // `muted` is also set imperatively, not just as a JSX/HTML attribute.
      video.muted = true;
      video.load();
      video.play().catch(() => {
        // Autoplay can still be blocked in some browser/OS combos (e.g. low
        // power mode) -- fine, the poster frame just shows as a still image.
      });
    } else {
      video.pause();
    }
  }, [inView, useVideo]);

  return (
    <div ref={containerRef} className="relative aspect-[4/5] overflow-hidden bg-muted">
      {useVideo ? (
        <video
          ref={videoRef}
          poster={img}
          muted
          loop
          playsInline
          // eslint-disable-next-line react/no-unknown-property
          webkit-playsinline="true"
          autoPlay
          preload="none"
          controls={false}
          aria-label={`${altText} — video preview`}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        >
          {inView && <source src={videoUrl!} type={guessVideoMime(videoUrl)} />}
        </video>
      ) : (
        <>
          <Image
            src={img}
            alt={altText}
            fill
            sizes={compact ? '(max-width: 640px) 38vw, 176px' : '(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw'}
            quality={78}
            priority={priority}
            loading={priority ? undefined : 'lazy'}
            placeholder={resolvedBlurDataUrl ? 'blur' : undefined}
            blurDataURL={resolvedBlurDataUrl}
            className={`object-cover transition-opacity duration-300 ease-out ${
              hoverImg ? 'group-hover:opacity-0' : 'group-hover:scale-105 transition-transform duration-500'
            }`}
          />
          {/* Shopify-style hover swap: shows the second product photo on hover
              instead of a plain zoom, giving a peek at another angle without
              an extra click. Falls back to a simple scale zoom if there's
              only one image. Lazy — only loads once the card is in view. */}
          {hoverImg && (
            <Image
              src={hoverImg}
              alt={`${altText} - back view`}
              fill
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
              quality={70}
              loading="lazy"
              placeholder={resolvedHoverBlurDataUrl ? 'blur' : undefined}
              blurDataURL={resolvedHoverBlurDataUrl}
              className="absolute inset-0 object-cover opacity-0 transition-opacity duration-300 ease-out group-hover:opacity-100"
            />
          )}
        </>
      )}
    </div>
  );
}
