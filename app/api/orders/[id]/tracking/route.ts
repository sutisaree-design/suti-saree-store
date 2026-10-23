import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { trackDelhiveryShipment } from '@/lib/delhivery-api';

// Public (the order UUID is the access token, same as /track/[id]).
// Returns live tracking for EVERY parcel of the order in `shipments`, and
// keeps the original single-waybill fields so older callers still work.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const supabase = getSupabaseAdmin();

  const { data: order, error } = await supabase
    .from('orders')
    .select('tracking_number, courier_name, status, items')
    .eq('id', params.id)
    .single();

  if (error || !order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  }

  // Table may not exist yet if the migration hasn't been applied -> ignore the error.
  const { data: shipmentRows } = await supabase
    .from('order_shipments')
    .select('*')
    .eq('order_id', params.id)
    .order('shipment_no', { ascending: true });
  const rows = shipmentRows ?? [];

  if (rows.length === 0) {
    if (!order.tracking_number) {
      return NextResponse.json({ tracked: false, status: order.status, scans: [], shipments: [] });
    }
    try {
      const result = await trackDelhiveryShipment(order.tracking_number);
      return NextResponse.json({ ...result, orderStatus: order.status, shipments: [] });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch tracking info';
      return NextResponse.json({ tracked: false, scans: [], error: message, shipments: [] }, { status: 500 });
    }
  }

  const shipments = await Promise.all(
    rows.map(async (row: any) => {
      const live = await trackDelhiveryShipment(row.waybill).catch((err) => ({
        tracked: false,
        scans: [],
        error: err instanceof Error ? err.message : 'Failed to fetch tracking info',
      }));
      return {
        id: row.id,
        shipment_no: row.shipment_no,
        waybill: row.waybill,
        courier_name: row.courier_name,
        items: row.items,
        is_partial: row.is_partial,
        next_shipment_min_days: row.next_shipment_min_days,
        next_shipment_max_days: row.next_shipment_max_days,
        created_at: row.created_at,
        ...live,
      };
    })
  );

  const items = Array.isArray(order.items) ? order.items : [];
  const shippedIdx = new Set<number>();
  rows.forEach((r: any) => (r.item_indexes || []).forEach((i: number) => shippedIdx.add(i)));
  const remainingItems = items.filter((_: any, i: number) => !shippedIdx.has(i));
  const last = rows[rows.length - 1];

  return NextResponse.json({
    tracked: shipments.some((s: any) => s.tracked),
    orderStatus: order.status,
    scans: [],
    shipments,
    remainingItems,
    nextLot:
      remainingItems.length > 0
        ? { minDays: last.next_shipment_min_days ?? 4, maxDays: last.next_shipment_max_days ?? 7 }
        : null,
  });
}
