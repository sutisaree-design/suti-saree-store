import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import type { GiftCard, GiftCardResult } from '@/lib/giftcards-api';

// POST — checkout "apply gift card code" lookup. Runs server-side with
// the service-role client on purpose: gift_cards SELECT is locked down
// to the owning customer only (see migration
// 20260829040000_lock_products_giftcards_loyalty_tickets_reseller_returns.sql),
// so a guest redeeming a card someone else bought them can no longer
// read it directly with the anon key. This route only ever returns a
// single exact code match plus the redeemable amount — never a list,
// never anyone's balance beyond the one code the caller already knows.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const code = typeof body?.code === 'string' ? body.code.trim().toUpperCase() : '';
  const amountDue = typeof body?.amountDue === 'number' ? body.amountDue : 0;

  if (!code) {
    return NextResponse.json<GiftCardResult>({ ok: false, error: 'Enter a gift card code' });
  }

  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from('gift_cards')
    .select('*')
    .eq('code', code)
    .maybeSingle();

  if (error) {
    return NextResponse.json<GiftCardResult>({ ok: false, error: 'Could not validate gift card right now' });
  }
  if (!data) {
    return NextResponse.json<GiftCardResult>({ ok: false, error: 'Invalid gift card code' });
  }

  const giftCard = data as GiftCard;

  if (giftCard.status === 'pending') {
    return NextResponse.json<GiftCardResult>({ ok: false, error: 'This gift card purchase was never completed' });
  }
  if (giftCard.status === 'deactivated') {
    return NextResponse.json<GiftCardResult>({ ok: false, error: 'This gift card has been deactivated' });
  }
  if (giftCard.status === 'redeemed' || giftCard.balance <= 0) {
    return NextResponse.json<GiftCardResult>({ ok: false, error: 'This gift card has no remaining balance' });
  }
  if (giftCard.expires_at && new Date(giftCard.expires_at).getTime() < Date.now()) {
    return NextResponse.json<GiftCardResult>({ ok: false, error: 'This gift card has expired' });
  }

  const redeemable = Math.max(0, Math.min(giftCard.balance, Math.round(amountDue)));
  if (redeemable <= 0) {
    return NextResponse.json<GiftCardResult>({ ok: false, error: 'Nothing left to redeem this against' });
  }

  return NextResponse.json<GiftCardResult>({ ok: true, giftCard, redeemable });
}
