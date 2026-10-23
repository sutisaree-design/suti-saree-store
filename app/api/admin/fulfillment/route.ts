import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import {
  requireAdmin,
  ADMIN_FULFILLMENT_COLUMNS,
  shapeAdminFulfillmentRow,
} from '@/lib/admin-fulfillment-shared';

// ---------------------------------------------------------------------
// Phase 3C — Admin "Stock Receiving" queue.
//
// Returns every vendor-sourced order item that has left the vendor
// (picked_from_vendor) or moved further — i.e. everything Phase 3C's
// admin panel is responsible for. Earlier stages (placed,
// vendor_accepted) are Phase 3B's vendor-dashboard concern, not this
// screen's. The panel groups these into its Receiving / Quality Check /
// Quality Hold / Pack / Ship / Shipped tabs client-side by `stage` (and,
// within received_at_warehouse, by whether qc_checked_at is set yet).
// ---------------------------------------------------------------------

const RELEVANT_STAGES = [
  'picked_from_vendor',
  'received_at_warehouse',
  'quality_hold',
  'packed',
  'shipped_to_customer',
  'delivered',
];

export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = getSupabaseAdmin();

  try {
    const { data, error } = await admin
      .from('order_items')
      .select(ADMIN_FULFILLMENT_COLUMNS)
      .not('vendor_id', 'is', null)
      .in('stage', RELEVANT_STAGES)
      .order('stage_updated_at', { ascending: false })
      .limit(300);
    if (error) throw error;

    const items = (data ?? []).map(shapeAdminFulfillmentRow);
    return NextResponse.json({ items });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load the fulfillment queue';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
