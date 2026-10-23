// Hover/touch-triggered image preloading.
//
// Goal: by the time a shopper actually taps/clicks a product card, the
// product-detail page's image is already sitting in the browser's HTTP
// cache — so it paints instantly instead of showing a blank/loading state,
// same feel as a native app pre-fetching the next screen's assets.
//
// We use <link rel="preload" as="image"> instead of `new Image()` because
// preload hints the browser to fetch at a higher priority and is easy to
// de-duplicate/clean up via the DOM, without holding a reference to an
// Image object per card.

const preloadedUrls = new Set<string>();

/**
 * Preloads one or more image URLs by inserting <link rel="preload"> tags
 * into <head>. Safe to call repeatedly with overlapping URLs — already
 * preloaded (or currently in-flight) URLs are skipped.
 */
export function preloadImages(urls: (string | null | undefined)[]): void {
  if (typeof window === 'undefined') return;

  for (const url of urls) {
    if (!url || preloadedUrls.has(url)) continue;
    preloadedUrls.add(url);

    const link = document.createElement('link');
    link.rel = 'preload';
    link.as = 'image';
    link.href = url;
    document.head.appendChild(link);
  }
}

/**
 * Debounced version for hover: a shopper's cursor often passes over several
 * cards while scanning the grid, so this waits a beat before firing to
 * avoid preloading every card the mouse merely brushed past. Touch
 * (touchstart) should call preloadImages directly instead — a tap already
 * signals real intent, no debounce needed.
 */
let hoverTimer: ReturnType<typeof setTimeout> | null = null;

export function preloadImagesOnHover(urls: (string | null | undefined)[], delayMs = 120): void {
  if (typeof window === 'undefined') return;
  if (hoverTimer) clearTimeout(hoverTimer);
  hoverTimer = setTimeout(() => preloadImages(urls), delayMs);
}

export function cancelHoverPreload(): void {
  if (hoverTimer) {
    clearTimeout(hoverTimer);
    hoverTimer = null;
  }
}
