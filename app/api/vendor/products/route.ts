import { NextResponse } from 'next/server';
import { getCurrentUser, getSupabaseServer } from '@/lib/supabase-server-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { suggestVendorProductPrice } from '@/lib/ai-pricing';
import { computeVendorPriceBreakdown } from '@/lib/vendor-pricing';
import { fetchShippingSettings } from '@/lib/pincode-api';
import { runStuckVendorListingsJob } from '@/lib/cron-jobs';
import { buildSlug } from '@/lib/slug-utils';

// The self-healing stuck-listings safety net below (runStuckVendorListingsJob)
// now actually retries AI generation (up to ~50s) for a small batch of
// recovered products instead of an instant bare-publish — needs the same
// 60s (Vercel Hobby max) budget as /api/vendor/ai-process/[id], or the
// platform would kill this GET request before the recovery finishes.
export const maxDuration = 60;

// Fields the VENDOR is ever allowed to see about their own submissions.
// Deliberately excludes vendor_id (redundant — it's their own id anyway)
// and anything that would matter for other vendors. This route is never
// used by customer-facing pages.
const VENDOR_PRODUCT_COLUMNS = [
  'id', 'name', 'slug', 'images', 'fabric', 'category_name',
  'available_quantity', 'vendor_expected_price', 'ai_suggested_price',
  'final_price', 'is_dead_stock', 'approval_status', 'barcode',
  'rejection_reason', 'created_at',
].join(', ');

