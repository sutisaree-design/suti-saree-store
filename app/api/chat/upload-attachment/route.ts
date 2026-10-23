import { NextResponse } from 'next/server';
import { uploadToStorage } from '@/lib/storage';

// ---------------------------------------------------------------------
// POST /api/chat/upload-attachment
//
// Lets a shopper attach one photo when raising a support ticket from the
// chat widget (e.g. a photo of a damaged/wrong item). No login required
// — raising a ticket itself doesn't require one either (see
// app/api/chat/raise-ticket). Returns a canonical /media/ URL, same
// pattern as app/api/upload-review-photo.
// ---------------------------------------------------------------------

const MAX_BYTES = 8 * 1024 * 1024; // 8MB
const ALLOWED_TYPES = new Set([
  'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif',
]);

export async function POST(req: Request) {
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
    return NextResponse.json({ ok: false, error: 'File is too large (max 8MB).' }, { status: 400 });
  }
  if (file.type && !ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json({ ok: false, error: 'Please attach a photo (JPG, PNG, WEBP, GIF or HEIC).' }, { status: 400 });
  }

  try {
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
    const path = `customer/${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    const { url } = await uploadToStorage({
      bucket: 'support-attachments',
      path,
      buffer,
      contentType: file.type || 'image/jpeg',
    });
    return NextResponse.json({ ok: true, url, name: file.name });
  } catch (err) {
    console.error('[chat/upload-attachment] error:', err);
    return NextResponse.json({ ok: false, error: 'Could not upload that photo — please try again.' }, { status: 500 });
  }
}
