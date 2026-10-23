import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAdminToken, ADMIN_SESSION_COOKIE } from '@/lib/admin-auth';
import { mirrorSupabaseObjectToR2 } from '@/lib/storage';

// ---------------------------------------------------------------------
// Called by uploadProductVideo() (lib/products-api.ts) right after the
// browser finishes uploading a video DIRECTLY to Supabase Storage via
// the signed URL minted by /api/upload-video. That direct-to-storage
// flow never touches R2 (see lib/storage.ts's createDirectUploadTarget
// comment), so this is the missing "step 2": server-side, copy the
// bytes Supabase already has over to R2 too.
//
// Best-effort on purpose — if this fails or is slow, the product save
// still succeeds and the video still plays (the /media/ proxy falls
// back to Supabase). It just means that one file stays Supabase-only
// until the admin re-saves or this is retried. The client fires this
// and does not block the "Save product" button on its result.
// ---------------------------------------------------------------------

async function requireAdmin() {
  const cookie = cookies().get(ADMIN_SESSION_COOKIE)?.value ?? null;
  const verified = await verifyAdminToken(cookie);
  return verified.valid;
}

export async function POST(req: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { path?: string; contentType?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 });
  }

  const path = (body.path ?? '').toString();
  if (!path) {
    return NextResponse.json({ error: 'Missing path.' }, { status: 400 });
  }
  const contentType = body.contentType || 'video/mp4';

  const result = await mirrorSupabaseObjectToR2({ bucket: 'product-videos', path, contentType });
  // Always 200 — this is a best-effort background task, not something
  // the caller should treat as a hard failure.
  return NextResponse.json(result);
}
