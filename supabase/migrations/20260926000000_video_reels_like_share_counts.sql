-- Video Reels feature: like/share counters shown on the full-screen
-- Reels-style video shopping overlay (Instagram/Myntra-style).
--
-- Counts are simple atomic integer counters on the products row (not a
-- per-user "likes" join table) -- the requirement is a real, persisted
-- count, not a per-user "you liked this" toggle across devices. The
-- client tracks which product ids *this browser* has already liked in
-- localStorage (same pattern as lib/recently-viewed.ts) purely so the
-- heart icon shows filled/unfilled and so a double-tap on the same
-- device increments then decrements instead of stacking infinitely.
-- The counters themselves are incremented with a single atomic SQL
-- UPDATE (`count = count + 1`), which is safe under concurrent requests
-- without needing row locking or a separate ledger table.

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS video_like_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS video_share_count integer NOT NULL DEFAULT 0;

-- Keep counters non-negative even if a client fires an "unlike" without a
-- matching prior "like" (e.g. stale localStorage after a DB reset).
ALTER TABLE products
  ADD CONSTRAINT IF NOT EXISTS video_like_count_non_negative CHECK (video_like_count >= 0),
  ADD CONSTRAINT IF NOT EXISTS video_share_count_non_negative CHECK (video_share_count >= 0);
