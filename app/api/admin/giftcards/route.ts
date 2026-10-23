import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAdminToken, ADMIN_SESSION_COOKIE } from '@/lib/admin-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { DEFAULT_GIFT_CARD_SETTINGS, type GiftCardSettings } from '@/lib/giftcards-api';

function generateCode() {
  const randomPart = Math.random().toString(36).slice(2, 10).toUpperCase();
  return `GC-${randomPart}`;
}

async function requireAdmin() {
  const cookie = cookies().get(ADMIN_SESSION_COOKIE)?.value ?? null;
  const verified = await verifyAdminToken(cookie);
  return verified.valid;
}

// GET — settings + every issued card (excluding still-pending/unpaid
// purchase attempts) with running totals for the header.
export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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

    const { data: cards, error } = await supabase
      .from('gift_cards')
      .select('*')
      .neq('status', 'pending')
      .order('created_at', { ascending: false });
    if (error) throw error;

    const totals = (cards ?? []).reduce(
      (acc, c) => {
        acc.totalIssued += c.initial_value;
        acc.totalActiveBalance += c.balance;
        acc.totalRedeemed += Math.max(0, c.initial_value - c.balance);
        return acc;
      },
      { totalIssued: 0, totalActiveBalance: 0, totalRedeemed: 0 }
    );

    return NextResponse.json({ settings, cards: cards ?? [], totals });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load gift card data';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// PUT — save gift card program settings (denominations, expiry, on/off)
export async function PUT(req: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const settings = body?.settings as GiftCardSettings | undefined;
  if (!settings) {
    return NextResponse.json({ error: 'Missing settings' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  try {
    const { error } = await supabase
      .from('settings')
      .upsert({ key: 'gift_card_program', value: settings }, { onConflict: 'key' });
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save settings';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST — manually issue a comp/free gift card (no payment involved)
export async function POST(req: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { amount, recipientName, recipientEmail, reason } = body || {};

  if (!amount || typeof amount !== 'number' || amount < 1) {
    return NextResponse.json({ error: 'A valid amount is required' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  try {
    let cardId: string | null = null;
    let code = '';
    for (let attempt = 0; attempt < 5 && !cardId; attempt++) {
      code = generateCode();
      const { data: inserted, error: insertErr } = await supabase
        .from('gift_cards')
        .insert({
          code,
          initial_value: Math.round(amount),
          balance: 0,
          status: 'pending',
          recipient_name: recipientName || null,
          recipient_email: recipientEmail || null,
        })
        .select('id')
        .maybeSingle();
      if (!insertErr && inserted) {
        cardId = inserted.id;
      } else if (insertErr && !/duplicate|unique/i.test(insertErr.message)) {
        throw insertErr;
      }
    }

    if (!cardId) {
      return NextResponse.json({ error: 'Could not generate a gift card code, please retry' }, { status: 500 });
    }

    // Trigger (apply_gift_card_transaction) sets balance = initial_value,
    // status = 'active'.
    const { error: txnErr } = await supabase.from('gift_card_transactions').insert({
      gift_card_id: cardId,
      amount: Math.round(amount),
      type: 'issue',
      reason: reason || 'Manual admin issue',
    });
    if (txnErr) throw txnErr;

    return NextResponse.json({ success: true, code });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to issue gift card';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// PATCH — deactivate a card (zeroes remaining balance, blocks further use)
export async function PATCH(req: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { id } = body || {};
  if (!id) {
    return NextResponse.json({ error: 'Missing gift card id' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  try {
    const { data: card, error: cardErr } = await supabase
      .from('gift_cards')
      .select('balance, status')
      .eq('id', id)
      .maybeSingle();
    if (cardErr) throw cardErr;
    if (!card) return NextResponse.json({ error: 'Gift card not found' }, { status: 404 });

    if (card.balance > 0) {
      const { error: txnErr } = await supabase.from('gift_card_transactions').insert({
        gift_card_id: id,
        amount: -card.balance,
        type: 'deactivate',
        reason: 'Deactivated by admin',
      });
      if (txnErr) throw txnErr;
    } else {
      // Balance already 0 (or never issued) — no ledger movement needed,
      // just flip the status directly.
      await supabase.from('gift_cards').update({ status: 'deactivated' }).eq('id', id);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to deactivate gift card';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
