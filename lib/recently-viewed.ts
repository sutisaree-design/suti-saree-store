'use client';

// Recently-viewed products are tracked per-browser in localStorage rather
// than in the database. This keeps it working instantly for guests (no
// account needed), avoids an extra table/write on every product view, and
// each browser's history is naturally private to that browser.

const STORAGE_KEY = 'saaj_recently_viewed';
const MAX_ITEMS = 12;

function safeRead(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

/** Records a product view, most-recent-first, deduped, capped at MAX_ITEMS. */
export function addRecentlyViewed(productId: string) {
  if (typeof window === 'undefined' || !productId) return;
  try {
    const existing = safeRead().filter((id) => id !== productId);
    const next = [productId, ...existing].slice(0, MAX_ITEMS);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // localStorage unavailable (private browsing / disabled) -- fail silently
  }
}

/** Returns viewed product ids, most-recent-first, optionally excluding one id. */
export function getRecentlyViewed(excludeId?: string): string[] {
  const ids = safeRead();
  return excludeId ? ids.filter((id) => id !== excludeId) : ids;
}

export function clearRecentlyViewed() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
