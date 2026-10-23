import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

function cleanPhone(raw: unknown): string | null {
  const digits = String(raw ?? '').replace(/\D/g, '');
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return digits;
  if (digits.length === 11 && digits.startsWith('0')) return `91${digits.slice(1)}`;
  return null;
}

// Public "Notify me when back in stock" signup (email and/or WhatsApp).
export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const productId = typeof body?.product_id === 'string' ? body.product_id : '';
  const emailRaw = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  const email = emailRaw && /^[^\s@,()]+@[^\s@,()]+\.[^\s@,()]+$/.test(emailRaw) ? emailRaw : null;
  const phone = cleanPhone(body?.phone);

  const clip = (v: unknown, n: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : null);
  const variantColor = clip(body?.variant_color, 60);
  const variantSlug = clip(body?.variant_slug, 200);
  const rawImage = clip(body?.variant_image, 600);
  const variantImage = rawImage && /^(https?:\/\/|\/)/.test(rawImage) ? rawImage : null;

  if (!productId) return NextResponse.json({ error: 'product_id is required' }, { status: 400 });
  if (emailRaw && !email) return NextResponse.json({ error: 'Invalid email address' }, { status: 400 });
  if (body?.phone && !phone) return NextResponse.json({ error: 'Invalid WhatsApp number' }, { status: 400 });
  if (!email && !phone) {
    return NextResponse.json({ error: 'Enter an email or WhatsApp number' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  try {
    const { data: product } = await supabase.from('products').select('id').eq('id', productId).maybeSingle();
    if (!product) return NextResponse.json({ error: 'Product not found' }, { status: 404 });

    // Existing signup for the same product + email or phone? Re-arm it instead of duplicating.
    const filters: string[] = [];
    if (email) filters.push(`email.eq.${email}`);
    if (phone) filters.push(`phone.eq.${phone}`);
    let lookup = supabase.from('stock_notifications').select('id').eq('product_id', productId);
    lookup = variantColor ? lookup.eq('variant_color', variantColor) : lookup.is('variant_color', null);
    const { data: existing } = await lookup.or(filters.join(',')).limit(1).maybeSingle();

    if (existing) {
      const patch: Record<string, unknown> = { notified: false, notified_at: null, whatsapp_sent: false };
      if (email) patch.email = email;
      if (phone) patch.phone = phone;
      if (variantSlug) patch.variant_slug = variantSlug;
      if (variantImage) patch.variant_image = variantImage;
      const { error } = await supabase.from('stock_notifications').update(patch).eq('id', existing.id);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from('stock_notifications')
        .insert({
          product_id: productId,
          email,
          phone,
          variant_color: variantColor,
          variant_slug: variantSlug,
          variant_image: variantImage,
        });
      if (error) throw error;
    }
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Could not save, please try again' }, { status: 500 });
  }
}
