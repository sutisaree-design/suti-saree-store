import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/admin-fulfillment-shared';

// ---------------------------------------------------------------------
// Phase 3C — admin-side photo-proof upload (warehouse-receiving photo,
// final-packed photo).
//
// The `order-fulfillment-photos` bucket's INSERT policy (Phase 3B
// migration) only allows `authenticated` Supabase Auth users — the
// admin panel deliberately isn't one (it uses its own signed cookie,
// see lib/admin-auth.ts), so a direct browser upload like the vendor
// side does (lib/vendor-api.ts:uploadPickupProofPhoto) would be
// rejected. Rather than widen that storage policy to `anon` (which
// would let anyone with the public anon key write to this bucket, not
// just this app), this route uploads server-side with the SERVICE ROLE
// client, which bypasses storage RLS entirely and is already gated by
// the same admin-cookie check every other admin route uses.
// ---------------------------------------------------------------------

const MAX_BYTES = 15 * 1024 * 1024; // 15MB
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);

export async function POST(req: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'Image is too large (max 15MB).' }, { status: 400 });
    }
    if (file.type && !ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json({ error: 'Please upload a JPG, PNG, WEBP, or HEIC photo.' }, { status: 400 });
    }

    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
    const path = `admin/${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${ext}`;

    const admin = getSupabaseAdmin();
    const arrayBuffer = await file.arrayBuffer();
    const { error: uploadError } = await admin.storage
      .from('order-fulfillment-photos')
      .upload(path, Buffer.from(arrayBuffer), {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type || 'image/jpeg',
      });
    if (uploadError) throw uploadError;

    const { data } = admin.storage.from('order-fulfillment-photos').getPublicUrl(path);
    return NextResponse.json({ url: data.publicUrl });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to upload photo';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
