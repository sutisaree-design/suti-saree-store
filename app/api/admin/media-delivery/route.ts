import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-fulfillment-shared';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

// ---------------------------------------------------------------------
// POST /api/admin/media-delivery
//
// Saves the Media Delivery toggle (Admin > Settings, see
// components/admin/settings-panel.tsx + lib/settings-api.ts,
// MediaDeliverySettings) AND purges Cloudflare's edge cache for
// /media/* in the same request.
//
// Why this needs its own API route instead of writing to the `settings`
// table directly from the browser (like every other admin setting does):
// the site sits behind Cloudflare, and app/media/[...path]/route.ts sets
// a 1-year immutable Cache-Control header. Cloudflare honours that and
// caches each image at its edge -- so an admin flipping this switch has
// no visible effect on any image Cloudflare already has cached (it never
// asks Vercel again, so our route's on/off check never even runs for
// that image). Purging Cloudflare's cache the moment the switch flips is
// what makes the toggle actually take effect immediately instead of only
// for images nobody has viewed yet.
//
// Requires CLOUDFLARE_API_TOKEN (a token scoped to "Cache Purge" for the
// zone) and CLOUDFLARE_ZONE_ID as server-only env vars (Vercel Project
// Settings -> Environment Variables). If either is missing, the setting
// still saves -- purging is a best-effort bonus, not a requirement for
// the toggle to work eventually (it'll still apply to newly-viewed
// images even with no purge).
// ---------------------------------------------------------------------

const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const CLOUDFLARE_ZONE_ID = process.env.CLOUDFLARE_ZONE_ID;

async function purgeCloudflareMediaCache(): Promise<{ attempted: boolean; ok: boolean; error?: string }> {
  if (!CLOUDFLARE_API_TOKEN || !CLOUDFLARE_ZONE_ID) {
    return { attempted: false, ok: false, error: 'CLOUDFLARE_API_TOKEN or CLOUDFLARE_ZONE_ID not configured' };
  }

  try {
    // Cloudflare's purge-by-URL-prefix isn't available on Free/Pro plans
    // (only Enterprise) -- "purge everything" is the reliable option on
    // every plan. This only runs when an admin deliberately flips the
    // Media Delivery switch (a rare, intentional action), so briefly
    // re-warming the whole zone's cache is an acceptable tradeoff for
    // the toggle actually working right away.
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${CLOUDFLARE_ZONE_ID}/purge_cache`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ purge_everything: true }),
      }
    );
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.success) {
      return { attempted: true, ok: false, error: json?.errors?.[0]?.message || `HTTP ${res.status}` };
    }
    return { attempted: true, ok: true };
  } catch (err) {
    return { attempted: true, ok: false, error: err instanceof Error ? err.message : 'Purge request failed' };
  }
}

export async function POST(req: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { proxy_enabled?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (typeof body.proxy_enabled !== 'boolean') {
    return NextResponse.json({ error: 'proxy_enabled (boolean) is required' }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  const { error: saveError } = await admin
    .from('settings')
    .upsert({ key: 'media_delivery', value: { proxy_enabled: body.proxy_enabled } }, { onConflict: 'key' });

  if (saveError) {
    return NextResponse.json({ error: saveError.message }, { status: 500 });
  }

  const purgeResult = await purgeCloudflareMediaCache();

  return NextResponse.json({
    saved: true,
    proxy_enabled: body.proxy_enabled,
    cloudflare_purge: purgeResult,
  });
}
