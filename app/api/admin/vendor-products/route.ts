import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAdminToken, ADMIN_SESSION_COOKIE } from '@/lib/admin-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { notifyVendorProductStatus } from '@/lib/vendor-notifications';
import { runStuckVendorListingsJob } from '@/lib/cron-jobs';

// Same reasoning as app/api/vendor/products/route.ts — the stuck-listings
// safety net now retries AI generation (up to ~50s) for a small batch
// before falling back, so this route needs the full Vercel Hobby budget too.
export const maxDuration = 60;

// ---------------------------------------------------------------------
// Phase 2, Part 5 — Admin "Vendor Submissions".
//
// IMPORTANT (see 20260804000000_phase2_vendor_products.sql, section 5):
// trg_guard_vendor_product_fields blocks approval_status / final_price /
// ai_suggested_price / vendor_id / barcode from being changed by anyone
// except the service-role client. This route MUST use getSupabaseAdmin()
// for every write below — the browser-side updateProduct() in
// lib/products-api.ts would be rejected by that trigger for these
// columns. Never route these writes through the anon/authenticated key.
// ---------------------------------------------------------------------

// Full admin view of a vendor-sourced product row, plus the vendor's
// business name (joined) so the panel doesn't need a second round trip.
const ADMIN_VENDOR_PRODUCT_COLUMNS = [
  'id', 'name', 'slug', 'images', 'fabric', 'category_name',
  'available_quantity', 'quantity_last_updated_at',
  'vendor_expected_price', 'ai_suggested_price', 'final_price', 'price',
  'is_dead_stock', 'approval_status', 'barcode', 'rejection_reason',
  'vendor_id', 'vendor_edit_count', 'created_at',
  'vendors(business_name, email, whatsapp, phone)',
].join(', ');

async function requireAdmin() {
  const cookie = cookies().get(ADMIN_SESSION_COOKIE)?.value ?? null;
  const verified = await verifyAdminToken(cookie);
  return verified.valid;
}

// GET — every vendor-sourced product (vendor_id IS NOT NULL), newest
// first. Optional ?status=pending_review|awaiting_stock|live|rejected
// filters server-side; omit it to get all of them (the panel does its
// own tab-based filtering on top of this for instant tab switches).
export async function GET(req: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');

  const supabase = getSupabaseAdmin();

  // Same self-healing safety net as /api/vendor/products — see the
  // comment there. This app's cron schedule lives in vercel.json, which
  // Netlify (the actual host) never reads, so the dedicated cron route
  // never fired in production. Running it here means the admin "Manage
  // Products" screen self-heals any product stuck in pending_review the
  // moment it's opened, regardless of hosting/cron setup.
  try {
    await runStuckVendorListingsJob();
  } catch (stuckErr) {
    console.error('[admin/vendor-products GET] stuck-listing safety net failed', stuckErr);
  }

  try {
    let query = supabase
      .from('products')
      .select(ADMIN_VENDOR_PRODUCT_COLUMNS)
      .not('vendor_id', 'is', null)
      .order('created_at', { ascending: false });

    if (status && ['draft', 'pending_review', 'awaiting_stock', 'live', 'rejected'].includes(status)) {
      query = query.eq('approval_status', status);
    }

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ products: data ?? [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load vendor submissions';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// PUT — two actions on a single vendor-submitted product:
//   { id, action: 'update_price', final_price }
//     Admin edits/confirms the price. Doesn't touch approval_status —
//     works on a product in any status (pending_review, live, etc.).
//   { id, action: 'reject', rejection_reason }
//     rejection_reason is mandatory — sets approval_status -> 'rejected'.
//     Kept as a manual safety valve (e.g. a policy-violating photo) even
//     though publishing itself is now fully automatic — see note below.
//
// NOTE: there used to be a third action, 'approve', which moved a
// product from 'pending_review' to 'awaiting_stock' as a manual admin
// gate before anything could go live. That's been removed entirely:
// every vendor product now goes pending_review -> (AI enrichment) ->
// live automatically with no human step (see
// /api/vendor/ai-process/[id] and lib/vendor-ai-listing.ts). The old
// 'awaiting_stock' status is retired — nothing sets it anymore, and
// runStuckVendorListingsJob() (lib/cron-jobs.ts) force-publishes any
// leftover rows still sitting in it from the old flow.
export async function PUT(req: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const id = body?.id as string | undefined;
  const action = body?.action as string | undefined;

  if (!id || !action) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  try {
    const { data: existing, error: fetchErr } = await supabase
      .from('products')
      .select('id, name, final_price, vendor_id, vendors(business_name, email, whatsapp)')
      .eq('id', id)
      .not('vendor_id', 'is', null)
      .maybeSingle();
    if (fetchErr) throw fetchErr;
    if (!existing) {
      return NextResponse.json({ error: 'Vendor product not found' }, { status: 404 });
    }

    if (action === 'update_price') {
      const final_price = Number(body?.final_price);
      if (!Number.isFinite(final_price) || final_price < 0) {
        return NextResponse.json({ error: 'final_price must be a non-negative number' }, { status: 400 });
      }
      const { data: updated, error } = await supabase
        .from('products')
        .update({ final_price })
        .eq('id', id)
        .select(ADMIN_VENDOR_PRODUCT_COLUMNS)
        .single();
      if (error) throw error;
      return NextResponse.json({ success: true, product: updated });
    }

    if (action === 'reject') {
      const rejection_reason = String(body?.rejection_reason || '').trim();
      if (!rejection_reason) {
        return NextResponse.json({ error: 'A rejection reason is required' }, { status: 400 });
      }

      const { data: updated, error } = await supabase
        .from('products')
        .update({
          approval_status: 'rejected',
          rejection_reason,
        })
        .eq('id', id)
        .select(ADMIN_VENDOR_PRODUCT_COLUMNS)
        .single();
      if (error) throw error;

      const vendorInfo = (existing as any).vendors;
      if (vendorInfo) {
        notifyVendorProductStatus({
          business_name: vendorInfo.business_name,
          email: vendorInfo.email,
          whatsapp: vendorInfo.whatsapp,
          product_name: existing.name,
          status: 'rejected',
          rejection_reason,
        }).catch(() => {});
      }

      return NextResponse.json({ success: true, product: updated });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update vendor product';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
