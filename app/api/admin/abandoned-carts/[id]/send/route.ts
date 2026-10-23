import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAdminToken, ADMIN_SESSION_COOKIE } from '@/lib/admin-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { sendEmail } from '@/lib/email';
import { renderCartRecoveryEmail } from '@/lib/email-templates';
import { createEmailTrackingRecord, instrumentEmailHtml } from '@/lib/email-tracking';
import { getCartRecoverySequenceSettings } from '@/lib/cart-recovery-settings';

// Manual send from Admin -> Abandoned Carts. Body is optional:
//   { subject?, html?, coupon_code? } -- lets the admin override the
// template and/or drop in a coupon code for this one send, on top of
// whatever the automatic sequence would otherwise send next. Leaving
// the body empty (or omitting it) just sends the next default template
// in the sequence, same as before.
//
// Counts as the next step in the sequence either way -- it bumps
// recovery_stage and is logged to abandoned_cart_emails with tracking,
// exactly like an automatic send, so the cron job (runAbandonedCartsJob
// in lib/cron-jobs.ts) won't also send that same step again.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const cookie = cookies().get(ADMIN_SESSION_COOKIE)?.value ?? null;
  const verified = await verifyAdminToken(cookie);
  if (!verified.valid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const body = await req.json().catch(() => ({} as any));
  const customSubject: string | undefined = body?.subject?.trim() || undefined;
  const customHtml: string | undefined = body?.html?.trim() || undefined;
  const couponCode: string | undefined = body?.coupon_code?.trim() || undefined;
  const bodyDiscountType: 'percentage' | 'flat' | undefined = body?.discount_type;
  const bodyDiscountValue: number | undefined =
    typeof body?.discount_value === 'number' ? body.discount_value : undefined;

  try {
    const { data: cart, error } = await supabase
      .from('abandoned_carts')
      .select('*')
      .eq('id', params.id)
      .single();
    if (error || !cart) {
      return NextResponse.json({ error: 'Cart not found' }, { status: 404 });
    }
    if (!cart.email) {
      return NextResponse.json({ error: 'This cart has no email on file' }, { status: 400 });
    }
    if (cart.recovery_stage >= 3) {
      return NextResponse.json(
        { error: 'This cart has already received all 3 recovery emails' },
        { status: 400 }
      );
    }

    const sequenceNumber = (cart.recovery_stage || 0) + 1;

    // When the admin just taps the quick "Send recovery email" / "Send
    // email N" button (no subject/html/coupon typed in), fall back to
    // this step's configured template + coupon + discount from Sequence
    // Settings, same as the automatic cron job would use for this stage
    // -- otherwise the quick button silently sent a bare template with no
    // coupon at all, even when one was configured.
    let discountType: 'percentage' | 'flat' | undefined = bodyDiscountType;
    let discountValue: number | undefined = bodyDiscountValue;
    let effectiveCouponCode = couponCode;
    if (!customSubject && !customHtml && !couponCode) {
      const settings = await getCartRecoverySequenceSettings(supabase);
      const step = settings.steps[sequenceNumber - 1];
      if (step) {
        effectiveCouponCode = step.coupon_code?.trim() || undefined;
        discountType = step.discount_type;
        discountValue = step.discount_value;
      }
    }

    const { subject, html } = renderCartRecoveryEmail(
      { items: Array.isArray(cart.items) ? cart.items : [], cart_value: cart.cart_value },
      {
        subject: customSubject,
        html: customHtml,
        coupon_code: effectiveCouponCode,
        discount_type: discountType,
        discount_value: discountValue,
      },
      sequenceNumber
    );

    let finalHtml = html;
    try {
      const token = await createEmailTrackingRecord({
        cartId: cart.id,
        sequenceNumber,
        subject,
        couponCode: effectiveCouponCode,
      });
      finalHtml = instrumentEmailHtml(html, token);
    } catch (err) {
      console.error('[abandoned-carts/send] failed to create tracking record:', err);
    }

    const result = await sendEmail({ to: cart.email, subject, html: finalHtml });
    if (!result.success) {
      return NextResponse.json({ error: 'Failed to send email' }, { status: 502 });
    }

    await supabase
      .from('abandoned_carts')
      .update({
        recovery_stage: sequenceNumber,
        recovery_email_sent: true,
        recovery_email_sent_at: new Date().toISOString(),
      })
      .eq('id', params.id);

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to send recovery email' }, { status: 500 });
  }
}
