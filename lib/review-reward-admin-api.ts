// ---------------------------------------------------------------------
// Admin-side client fetch wrappers for the guest review-reward program
// (Admin > Rewards tab). Talks to app/api/admin/review-reward-settings
// (admin-token gated, service role underneath -- see
// lib/review-reward-settings.ts). Same split as lib/loyalty-api.ts:
// the storefront/server logic lives in lib/review-reward-settings.ts,
// this file is purely the browser -> admin-API glue.
// ---------------------------------------------------------------------

import type { ReviewRewardSettings } from './review-reward-settings';

export type { ReviewRewardSettings };

export interface ReviewRewardStats {
  totalIssued: number;
}

export interface AdminReviewRewardOverview {
  settings: ReviewRewardSettings;
  stats: ReviewRewardStats;
}

export async function fetchAdminReviewRewardSettings(): Promise<AdminReviewRewardOverview> {
  const res = await fetch('/api/admin/review-reward-settings');
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to load review reward settings');
  }
  return res.json();
}

export async function saveAdminReviewRewardSettings(
  settings: ReviewRewardSettings
): Promise<ReviewRewardSettings> {
  const res = await fetch('/api/admin/review-reward-settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ settings }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to save review reward settings');
  }
  const json = await res.json();
  return json.settings as ReviewRewardSettings;
}
