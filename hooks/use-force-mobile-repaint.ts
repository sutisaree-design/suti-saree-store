'use client';

import { useEffect } from 'react';
import type { RefObject } from 'react';

/**
 * Real mobile browsers (iOS Safari, and some Android WebViews/Chrome
 * builds) can cache the painted layer of an element that uses
 * `position: sticky` together with `backdrop-filter` — once that element is
 * "stuck" to the viewport, the browser only repaints its contents on the
 * next scroll or touch event, not on a normal React re-render. Desktop
 * browsers (and desktop DevTools' mobile *emulation*, which still runs the
 * desktop rendering/compositing pipeline) don't reproduce this, which is
 * why the exact same code can look perfectly instant in an inspector's
 * mobile view and still visibly lag on a real iPhone/Android until the
 * user happens to tap or scroll.
 *
 * A `transform` nudge alone recomposites the *element*, but on WebKit it's
 * specifically the `backdrop-filter` blur layer's *content* that gets
 * stuck — nudging transform doesn't reliably force that layer to repaint.
 * So this hook does three things, each forced onto its own paint via a
 * synchronous reflow read (`el.offsetHeight`) so the browser can't batch
 * them away into a single no-op style recalculation:
 *   1. Nudge `transform` by a fraction of a pixel (recomposite the layer).
 *   2. Momentarily drop `backdrop-filter` to `none` (forces WebKit to
 *      actually repaint that layer's contents instead of just moving it).
 *   3. On the next frame, restore both — invisibly, since translateZ(0)
 *      vs translateZ(0.01px) and the original blur render identically.
 */
export function useForceMobileRepaint<T extends HTMLElement>(
  ref: RefObject<T | null>,
  deps: unknown[]
) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    el.style.transform = 'translateZ(0.01px)';
    el.style.setProperty('backdrop-filter', 'none');
    el.style.setProperty('-webkit-backdrop-filter', 'none');
    // Force a synchronous layout/paint commit right now, so the two writes
    // above land on their own frame instead of being coalesced with the
    // restore below.
    void el.offsetHeight;

    const raf = requestAnimationFrame(() => {
      el.style.transform = 'translateZ(0)';
      el.style.removeProperty('backdrop-filter');
      el.style.removeProperty('-webkit-backdrop-filter');
    });
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
