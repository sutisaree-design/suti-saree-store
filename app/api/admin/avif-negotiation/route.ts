import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-fulfillment-shared';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

// ---------------------------------------------------------------------
// GET  /api/admin/avif-negotiation  -> current { enabled }
// POST /api/admin/avif-negotiation  -> { enabled: boolean } saves it,
//   then purges Cloudflare's edge cache for /media/* in the same request.
//
// This is the kill-switch for AVIF format negotiation
// (app/media/[...path]/route.ts). OFF reverts image-serving behavior to
// exactly how it was before AVIF negotiation shipped -- every image
// resolves to plain WebP again, for every requester (human or bot),
// with no other change (canonical DB URLs, already-generated AVIF
// files, and the responsive-size backfill are all untouched either way).
//
// Purges Cloudflare on save for the same reason /api/admin/media-delivery
// does: this route's responses are cached for a year at the edge, so
// without an explicit purge, an admin flipping this off would only see
// the reverted behavior on images nobody has viewed yet -- everything
// already cached would keep serving whatever it last served until that
// year-long cache naturally expires. Purging makes "off" take effect
// immediately everywhere, which matters most exactly when this switch is
// being used as an emergency kill-switch (e.g. a Merchant Center/Pinterest
// image disapproval).
// ---------------------------------------------------------------------

const SETTINGS_KEY = 'avif_negotiation';
const DEFAULT_ENABLED = true;

const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const CLOUDFLARE_ZONE_ID = process.env.CLOUDFLARE_ZONE_ID;

async function purgeCloudflareMediaCache(): Promise<{ attempted: boolean; ok: boolean; error?: string }> {
  if (!CLOUDFLARE_API_TOKEN || !CLOUDFLARE_ZONE_ID) {
    return { attempted: false, ok: false, error: 'CLOUDFLARE_API_TOKEN or CLOUDFLARE_ZONE_ID not configured' };
  }
  try {
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${CLOUDFLARE_ZONE_ID}/purge_cache`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}`, 'Content-Type': 'application/json' },
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

export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const admin = getSupabaseAdmin();
  const { data } = await admin.from('settings').select('value').eq('key', SETTINGS_KEY).maybeSingle();
  const value = data?.value as { enabled?: boolean } | undefined;
  const enabled = typeof value?.enabled === 'boolean' ? value.enabled : DEFAULT_ENABLED;
  return NextResponse.json({ enabled });
}

export async function POST(req: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { enabled?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (typeof body.enabled !== 'boolean') {
    return NextResponse.json({ error: '"enabled" must be a boolean' }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  const { error } = await admin
    .from('settings')
    .upsert({ key: SETTINGS_KEY, value: { enabled: body.enabled } }, { onConflict: 'key' });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const purgeResult = await purgeCloudflareMediaCache();

  return NextResponse.json({ saved: true, enabled: body.enabled, cloudflare_purge: purgeResult });
}
