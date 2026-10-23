'use client';

// Tracks which Reels videos *this browser* has liked, purely so the heart
// icon renders filled/unfilled and a repeat tap toggles instead of
// stacking. Same pattern as lib/recently-viewed.ts: no account needed,
// works instantly for guests, and each browser's like-state is naturally
// private to that browser. The actual persisted count lives in Postgres
// (products.video_like_count) via /api/products/[id]/video-like.

const STORAGE_KEY = 'saaj_video_reels_liked';

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

export function hasLikedReel(productId: string): boolean {
  return safeRead().includes(productId);
}

/** Flips this browser's liked state for a product and returns the new state. */
export function toggleLikedReel(productId: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const existing = safeRead();
    const isLiked = existing.includes(productId);
    const next = isLiked ? existing.filter((id) => id !== productId) : [...existing, productId];
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    return !isLiked;
  } catch {
    return false;
  }
}
