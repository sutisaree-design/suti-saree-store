import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import {
  requireAdmin,
  ADMIN_FULFILLMENT_COLUMNS,
  shapeAdminFulfillmentRow,
} from '@/lib/admin-fulfillment-shared';

// ---------------------------------------------------------------------
// Phase 3C — Admin fulfillment actions (body: { action, ...}).
//
//   receive        -> stage 'picked_from_vendor' -> 'received_at_warehouse'
//                      { photo_url } required (2nd photo-proof)
//   qc             -> stage stays 'received_at_warehouse' (pass) or moves
//                      to 'quality_hold' (fail). Requires tag_removed=true
//                      to pass — this is mandatory, not just recorded.
//                      A defect found here means pickup-leg damage, so
//                      liability is set to 'vendor'.
//   release_hold   -> stage 'quality_hold' -> 'received_at_warehouse',
//                      for a re-check (no automated "Return to Vendor"
//                      flow exists yet — that's Phase 4C).
//   pack           -> stage 'received_at_warehouse' (QC'd + tag removed)
//                      -> 'packed', { photo_url } required (3rd photo-proof)
//   ship           -> stage 'packed' -> 'shipped_to_customer',
//                      { courier_name, tracking_number } — booking itself
//                      is manual (courier's own site/app), this just
//                      records it. Defaults liability to 'own' if not
//                      already 'vendor' (delivery-leg risk from here on).
//   deliver        -> stage 'shipped_to_customer' -> 'delivered' (Phase 4A).
//                      No new fields required — this just confirms
//                      delivery has happened (courier tracking/webhook
//                      isn't wired yet, so mark this manually for now).
//                      The moment stage flips to 'delivered', a DB
//                      trigger (calculate_order_item_settlement_fee(),
//                      supabase/migrations/20260808000000_phase4a_
//                      settlement_schema.sql) computes fee_amount /
//                      vendor_payable_amount automatically — nothing to
//                      do here beyond the stage change itself.
// ---------------------------------------------------------------------

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  const orderItemId = params.id;
  const body = await req.json().catch(() => ({}));
  const action = body?.action as string | undefined;

  try {
    const { data: existing, error: fetchErr } = await admin
      .from('order_items')
      .select('id, stage, liability, qc_tag_removed')
      .eq('id', orderItemId)
      .not('vendor_id', 'is', null)
      .maybeSingle();
    if (fetchErr) throw fetchErr;
    if (!existing) {
      return NextResponse.json({ error: 'Order item not found' }, { status: 404 });
    }

    if (action === 'receive') {
      if (existing.stage !== 'picked_from_vendor') {
        return NextResponse.json(
          { error: `Cannot receive an item in stage "${existing.stage}"` },
          { status: 400 }
        );
      }
      const photo_url = String(body?.photo_url || '').trim();
      if (!photo_url) {
        return NextResponse.json({ error: 'A warehouse-receiving photo is required' }, { status: 400 });
      }

      return await updateAndReturn(admin, orderItemId, {
        stage: 'received_at_warehouse',
        warehouse_received_photo_url: photo_url,
        received_at: new Date().toISOString(),
      });
    }

    if (action === 'qc') {
      if (existing.stage !== 'received_at_warehouse') {
        return NextResponse.json(
          { error: `Cannot run QC on an item in stage "${existing.stage}"` },
          { status: 400 }
        );
      }

      const defect_found = Boolean(body?.defect_found);
      const color_match = Boolean(body?.color_match);
      const fabric_check = ['yes', 'no', 'not_checked'].includes(body?.fabric_check)
        ? body.fabric_check
        : 'not_checked';
      const tag_removed = Boolean(body?.tag_removed);
      const condition_notes = String(body?.condition_notes || '').trim() || null;

      // Tag removal is mandatory — a woven vendor label/sticker left on
      // the item is itself a fail, regardless of the other checks.
      const passed = !defect_found && color_match && tag_removed;

      const update: Record<string, unknown> = {
        qc_defect_found: defect_found,
        qc_color_match: color_match,
        qc_fabric_check: fabric_check,
        qc_tag_removed: tag_removed,
        qc_condition_notes: condition_notes,
        qc_checked_at: new Date().toISOString(),
        stage: passed ? 'received_at_warehouse' : 'quality_hold',
      };

      // Pickup-leg damage discovered at receiving — vendor's risk per
      // the written vendor agreement (Phase 0).
      if (defect_found) {
        update.liability = 'vendor';
      }

      return await updateAndReturn(admin, orderItemId, update);
    }

    if (action === 'release_hold') {
      if (existing.stage !== 'quality_hold') {
        return NextResponse.json(
          { error: `Item is not on quality hold (currently "${existing.stage}")` },
          { status: 400 }
        );
      }
      return await updateAndReturn(admin, orderItemId, {
        stage: 'received_at_warehouse',
        qc_checked_at: null,
      });
    }

    if (action === 'pack') {
      if (existing.stage !== 'received_at_warehouse') {
        return NextResponse.json(
          { error: `Cannot pack an item in stage "${existing.stage}"` },
          { status: 400 }
        );
      }
      if (!existing.qc_tag_removed) {
        return NextResponse.json(
          { error: 'Vendor tag must be removed and replaced before this item can be packed' },
          { status: 400 }
        );
      }
      const photo_url = String(body?.photo_url || '').trim();
      if (!photo_url) {
        return NextResponse.json({ error: 'A packed-item photo is required' }, { status: 400 });
      }

      return await updateAndReturn(admin, orderItemId, {
        stage: 'packed',
        packed_photo_url: photo_url,
        packed_at: new Date().toISOString(),
      });
    }

    if (action === 'ship') {
      if (existing.stage !== 'packed') {
        return NextResponse.json(
          { error: `Cannot ship an item in stage "${existing.stage}"` },
          { status: 400 }
        );
      }
      const courier_name = String(body?.courier_name || '').trim();
      const tracking_number = String(body?.tracking_number || '').trim();
      if (!courier_name || !tracking_number) {
        return NextResponse.json(
          { error: 'Courier name and tracking number are required (enter them after booking manually)' },
          { status: 400 }
        );
      }

      return await updateAndReturn(admin, orderItemId, {
        stage: 'shipped_to_customer',
        shipped_courier_name: courier_name,
        shipped_tracking_number: tracking_number,
        shipped_at: new Date().toISOString(),
        // Delivery-leg risk from here on — only default to 'own' if a
        // failed QC hasn't already pinned this on the vendor.
        liability: existing.liability ?? 'own',
      });
    }

    if (action === 'deliver') {
      if (existing.stage !== 'shipped_to_customer') {
        return NextResponse.json(
          { error: `Cannot mark delivered from stage "${existing.stage}"` },
          { status: 400 }
        );
      }
      return await updateAndReturn(admin, orderItemId, {
        stage: 'delivered',
      });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update this item';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function updateAndReturn(admin: ReturnType<typeof getSupabaseAdmin>, id: string, update: Record<string, unknown>) {
  const { data: updated, error } = await admin
    .from('order_items')
    .update(update)
    .eq('id', id)
    .select(ADMIN_FULFILLMENT_COLUMNS)
    .single();
  if (error) throw error;
  return NextResponse.json({ success: true, item: shapeAdminFulfillmentRow(updated) });
}
