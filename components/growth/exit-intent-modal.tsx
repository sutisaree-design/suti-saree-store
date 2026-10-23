'use client';

import { useEffect, useState, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { X, Copy, Check } from 'lucide-react';
import { fetchGrowthSettings, GrowthSettings } from '@/lib/growth-api';

const SHOWN_KEY = 'exit_intent_shown_at';
const TRAP_KEY = 'exit_intent_trap_armed';
const COOLDOWN_HOURS = 24;

export default function ExitIntentModal() {
  const pathname = usePathname();
  const [settings, setSettings] = useState<GrowthSettings | null>(null);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetchGrowthSettings()
      .then(setSettings)
      .catch(() => {});
  }, []);

  const maybeShow = useCallback(() => {
    if (!settings?.exit_intent_enabled) return;
    const shownAt = Number(sessionStorage.getItem(SHOWN_KEY) || 0);
    const hoursSince = (Date.now() - shownAt) / 3_600_000;
    if (shownAt && hoursSince < COOLDOWN_HOURS) return;
    sessionStorage.setItem(SHOWN_KEY, String(Date.now()));
    setOpen(true);
  }, [settings]);

  useEffect(() => {
    if (!settings?.exit_intent_enabled || pathname?.startsWith('/admin')) return;

    // Desktop signal: cursor exits toward the top of the viewport (heading
    // for the tab bar / address bar) — unchanged from before.
    const onMouseLeave = (e: MouseEvent) => {
      if (e.clientY <= 0) maybeShow();
    };

    // Mobile has no cursor, so it needs its own signals. Skip installing
    // them if we're already in cooldown (see maybeShow) — no point arming
    // a history trap that would just be wasted.
    const shownAt = Number(sessionStorage.getItem(SHOWN_KEY) || 0);
    const inCooldown = shownAt && (Date.now() - shownAt) / 3_600_000 < COOLDOWN_HOURS;
    const isTouchDevice =
      typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

    // Mobile signal #1 (primary): listen for the back button/gesture. This
    // fires naturally once a visitor has real internal history to go back
    // through — e.g. cart -> checkout, so pressing back on checkout already
    // triggers a popstate event without us doing anything special. We
    // re-attach this listener on every single page (not just once per
    // session) so it's live wherever the visitor happens to hit back,
    // checkout included.
    const onPopState = () => maybeShow(); // maybeShow() itself re-checks cooldown

    // Mobile signal #2 (fallback): a fast upward scroll flick while already
    // near the top of the page. That's the same "heading back to the
    // address bar" gesture as a mouse leaving toward the tab bar, just
    // expressed as a swipe instead of a cursor move.
    let lastScrollY = typeof window !== 'undefined' ? window.scrollY : 0;
    let lastScrollT = Date.now();
    const onScroll = () => {
      const now = Date.now();
      const y = window.scrollY;
      const dt = now - lastScrollT;
      const dy = lastScrollY - y; // positive = scrolled upward
      if (dt > 0 && dt < 200 && dy > 120 && y < 250) maybeShow();
      lastScrollY = y;
      lastScrollT = now;
    };

    // Small delay so none of this can fire the instant the page loads.
    const timer = setTimeout(() => {
      document.addEventListener('mouseleave', onMouseLeave);

      if (isTouchDevice && !inCooldown) {
        window.addEventListener('popstate', onPopState);
        window.addEventListener('scroll', onScroll, { passive: true });

        // Also plant ONE guard history entry, but only once per tab
        // (TRAP_KEY). This only matters for a visitor's very FIRST
        // back-press before they've navigated anywhere else on the site —
        // without it, that first press would leave the site entirely
        // before the popstate listener above ever gets a chance to fire.
        // Once real internal navigation exists (any second page visited),
        // the listener above catches back-presses on its own.
        if (!sessionStorage.getItem(TRAP_KEY)) {
          sessionStorage.setItem(TRAP_KEY, '1');
          window.history.pushState({ exitIntentTrap: true }, '');
        }
      }
    }, 4000);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mouseleave', onMouseLeave);
      window.removeEventListener('popstate', onPopState);
      window.removeEventListener('scroll', onScroll);
    };
  }, [settings, pathname, maybeShow]);

  if (pathname?.startsWith('/admin') || !open || !settings) return null;

  const copyCode = () => {
    navigator.clipboard?.writeText(settings.exit_intent_coupon_code).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 px-4"
      role="dialog"
      aria-modal="true"
      onClick={() => setOpen(false)}
    >
      <div
        className="relative w-full max-w-sm rounded-lg bg-card p-6 text-center shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close"
          className="absolute right-3 top-3 rounded p-1 text-muted-foreground hover:bg-accent"
        >
          <X className="h-4 w-4" />
        </button>

        <h2 className="font-serif text-xl font-bold text-primary">{settings.exit_intent_headline}</h2>
        <p className="mt-2 inline-block rounded-full bg-primary px-4 py-1 text-sm font-bold tracking-wide text-primary-foreground">
          {settings.exit_intent_discount_type === 'percentage'
            ? `${settings.exit_intent_discount_value}% OFF`
            : `₹${settings.exit_intent_discount_value} OFF`}
        </p>
        <p className="mt-2 text-sm text-muted-foreground">{settings.exit_intent_message}</p>

        <button
          type="button"
          onClick={copyCode}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-md border-2 border-dashed border-primary bg-primary/5 px-4 py-3 font-mono text-base font-bold tracking-wider text-primary transition-colors hover:bg-primary/10"
        >
          {settings.exit_intent_coupon_code}
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        </button>
        <p className="mt-2 text-[11px] text-muted-foreground">
          {copied ? 'Copied! Paste it at checkout.' : 'Tap to copy, then apply it at checkout.'}
        </p>
      </div>
    </div>
  );
}
