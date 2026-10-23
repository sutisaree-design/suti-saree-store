import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/supabase-server-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import type { RedeemStoreCreditResult } from '@/lib/store-credit-api';

// POST — checkout "apply store credit" step. Runs server-side with the
// service-role client on purpose: store_credits SELECT is locked to the
// owning customer only, and the actual redeem (ledger insert + balance
// decrement) must never be trusted to the browser. Clamped to both the
// wallet balance and amountDue, same contract as coupons/gift cards, so
// it can never take the payable total below zero.
//
// NOTE: this route records the redeem in the ledger immediately. If your
// checkout flow can still fail after this call (e.g. payment declines),
// wire a matching refund/void call before order confirmation — same
// pattern gift cards already follow via /api/giftcards/confirm.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json<RedeemStoreCreditResult>({ ok: false, error: 'Please log in to use store credit' });
  }

  const body = await req.json().catch(() => ({}));
  const amountDue = typeof body?.amountDue === 'number' ? body.amountDue : 0;
  if (amountDue <= 0) {
    return NextResponse.json<RedeemStoreCreditResult>({ ok: false, error: 'Nothing left to redeem this against' });
  }

  const supabase = getSupabaseAdmin();

  const { data: creditRow } = await supabase
    .from('store_credits')
    .select('balance')
    .eq('user_id', user.id)
    .maybeSingle();

  const balance = Number(creditRow?.balance) || 0;
  if (balance <= 0) {
    return NextResponse.json<RedeemStoreCreditResult>({ ok: false, error: 'No store credit balance available' });
  }

  const applied = Math.max(0, Math.min(balance, Math.round(amountDue * 100) / 100));
  if (applied <= 0) {
    return NextResponse.json<RedeemStoreCreditResult>({ ok: false, error: 'Nothing left to redeem this against' });
  }

  const remainingBalance = Math.round((balance - applied) * 100) / 100;

  const { error: updateErr } = await supabase
    .from('store_credits')
    .update({ balance: remainingBalance, updated_at: new Date().toISOString() })
    .eq('user_id', user.id);
  if (updateErr) {
    return NextResponse.json<RedeemStoreCreditResult>({ ok: false, error: 'Could not apply store credit right now' });
  }

  await supabase.from('store_credit_ledger').insert({
    user_id: user.id,
    amount: -applied,
    type: 'redeem',
    reason: 'Applied at checkout',
  });

  return NextResponse.json<RedeemStoreCreditResult>({ ok: true, applied, remainingBalance });
}
