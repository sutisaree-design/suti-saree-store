import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/supabase-server-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { DEFAULT_GIFT_CARD_SETTINGS, type GiftCardSettings } from '@/lib/giftcards-api';

// Generates a short, human-shareable gift card code, e.g. "GC-7F2KQX9A".
function generateCode() {
  const randomPart = Math.random().toString(36).slice(2, 10).toUpperCase();
  return `GC-${randomPart}`;
}

// POST — step 1 of buying a gift card. Creates a 'pending' row (0
// balance, not redeemable) so we have a stable id to hand Razorpay as
// the receipt/internalOrderId. The card only becomes spendable once
// /api/giftcards/confirm verifies the payment.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { amount, purchaserName, purchaserEmail, recipientName, recipientEmail, message } = body || {};

  if (!amount || typeof amount !== 'number' || amount < 1) {
    return NextResponse.json({ error: 'A valid gift card amount is required' }, { status: 400 });
  }
  if (!purchaserEmail) {
    return NextResponse.json({ error: 'Purchaser email is required' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  try {
    const { data: settingsRow } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'gift_card_program')
      .maybeSingle();
    const settings: GiftCardSettings = {
      ...DEFAULT_GIFT_CARD_SETTINGS,
      ...((settingsRow?.value as Partial<GiftCardSettings>) ?? {}),
    };

    if (!settings.enabled) {
      return NextResponse.json({ error: 'Gift cards are not available right now' }, { status: 400 });
    }

    const user = await getCurrentUser();

    let card: { id: string } | null = null;
    for (let attempt = 0; attempt < 5 && !card; attempt++) {
      const code = generateCode();
      const { data: inserted, error: insertErr } = await supabase
        .from('gift_cards')
        .insert({
          code,
          initial_value: Math.round(amount),
          balance: 0,
          status: 'pending',
          purchased_by_user_id: user?.id ?? null,
          purchaser_name: purchaserName || null,
          purchaser_email: purchaserEmail,
          recipient_name: recipientName || null,
          recipient_email: recipientEmail || null,
          message: message || null,
        })
        .select('id')
        .maybeSingle();
      if (!insertErr && inserted) {
        card = inserted;
      } else if (insertErr && !/duplicate|unique/i.test(insertErr.message)) {
        throw insertErr;
      }
    }

    if (!card) {
      return NextResponse.json({ error: 'Could not generate a gift card code, please try again' }, { status: 500 });
    }

    return NextResponse.json({ giftCardId: card.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to start gift card purchase';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
