# MIGRATION_IMPLEMENTATION_V2 — Dual-Write + Admin Toggle + Auto-Fallback

**Branch:** `feature/media-dual-write-toggle`  
**Based on:** MIGRATION_AUDIT_V2.md findings  
**Status:** Ready for review — do NOT merge to main until confirmed

---

## What changed and why

### 1. `lib/storage.ts` — Complete dual-write rewrite

**Why:** Previously a single-backend STORAGE_PROVIDER env-var switch that only wrote to one backend at a time. This meant any R2-uploaded image would break if R2 credentials were removed. Also, `r2PublicUrl()` returned a raw `cdn.aruhihandlooms.com` URL that bypassed `toPublicMediaUrl()` entirely (confirmed bug from audit).

**What it does now:**
- `uploadToStorage()` uploads to **Supabase first** (required — throws on failure, exactly like before). Then attempts R2 upload **best-effort** (wrapped in try/catch, logs on failure, never throws).
- Returns `{ url, r2Mirrored }` where `url` is always `aruhihandlooms.com/media/<bucket>/<path>` — never a raw storage host URL.
- `deleteFromStorage()` attempts deletion from both providers independently — one failure never blocks the other.
- `r2EnvPresent()` exported helper — checked before any R2 operation so R2 is silently skipped if env vars aren't set.
- `canonicalMediaUrl()` exported helper for building `/media/` URLs.
- `activeStorageProvider()` kept (deprecated, returns `'supabase'` always) for any code that still imports it.
- `StorageBucket` type extended to include `'review-images'`.

### 2. `lib/media-url.ts` — R2 legacy URL fix added

**Why:** The confirmed audit bug — when `STORAGE_PROVIDER=r2` was active, uploaded images were stored as raw `cdn.aruhihandlooms.com/...` URLs. `toPublicMediaUrl()` did not recognise these and returned them unchanged, exposing the storage host.

**What it does now:**
- New uploads from this point forward already come in as canonical `/media/` URLs and pass through unchanged.
- Pre-existing raw Supabase URLs (the ~500 existing rows) — unchanged behaviour, still correctly rewritten to `/media/`.
- **New:** Pre-existing raw R2/CDN URLs (`cdn.aruhihandlooms.com/...`) — now recognised and rewritten to `/media/` at read time. No DB row is modified.

### 3. `app/media/[...path]/route.ts` — Backend-aware with auto-fallback

**Why:** Previously hardcoded to Supabase only with no R2 awareness.

**What it does now:**
- Reads both `media_delivery` and `media_storage_backend` settings in a single DB query per request.
- Tries preferred backend first; if it 404s or errors, automatically tries the other backend.
- For ~500 pre-existing Supabase-only files: R2 → 404 → Supabase succeeds (correct, no change visible to users).
- For new dual-written files: either backend works, whichever is preferred goes first.
- Redirect mode (proxy_enabled: false) still redirects to Supabase (safe default, works for all files).

### 4. `lib/settings-api.ts` — `MediaStorageBackendSettings` added

**Why:** Need a DB-backed setting that takes effect immediately (no redeploy) for the preferred-backend toggle.

**What was added:** `MediaStorageBackendSettings` interface, `DEFAULT_MEDIA_STORAGE_BACKEND_SETTINGS`, `fetchMediaStorageBackendSettings()`, `saveMediaStorageBackendSettings()` — follows exact same pattern as existing `MediaDeliverySettings`.

### 5. `app/api/admin/media-storage-backend/route.ts` — New admin API

**Why:** Same reason as `media-delivery` route — needs to purge Cloudflare cache when toggled so change takes effect immediately for already-cached images.

**Blocks:** Saving `backend: 'r2'` when R2 env vars are missing, with a clear error message.

### 6. `app/api/admin/media-storage-backend/status/route.ts` — New status endpoint

**Why:** Admin UI needs to know if R2 is configured to enable/disable the toggle, without exposing secrets to the client.

### 7. `app/api/upload-review-photo/route.ts` — New server-side review photo upload

**Why:** `uploadReviewPhoto()` in `lib/reviews-api.ts` was uploading directly from the browser to Supabase, bypassing `uploadToStorage()` entirely — no dual-write, no canonical URL.

**What it does:** Accepts authenticated (logged-in customer) multipart/form-data, passes buffer through `uploadToStorage()`, returns canonical `/media/` URL.

### 8. `app/api/upload-image/route.ts` — Extended folder allowlist

**Why:** `uploadHeroBannerImage()` and `uploadHomepageTileImage()` now route through this endpoint (which already uses `uploadToStorage()`), but needed `hero-banners` and `tiles` as valid folder names.

