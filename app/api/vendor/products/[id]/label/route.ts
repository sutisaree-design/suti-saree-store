import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getCurrentUser, getSupabaseServer } from '@/lib/supabase-server-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { verifyAdminToken, ADMIN_SESSION_COOKIE } from '@/lib/admin-auth';
import { generateProductLabelPdf, type ProductLabelInput } from '@/lib/product-label-pdf';

// GET — printable barcode label PDF for one vendor product.
//
// Callable by:
//  - the vendor who owns the product (RLS-authenticated session), or
//  - an admin (admin_session cookie), e.g. to reprint a lost label.
//
// If the product has per-variant stock (product_variant_units — see
// the Phase 2 migration), one label per variant is generated (each
// with its own barcode), since barcode/QC tracking happens at the
// variant level whenever a product has more than one colour/size. A
// single-variant product gets one label using the product's own
// barcode.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const adminCookie = cookies().get(ADMIN_SESSION_COOKIE)?.value ?? null;
  const isAdmin = (await verifyAdminToken(adminCookie)).valid;

  const user = isAdmin ? null : await getCurrentUser();
  if (!isAdmin && !user) {
    return NextResponse.json({ error: 'Please log in first' }, { status: 401 });
  }

  // Admin uses the service-role client (bypasses RLS, e.g. to reprint
  // any vendor's label); a vendor uses their own RLS-authenticated
  // session, which own_select_vendor_products already restricts to
  // their own rows (Phase 2 migration).
  const supabase = isAdmin ? getSupabaseAdmin() : await getSupabaseServer();

  try {
    const { data: product, error: productErr } = await supabase
      .from('products')
      .select('id, name, barcode, vendor_id')
      .eq('id', params.id)
      .maybeSingle();
    if (productErr) throw productErr;
    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }
    if (!product.vendor_id) {
      return NextResponse.json({ error: 'This product has no vendor barcode to print' }, { status: 400 });
    }

    // Explicit ownership check for the non-admin path — RLS already
    // enforces this on the query above, but failing loudly here means
    // this route stays correct even if that policy is ever changed.
    if (!isAdmin) {
      const { data: vendor, error: vendorErr } = await supabase
        .from('vendors')
        .select('id')
        .eq('user_id', user!.id)
        .maybeSingle();
      if (vendorErr) throw vendorErr;
      if (!vendor || vendor.id !== product.vendor_id) {
        return NextResponse.json({ error: 'Not authorized to print this label' }, { status: 403 });
      }
    }

    if (!product.barcode) {
      return NextResponse.json({ error: 'Barcode not yet assigned for this product' }, { status: 400 });
    }

    // Service-role for the rest — the vendor's own vendors/business_name
    // lookup and product_variant_units are both internal-only data the
    // RLS-authenticated client can already read for its own rows, but
    // using the admin client here keeps this identical for both callers.
    const admin = getSupabaseAdmin();

    const { data: vendorRow, error: vendorRowErr } = await admin
      .from('vendors')
      .select('business_name')
      .eq('id', product.vendor_id)
      .maybeSingle();
    if (vendorRowErr) throw vendorRowErr;

    const { data: variantUnits, error: variantErr } = await admin
      .from('product_variant_units')
      .select('barcode, variant_label')
      .eq('product_id', product.id)
      .order('created_at', { ascending: true });
    if (variantErr) throw variantErr;

    const vendorName = vendorRow?.business_name || 'Vendor';

    const labels: ProductLabelInput[] =
      variantUnits && variantUnits.length > 0
        ? variantUnits.map((v) => ({
            barcode: v.barcode,
            product_name: product.name,
            vendor_name: vendorName,
            variant_label: v.variant_label,
          }))
        : [{ barcode: product.barcode, product_name: product.name, vendor_name: vendorName }];

    const pdfBytes = await generateProductLabelPdf(labels);

    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="label-${product.barcode}.pdf"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to generate label';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
