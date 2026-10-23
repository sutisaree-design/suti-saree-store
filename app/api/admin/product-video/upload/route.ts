import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { uploadToStorage } from '@/lib/storage';
import { requireAdmin } from '@/lib/admin-fulfillment-shared';

// ---------------------------------------------------------------------
// POST /api/admin/product-video/upload  (multipart/form-data: file, productId)
//
// Receives the WebM video Blob generated client-side by
// lib/slideshow-video-generator.ts, uploads it to the `product-videos`
// storage bucket (SERVICE ROLE client — same pattern as
// app/api/admin/fulfillment/upload-photo/route.ts), and stamps the
// resulting public URL onto products.video_url so it (a) shows as the
// first slide in the product gallery and (b) is ready to hand to
// publishVideoToSocial() as the video_url Meta's Graph API will fetch
// from.
// ---------------------------------------------------------------------

const MAX_BYTES = 45 * 1024 * 1024; // 45MB — comfortably under the bucket's 50MB cap

export async function POST(req: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get('file');
    const productId = formData.get('productId');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No video file provided' }, { status: 400 });
    }
    if (typeof productId !== 'string' || !productId) {
      return NextResponse.json({ error: 'productId required' }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'Video is too large (max 45MB — try fewer images).' }, { status: 400 });
    }

    const admin = getSupabaseAdmin();

    const { data: product, error: productError } = await admin
      .from('products')
      .select('id')
      .eq('id', productId)
      .maybeSingle();
    if (productError || !product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    const contentType = file.type || 'video/webm';
    const ext = contentType.includes('webm') ? 'webm' : 'mp4';
    const path = `${productId}/${Date.now()}.${ext}`;

    const arrayBuffer = await file.arrayBuffer();
    const { url: videoUrl } = await uploadToStorage({
      bucket: 'product-videos',
      path,
      buffer: Buffer.from(arrayBuffer),
      contentType,
    });

    const { error: updateError } = await admin
      .from('products')
      .update({ video_url: videoUrl })
      .eq('id', productId);
    if (updateError) throw updateError;

    return NextResponse.json({ ok: true, videoUrl });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to upload video';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
