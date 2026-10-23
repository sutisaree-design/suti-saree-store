import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/supabase-server-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { sendEmail } from '@/lib/email';
import { affiliateApplicationStatusEmail } from '@/lib/email-templates';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I — avoids typos when shared verbally

function randomCode(length = 8): string {
  let out = '';
  for (let i = 0; i < length; i++) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return out;
}

// GET — the logged-in customer's affiliate profile (null if they
// haven't applied yet) plus a small earnings summary computed from
// orders they referred.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Please log in first' }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();

  try {
    const { data: profile, error: profileErr } = await supabase
      .from('affiliates')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();
    if (profileErr) throw profileErr;

    if (!profile) {
      return NextResponse.json({
        profile: null,
        earnings: {
          totalOrders: 0,
          totalSales: 0,
          totalCommission: 0,
          pendingOrders: 0,
          pendingDeliveryCommission: 0,
          inReturnWindowCommission: 0,
          eligibleCommission: 0,
          paidCommission: 0,
        },
      });
    }

    const { data: orders, error: ordersErr } = await supabase
      .from('orders')
      .select('total_amount, affiliate_commission_amount, status, affiliate_payout_status')
      .eq('affiliate_id', profile.id);
    if (ordersErr) throw ordersErr;

    const totalOrders = orders?.length ?? 0;
    const totalSales = (orders ?? []).reduce((sum, o) => sum + (o.total_amount || 0), 0);
    const totalCommission = (orders ?? []).reduce(
      (sum, o) => sum + (o.affiliate_commission_amount || 0),
      0
    );
    const pendingOrders = (orders ?? []).filter(
      (o) => !['delivered', 'cancelled', 'failed'].includes(o.status)
    ).length;

    // Payout-stage breakdown of affiliate_commission_amount — what's
    // still waiting on delivery, what's in the return window, what's
    // eligible but not yet paid, and what's already been paid out by
    // the admin (see affiliate_payouts table).
    const sumWhere = (statuses: string[]) =>
      (orders ?? [])
        .filter((o) => statuses.includes(o.affiliate_payout_status || ''))
        .reduce((sum, o) => sum + (o.affiliate_commission_amount || 0), 0);

    const pendingDeliveryCommission = sumWhere(['pending_delivery']);
    const inReturnWindowCommission = sumWhere(['in_return_window']);
    const eligibleCommission = sumWhere(['eligible']);
    const paidCommission = sumWhere(['paid']);

    return NextResponse.json({
      profile,
      earnings: {
        totalOrders,
        totalSales,
        totalCommission,
        pendingOrders,
        pendingDeliveryCommission,
        inReturnWindowCommission,
        eligibleCommission,
        paidCommission,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load affiliate data';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST — apply to join the affiliate program using the SAME logged-in
// account (no new email/signup required). Auto-approved immediately on
// apply (no admin review step) — generates a unique referral code and
// the affiliate can start referring right away.
export async function POST() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Please log in first' }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();

  try {
    const { data: existing } = await supabase
      .from('affiliates')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();
    if (existing) {
      return NextResponse.json({ profile: existing });
    }

    // Generate a unique code, retrying on the rare collision.
    let code = '';
    let created: any = null;
    for (let attempt = 0; attempt < 5 && !created; attempt++) {
      code = randomCode();
      const { data, error } = await supabase
        .from('affiliates')
        .insert({ user_id: user.id, code, status: 'approved' })
        .select('*')
        .maybeSingle();
      if (!error && data) {
        created = data;
      } else if (error && error.code !== '23505') {
        // Anything other than a unique-constraint violation is a real failure.
        throw error;
      }
    }

    if (!created) {
      throw new Error('Could not generate a unique affiliate code, please try again');
    }

    // Fire the same "approved" email an admin approval would normally
    // trigger (see app/api/admin/affiliates/route.ts) — awaited, but
    // wrapped so an email failure never blocks the apply response.
    try {
      if (user.email) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', user.id)
          .maybeSingle();
        const { subject, html } = affiliateApplicationStatusEmail({
          name: profile?.full_name || 'there',
          status: 'approved',
          commission_percent: created.commission_percent,
        });
        await sendEmail({ to: user.email, subject, html });
      }
    } catch (emailErr) {
      console.error('[affiliate apply] approval email failed:', emailErr);
    }

    return NextResponse.json({ profile: created });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to apply for the affiliate program';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// PUT — update the affiliate's payout details (UPI ID + account
// holder name — where the admin should send commission once an order
// is delivered, clears the return window, and is marked eligible).
// Commission % is admin-controlled only, not editable here.
export async function PUT(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Please log in first' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const updates: Record<string, any> = { updated_at: new Date().toISOString() };

  if (body?.payout_upi_id !== undefined) {
    updates.payout_upi_id = String(body.payout_upi_id).trim() || null;
  }
  if (body?.payout_account_holder !== undefined) {
    updates.payout_account_holder = String(body.payout_account_holder).trim() || null;
  }

  const supabase = getSupabaseAdmin();

  try {
    const { error } = await supabase.from('affiliates').update(updates).eq('user_id', user.id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update payout details';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
