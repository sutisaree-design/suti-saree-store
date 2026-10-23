import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

// Called (debounced) from the checkout page whenever the shopper has an
// email address filled in and items in their cart. Upserts a row in
// abandoned_carts so the recovery cron can email them later if they never
// complete checkout.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const email = (body?.email as string | undefined)?.trim();
  // Optional — only present once the shopper has also typed a phone number.
  // Stored so the admin panel can offer a free "Send WhatsApp" (wa.me)
  // recovery action alongside the existing recovery email.
  const phone = (body?.phone as string | undefined)?.trim() || null;
  const items = Array.isArray(body?.items) ? body.items : [];
  const cartValue = Number(body?.cartValue) || 0;

  if (!email || items.length === 0) {
    return NextResponse.json({ skipped: true });
  }

  const supabase = getSupabaseAdmin();

  try {
    const { data: existing } = await supabase
      .from('abandoned_carts')
      .select('id')
      .eq('email', email)
      .eq('recovered', false)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase
        .from('abandoned_carts')
        .update({
          items,
          cart_value: cartValue,
          last_activity_at: new Date().toISOString(),
          // Only overwrite phone once we actually have one — don't blank
          // out a previously-captured number on a later update that fires
          // before the phone field is filled in again.
          ...(phone ? { phone } : {}),
          // Cart changed again — give it a fresh chance before we email.
          recovery_email_sent: false,
        })
        .eq('id', existing.id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from('abandoned_carts').insert({
        email,
        phone,
        items,
        cart_value: cartValue,
        last_activity_at: new Date().toISOString(),
      });
      if (error) throw error;
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    // Never block checkout because of a tracking failure.
    return NextResponse.json({ success: false }, { status: 200 });
  }
}
