import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAdminToken, ADMIN_SESSION_COOKIE } from '@/lib/admin-auth';
import { uploadToStorage } from '@/lib/storage';

// ---------------------------------------------------------------------
// POST /api/admin/support-tickets/upload-attachment
//
// Lets the admin attach one photo/file to a support-ticket reply (e.g. a
// size chart, a replacement-item photo, a courier proof-of-delivery).
// Same bucket as the customer-side upload (app/api/chat/upload-attachment)
// but gated by the admin session cookie, and a slightly larger size cap
// since staff-uploaded files aren't as risk-sensitive as anonymous ones.
// ---------------------------------------------------------------------

const MAX_BYTES = 15 * 1024 * 1024; // 15MB
const ALLOWED_TYPES = new Set([
  'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif',
  'application/pdf',
]);

export async function POST(req: Request) {
  const cookie = cookies().get(ADMIN_SESSION_COOKIE)?.value ?? null;
  const verified = await verifyAdminToken(cookie);
  if (!verified.valid) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: 'Expected multipart/form-data with a file field.' }, { status: 400 });
  }

  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: 'No file provided.' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ ok: false, error: 'File is too large (max 15MB).' }, { status: 400 });
  }
  if (file.type && !ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json({ ok: false, error: 'Please attach a photo or PDF.' }, { status: 400 });
  }

  try {
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
    const path = `admin/${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    const { url } = await uploadToStorage({
      bucket: 'support-attachments',
      path,
      buffer,
      contentType: file.type || 'application/octet-stream',
    });
    return NextResponse.json({ ok: true, url, name: file.name });
  } catch (err) {
    console.error('[admin/support-tickets/upload-attachment] error:', err);
    return NextResponse.json({ ok: false, error: 'Could not upload that file — please try again.' }, { status: 500 });
  }
}
