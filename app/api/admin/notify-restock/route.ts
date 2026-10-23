import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAdminToken, ADMIN_SESSION_COOKIE } from '@/lib/admin-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { sendEmail } from '@/lib/email';
import { restockEmail } from '@/lib/email-templates';

// Sends "back in stock" emails to everyone who asked to be notified for a
// product, then marks them as notified. Called automatically by the admin
// products panel when stock goes from 0 -> positive, and can also be
// triggered manually from Admin -> Restock Alerts.
export async function POST(req: Request) {
  const cookie = cookies().get(ADMIN_SESSION_COOKIE)?.value ?? null;
  const verified = await verifyAdminToken(cookie);
  if (!verified.valid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let productId: string | undefined;
  try {
    const body = await req.json();
    productId = body?.product_id;
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
  if (!productId) {
    return NextResponse.json({ error: 'product_id is required' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  try {
    const { data: product, error: productError } = await supabase
      .from('products')
      .select('id, name, slug, price, images')
      .eq('id', productId)
      .single();
    if (productError || !product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    const { data: pending, error: pendingError } = await supabase
      .from('stock_notifications')
      .select('id, email, phone')
      .eq('product_id', productId)
      .eq('notified', false);
    if (pendingError) throw pendingError;

    if (!pending || pending.length === 0) {
      return NextResponse.json({ success: true, sent: 0, whatsappPending: 0 });
    }
    // Rows with only a WhatsApp number can't be emailed — they stay "waiting"
    // until the admin taps the WhatsApp button in Admin -> Restock Alerts.
    const whatsappPending = pending.filter((r) => !r.email).length;

    const { subject, html } = restockEmail(product);

    let sent = 0;
    const notifiedIds: string[] = [];
    for (const row of pending) {
      if (!row.email) continue;
      const result = await sendEmail({ to: row.email, subject, html });
      if (result.success) {
        sent += 1;
        notifiedIds.push(row.id);
      }
    }

    if (notifiedIds.length > 0) {
      await supabase
        .from('stock_notifications')
        .update({ notified: true, notified_at: new Date().toISOString() })
        .in('id', notifiedIds);
    }

    return NextResponse.json({ success: true, sent, total: pending.length, whatsappPending });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to send restock notifications' }, { status: 500 });
  }
}