**What changed:** Added `hero-banners` and `tiles` to the `ALLOWED_FOLDERS` set. Also accepts `slug` form field in addition to `seoName` for the filename prefix. No other behaviour changed — existing product/variant uploads unaffected.

### 9. `lib/reviews-api.ts` — `uploadReviewPhoto()` fixed

**Before:** Browser-direct Supabase upload → raw `supabase.co` URL stored in DB.  
**After:** Calls `/api/upload-review-photo` → dual-write → canonical `/media/` URL stored in DB.  
Only affects **new** review photo uploads from this point forward. Existing review photos in the DB are untouched.

### 10. `lib/hero-banners-api.ts` — `uploadHeroBannerImage()` fixed

**Before:** Browser-direct Supabase upload → raw `supabase.co` URL stored in DB.  
**After:** Calls `/api/upload-image` with `folder=hero-banners` → dual-write → canonical `/media/` URL.  
Only affects **new** hero banner uploads. Existing rows untouched.

### 11. `lib/homepage-tiles-api.ts` — `uploadHomepageTileImage()` fixed

**Before:** Browser-direct Supabase upload → raw `supabase.co` URL stored in DB.  
**After:** Calls `/api/upload-image` with `folder=tiles` → dual-write → canonical `/media/` URL.  
Only affects **new** tile uploads. Existing rows untouched.

### 12. `components/blog/blog-product-card.tsx` — Image URL fixed

**Before:** `product.images[0]` used directly, bypassing `toPublicMediaUrl()`.  
**After:** `toPublicMediaUrl(product.images[0])` — raw Supabase or legacy R2 URLs are now correctly rewritten at render time.

### 13. `components/admin/settings-panel.tsx` — New backend toggle UI

Added a "Media Storage — Preferred Backend" toggle section with:
- Clear explanation that both backends always receive new uploads (dual-write), toggle only controls serve order.
- Warning banner when R2 env vars are not configured.
- Toggle disabled when R2 is not configured.
- Immediate effect on save (Cloudflare cache purged).

---

## Confirmation: no existing DB row or URL was modified

- No migration script, no `UPDATE` query, no re-upload of any file was run.
- All ~500 pre-existing rows with raw Supabase URLs continue to resolve correctly via `toPublicMediaUrl()` (unchanged behaviour from before this change).
- Any pre-existing rows with raw R2/CDN URLs (from the confirmed `STORAGE_PROVIDER=r2` bug) now also resolve correctly via the updated `toPublicMediaUrl()` — at read time only, no DB write.
- `deleteFromStorage()` was not called anywhere new — no files were deleted.

## Confirmation: no raw storage host is ever exposed

Every URL that goes into the database or is returned to a caller from this point forward is `aruhihandlooms.com/media/<bucket>/<path>`. Neither `*.supabase.co` nor `cdn.aruhihandlooms.com` appear in any URL stored by the new code paths.

---

## Build results

```
npx tsc --noEmit    → 0 errors
npx next lint       → 0 new errors (pre-existing lint errors in other files unchanged)
```

---

## Files changed

| File | Change |
|------|--------|
| `lib/storage.ts` | Rewritten — dual-write, canonical URL, deprecated STORAGE_PROVIDER switch |
| `lib/media-url.ts` | Updated — handles legacy R2 CDN URLs in addition to Supabase |
| `app/media/[...path]/route.ts` | Updated — preferred backend + auto-fallback |
| `lib/settings-api.ts` | Appended — `MediaStorageBackendSettings` types and functions |
| `app/api/admin/media-storage-backend/route.ts` | **New** — saves toggle + purges Cloudflare cache |
| `app/api/admin/media-storage-backend/status/route.ts` | **New** — R2 env check for UI |
| `app/api/upload-review-photo/route.ts` | **New** — server-side dual-write review photo upload |
| `app/api/upload-image/route.ts` | Updated — allows `hero-banners` and `tiles` folders |
| `lib/reviews-api.ts` | Updated — `uploadReviewPhoto()` via server route |
| `lib/hero-banners-api.ts` | Updated — `uploadHeroBannerImage()` via server route |
| `lib/homepage-tiles-api.ts` | Updated — `uploadHomepageTileImage()` via server route |
| `components/blog/blog-product-card.tsx` | Fixed — uses `toPublicMediaUrl()` |
| `components/admin/settings-panel.tsx` | Updated — new backend toggle UI |

---

## Next steps

1. Review this branch — do NOT merge to main yet.
2. Run Part 3 (verify prompt) in a separate Claude Code session to confirm dual-write behaviour, fallback simulation, and URL checks.
3. After Part 3 confirmation, merge to main and deploy.
4. Optional: run `scripts/migrate-to-r2.mjs` to backfill the ~500 pre-existing Supabase-only files into R2 (recommended after dual-write is confirmed working in production — new files already get both copies automatically).