// GET — everything the logged-in vendor has ever submitted, newest
// first. RLS (own_select_vendor_products, Phase 2 migration) already
// restricts this to their own rows even without the .eq() below —
// kept explicit for clarity.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Please log in first' }, { status: 401 });
  }

  const supabase = await getSupabaseServer();

  try {
    const { data: vendor, error: vendorErr } = await supabase
      .from('vendors')
      .select('id, status')
      .eq('user_id', user.id)
      .maybeSingle();
    if (vendorErr) throw vendorErr;
    if (!vendor) {
      return NextResponse.json({ error: 'No vendor profile found for this account' }, { status: 403 });
    }
    // Phase 4C off-boarding (point 5c): a closed/suspended vendor's
    // dashboard access must actually stop server-side.
    if (vendor.status === 'suspended') {
      return NextResponse.json({ error: 'Your vendor account has been suspended' }, { status: 403 });
    }

    // Self-healing safety net (belt-and-suspenders alongside the
    // /api/cron/stuck-vendor-listings route): this project's crons are
    // declared in vercel.json, which is a Vercel-only config file and is
    // silently ignored on Netlify (the platform this app is actually
    // deployed on — see the Netlify-specific timeout notes in
    // lib/vendor-ai-listing.ts). That meant runStuckVendorListingsJob()
    // never actually ran in production, so any product whose
    // fire-and-forget AI call died mid-flight stayed stuck in
    // 'pending_review' ("Processing...") forever. Running it here means
    // it fires every time a vendor opens their Products tab, independent
    // of whether any external/platform cron is wired up at all. It's a
    // cheap, indexed query so this adds negligible latency to the page.
    try {
      await runStuckVendorListingsJob();
    } catch (stuckErr) {
      console.error('[vendor/products GET] stuck-listing safety net failed', stuckErr);
    }

    const { data, error } = await supabase
      .from('products')
      .select(VENDOR_PRODUCT_COLUMNS)
      .eq('vendor_id', vendor.id)
      .order('created_at', { ascending: false });
    if (error) throw error;

    return NextResponse.json({ products: data ?? [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load your products';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST — publishes a new product straight to the live site.
//
// - approval_status is always forced to 'live' here — never trusted
//   from the request body. There is deliberately no admin review step:
//   the vendor's submission goes live immediately on the storefront
//   (products-api / products-api-server / sitemap all query
//   .eq('approval_status', 'live')).
// - barcode is never supplied by the vendor; the Phase 2 migration's
//   trg_products_set_barcode trigger auto-generates it on insert.
// - price is set from, in order: the vendor's expected price, else the
//   rule-based AI suggestion (lib/ai-pricing.ts, computed BEFORE insert
//   since the product needs a real price the moment it goes live), else
//   a safe fallback so nothing ever goes live at ₹0.
// - final_price / ai_suggested_price are still saved for reference (and
//   are still admin-editable from Admin > Products if a price ever
//   needs correcting), but nothing blocks the listing from being live
//   in the meantime.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Please log in first' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const name = String(body?.name || '').trim();
  const fabric = String(body?.fabric || '').trim();
  const category_name = String(body?.category_name || '').trim();
  const category_id = body?.category_id ? String(body.category_id) : null;
  const images = Array.isArray(body?.images) ? body.images.filter((u: unknown) => typeof u === 'string' && u) : [];
  const available_quantity = Number(body?.available_quantity);
  const is_dead_stock = Boolean(body?.is_dead_stock);
  const vendor_return_consent = body?.vendor_return_consent === true;
  const vendor_expected_price =
    body?.vendor_expected_price === '' || body?.vendor_expected_price === null || body?.vendor_expected_price === undefined
      ? null
      : Number(body.vendor_expected_price);

  if (!name || !fabric || !category_name) {
    return NextResponse.json({ error: 'name, fabric and category are required' }, { status: 400 });
  }
  if (images.length === 0) {
    return NextResponse.json({ error: 'At least one product photo is required' }, { status: 400 });
  }
  if (!Number.isFinite(available_quantity) || available_quantity < 0) {
    return NextResponse.json({ error: 'Quantity must be a non-negative number' }, { status: 400 });
  }
  if (vendor_expected_price !== null && (!Number.isFinite(vendor_expected_price) || vendor_expected_price < 0)) {
    return NextResponse.json({ error: 'Expected price must be a non-negative number' }, { status: 400 });
  }
  if (!vendor_return_consent) {
    return NextResponse.json(
      { error: 'Please accept the return policy: if this product is returned 2 times, it goes back to you and the cost is deducted from your next settlement.' },
      { status: 400 }
    );
  }

  const supabase = await getSupabaseServer();

  try {
    const { data: vendor, error: vendorErr } = await supabase
      .from('vendors')
      .select('id, status')
      .eq('user_id', user.id)
      .maybeSingle();
    if (vendorErr) throw vendorErr;
    if (!vendor) {
      return NextResponse.json({ error: 'No vendor profile found for this account' }, { status: 403 });
    }
    if (vendor.status !== 'approved') {
      return NextResponse.json(
        { error: 'Only approved vendors can list products. Check your application status.' },
        { status: 403 }
      );
    }

    // Part 3 — rule-based AI price suggestion. Computed BEFORE insert
    // now (used to run after, back when submissions sat in
    // 'pending_review' and an admin set the real price before it ever
    // went live). Since this route publishes the product immediately,
    // we need a real price up front. Never throws — see ai-pricing.ts.
    // Kept as a fallback path only now (see livePrice below) — a vendor
    // who gives a price gets the real markup calculation instead.
    const { suggested_price } = await suggestVendorProductPrice(getSupabaseAdmin(), {
      category_name,
      fabric,
      vendor_expected_price,
      is_dead_stock,
    });

    // Live price shown to customers. The vendor's own number
    // (`vendor_expected_price`) is their ASKING/COST price, never the
    // website price directly — see lib/vendor-pricing.ts for why:
    // both shipping legs (vendor -> warehouse, warehouse -> customer)
    // and the platform's markup % (Admin > Settings > Profit Estimate,
    // same entry/mid/premium tiers used on the admin Add/Edit Product
    // form) get added on top. Falls back to the AI suggestion, then a
    // safe default, only when the vendor left the price blank.
    const FALLBACK_PRICE = 999;
    let livePrice: number;
    if (vendor_expected_price != null) {
      const shippingSettings = await fetchShippingSettings();
      const breakdown = computeVendorPriceBreakdown(vendor_expected_price, shippingSettings);
      livePrice = Math.max(0, breakdown.websitePrice);
    } else {
      livePrice = Math.max(0, Math.round(suggested_price ?? FALLBACK_PRICE));
    }

    const insertPayload = {
      name,
      slug: buildSlug(name),
      price: livePrice,
      category_id,
      category_name,
      fabric,
      colors: [],
      sizes: ['Free Size'],
      images,
      gender: 'female',
      age_group: 'adult',
      highlights: {},
      stock_quantity: available_quantity,
      low_stock_threshold: 5,
      // Do NOT fabricate a 4.5 rating for a product with zero reviews --
      // that's a fake trust signal and violates Google's Misrepresentation
      // policy. Start at 0 until real reviews come in.
      rating: 0,
      reviews: 0,
      featured: false,
      in_stock: available_quantity > 0,

      vendor_id: vendor.id,
      // Start in pending_review — the /api/vendor/ai-process/[id] route will
      // run AI enrichment in the background and flip this to 'live' when done.
      // We deliberately do NOT set 'live' here so the product doesn't appear
      // on the storefront before AI has filled in the description, highlights,
      // etc. The admin client is required because RLS only allows vendors to
      // insert rows with approval_status IN ('draft', 'pending_review').
      approval_status: 'pending_review' as const,
      vendor_expected_price,
      available_quantity,
      is_dead_stock,
      vendor_return_consent: true,
      vendor_return_consent_at: new Date().toISOString(),
      final_price: livePrice,
      ai_suggested_price: suggested_price,
    };

    // NOTE: this insert deliberately uses getSupabaseAdmin() (service
    // role), not the RLS-authenticated `supabase` client used above.
    // RLS's own_insert_vendor_products policy (Phase 2 migration) only
    // allows a vendor to insert rows with approval_status IN ('draft',
    // 'pending_review') — since this route now publishes straight to
    // 'live' with no admin review step, the RLS client would reject
    // the insert. Vendor identity + 'approved' status were already
    // checked above, so this is a deliberate, already-authorized
    // elevated write — same pattern as the ai_suggested_price patch
    // used to be (before it moved into this same insert).
    const admin = getSupabaseAdmin();

    let { data: created, error } = await admin
      .from('products')
      .insert(insertPayload)
      .select(VENDOR_PRODUCT_COLUMNS)
      .single();

    // Extremely unlikely slug collision — retry once with a fresh suffix.
    if (error?.code === '23505' && error.message?.includes('slug')) {
      const retry = await admin
        .from('products')
        .insert({ ...insertPayload, slug: buildSlug(name) })
        .select(VENDOR_PRODUCT_COLUMNS)
        .single();
      created = retry.data;
      error = retry.error;
    }
    if (error) throw error;

    return NextResponse.json({ product: created });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to submit product';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
