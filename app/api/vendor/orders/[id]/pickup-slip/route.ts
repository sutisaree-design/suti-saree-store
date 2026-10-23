import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, getSupabaseServer } from '@/lib/supabase-server-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { DEFAULT_DELHIVERY_SETTINGS, type DelhiverySettings } from '@/lib/delhivery-api';
import { generateVendorPickupSlipPdf } from '@/lib/vendor-pickup-slip-pdf';

// ---------------------------------------------------------------------
// Vendor Pickup Slip download -- NOT a customer invoice. A vendor ships
// stock TO our warehouse, never to the end customer, so this route only
// ever selects order_items columns (never a join into `orders` for
// customer_name/email/phone/shipping_address) -- same query-level
// masking guarantee as app/api/vendor/orders/route.ts. "Ship To" on the
// generated PDF is always OUR warehouse (Admin -> Settings -> Delhivery
// pickup location), never the customer's address.
// ---------------------------------------------------------------------

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Please log in first' }, { status: 401 });
  }

  const authedSupabase = await getSupabaseServer();
  const { data: vendor, error: vendorErr } = await authedSupabase
    .from('vendors')
    .select('id, business_name, status')
    .eq('user_id', user.id)
    .maybeSingle();
  if (vendorErr) {
    return NextResponse.json({ error: vendorErr.message }, { status: 500 });
  }
  if (!vendor) {
    return NextResponse.json({ error: 'No vendor profile found for this account' }, { status: 403 });
  }
  if (vendor.status === 'suspended') {
    return NextResponse.json({ error: 'Your vendor account has been suspended' }, { status: 403 });
  }

  const admin = getSupabaseAdmin();
  // Explicit column list, order_items only -- see masking note above.
  const { data: item, error: itemErr } = await admin
    .from('order_items')
    .select('id, order_id, vendor_id, product_name, barcode, quantity, price, created_at')
    .eq('id', params.id)
    .maybeSingle();

  if (itemErr) {
    return NextResponse.json({ error: itemErr.message }, { status: 500 });
  }
  if (!item || item.vendor_id !== vendor.id) {
    // Also covers "not this vendor's item" -- returned as 404, not 403,
    // so it doesn't confirm/deny that some other vendor's item exists.
    return NextResponse.json({ error: 'Item not found' }, { status: 404 });
  }

  const [warehouseSetting, storeSetting] = await Promise.all([
    admin.from('settings').select('value').eq('key', 'delhivery').maybeSingle(),
    admin.from('settings').select('value').eq('key', 'store_info').maybeSingle(),
  ]);
  const warehouse: DelhiverySettings = {
    ...DEFAULT_DELHIVERY_SETTINGS,
    ...((warehouseSetting.data?.value as Partial<DelhiverySettings>) || {}),
  };
  const store = (storeSetting.data?.value as Record<string, string>) || {};

  const pdfBytes = await generateVendorPickupSlipPdf(
    {
      order_item_id: item.id,
      order_id: item.order_id,
      product_name: item.product_name,
      barcode: item.barcode,
      quantity: item.quantity,
      price: item.price,
      created_at: item.created_at,
    },
    {
      name: warehouse.pickup_location_name,
      address: warehouse.pickup_address,
      city: warehouse.pickup_city,
      state: warehouse.pickup_state,
      pincode: warehouse.pickup_pincode,
      phone: warehouse.pickup_phone,
    },
    { name: vendor.business_name, id: vendor.id },
    store
  );

  return new NextResponse(Buffer.from(pdfBytes), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="pickup-slip-${item.id.slice(0, 8)}.pdf"`,
      'Cache-Control': 'no-store',
    },
  });
}
