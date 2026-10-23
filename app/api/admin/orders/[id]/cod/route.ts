import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAdminToken, ADMIN_SESSION_COOKIE } from '@/lib/admin-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

// ---------------------------------------------------------------------
// Phase 4A point 4 — COD reconciliation. Backend action only, no admin
// UI screen yet (that's Phase 4B); use this to flag an order manually
// while testing, or wire a courier-remittance webhook to it later.
//
// Body: { cod_collected_by_courier?: boolean, cod_remitted_to_us?: boolean }
// Uses the service-role client so the Phase 4A guard trigger
// (guard_order_cod_fields) allows the write — the `orders` table's
// underlying anon UPDATE policy is fully open, same standing gap noted
// in the Phase 3A migration, which is exactly why that guard exists.
// ---------------------------------------------------------------------

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const cookie = cookies().get(ADMIN_SESSION_COOKIE)?.value ?? null;
  const verified = await verifyAdminToken(cookie);
  if (!verified.valid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const update: Record<string, unknown> = {};

  if (typeof body?.cod_collected_by_courier === 'boolean') {
    update.cod_collected_by_courier = body.cod_collected_by_courier;
  }
  if (typeof body?.cod_remitted_to_us === 'boolean') {
    update.cod_remitted_to_us = body.cod_remitted_to_us;
    if (body.cod_remitted_to_us) {
      update.cod_remitted_at = new Date().toISOString();
    }
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json(
      { error: 'Provide cod_collected_by_courier and/or cod_remitted_to_us' },
      { status: 400 }
    );
  }

  const admin = getSupabaseAdmin();
  try {
    const { data, error } = await admin
      .from('orders')
      .update(update)
      .eq('id', params.id)
      .select('id, payment_method, cod_collected_by_courier, cod_remitted_to_us, cod_remitted_at')
      .single();
    if (error) throw error;
    return NextResponse.json({ success: true, order: data });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to update COD status' }, { status: 500 });
  }
}
