import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { sendEmail } from '@/lib/email';
import { giftCardEmail } from '@/lib/email-templates';
import { DEFAULT_GIFT_CARD_SETTINGS, type GiftCardSettings } from '@/lib/giftcards-api';

// POST — step 2 of buying a gift card, called from the gift-cards page
// right after Razorpay's checkout handler fires. Re-verifies the
// signature here (never trusts a client-reported "verified" flag
// alone) before issuing a single rupee of balance.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { giftCardId, razorpay_order_id, razorpay_payment_id, razorpay_signature } = body || {};

  if (!giftCardId || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return NextResponse.json({ error: 'Missing required payment fields' }, { status: 400 });
  }

  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keySecret) {
    return NextResponse.json({ error: 'Razorpay key secret not configured' }, { status: 500 });
  }

  const expectedSignature = crypto
    .createHmac('sha256', keySecret)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest('hex');

  if (expectedSignature !== razorpay_signature) {
    return NextResponse.json({ error: 'Payment signature verification failed' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  try {
    const { data: card, error: cardErr } = await supabase
      .from('gift_cards')
      .select('*')
      .eq('id', giftCardId)
      .maybeSingle();
    if (cardErr) throw cardErr;
    if (!card) {
      return NextResponse.json({ error: 'Gift card not found' }, { status: 404 });
    }

    // Idempotent — if this card was already issued (e.g. handler fired
    // twice), just return its current state instead of double-crediting.
    if (card.status !== 'pending') {
      return NextResponse.json({ code: card.code, balance: card.balance });
    }

    const { data: settingsRow } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'gift_card_program')
      .maybeSingle();
    const settings: GiftCardSettings = {
      ...DEFAULT_GIFT_CARD_SETTINGS,
      ...((settingsRow?.value as Partial<GiftCardSettings>) ?? {}),
    };

    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + settings.expiry_months);

    await supabase
      .from('gift_cards')
      .update({
        razorpay_order_id,
        razorpay_payment_id,
        expires_at: expiresAt.toISOString(),
      })
      .eq('id', giftCardId);

    // Trigger (apply_gift_card_transaction) picks this up and sets
    // balance = initial_value, status = 'active'.
    const { error: txnErr } = await supabase.from('gift_card_transactions').insert({
      gift_card_id: giftCardId,
      amount: card.initial_value,
      type: 'issue',
      reason: 'Purchased online',
    });
    if (txnErr) throw txnErr;

    const recipientTo = card.recipient_email || card.purchaser_email;
    if (recipientTo) {
      const { subject, html } = giftCardEmail({
        code: card.code,
        amount: card.initial_value,
        recipientName: card.recipient_name,
        purchaserName: card.purchaser_name,
        message: card.message,
        expiresAt: expiresAt.toISOString(),
      });
      await sendEmail({ to: recipientTo, subject, html }).catch(() => {});
    }

    return NextResponse.json({ code: card.code, balance: card.initial_value });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to confirm gift card purchase';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
