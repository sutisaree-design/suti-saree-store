import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-fulfillment-shared';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { r2EnvPresent } from '@/lib/storage';

// ---------------------------------------------------------------------
// POST /api/admin/media-storage-backend
//
// Saves the "Media Storage — Preferred Backend" toggle (Supabase ↔ R2)
// and purges Cloudflare's edge cache so the change takes effect
// immediately for already-cached /media/* responses.
//
// This follows the exact same pattern as /api/admin/media-delivery:
// the toggle only controls which backend the /media/ proxy TRIES FIRST;
// both backends always receive new uploads (dual-write).
//
// Blocked: switching to 'r2' when R2 env vars are missing.
// ---------------------------------------------------------------------

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

export async function POST(req: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { backend?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (body.backend !== 'supabase' && body.backend !== 'r2') {
    return NextResponse.json({ error: 'backend must be "supabase" or "r2"' }, { status: 400 });
  }

  // Block switching to R2 if env vars are missing — the proxy would have
  // no R2 CDN base URL to build upstream fetch URLs from.
  if (body.backend === 'r2' && !r2EnvPresent()) {
    return NextResponse.json(
      {
        error:
          'Cannot set preferred backend to "r2": R2 environment variables are not configured. ' +
          'Add R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, and R2_PUBLIC_URL ' +
          'in Vercel Project Settings → Environment Variables, then redeploy before switching.',
      },
      { status: 400 }
    );
  }

  const admin = getSupabaseAdmin();
  const { error: saveError } = await admin
    .from('settings')
    .upsert({ key: 'media_storage_backend', value: { backend: body.backend } }, { onConflict: 'key' });

  if (saveError) {
    return NextResponse.json({ error: saveError.message }, { status: 500 });
  }

  const purgeResult = await purgeCloudflareMediaCache();

  return NextResponse.json({ saved: true, backend: body.backend, cloudflare_purge: purgeResult });
}
