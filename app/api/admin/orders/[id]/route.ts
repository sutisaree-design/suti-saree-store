import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAdminToken, ADMIN_SESSION_COOKIE } from '@/lib/admin-auth';
import { updateOrderStatus, updateOrderContactDetails } from '@/lib/orders-api';

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const cookie = cookies().get(ADMIN_SESSION_COOKIE)?.value ?? null;
  const verified = await verifyAdminToken(cookie);
  if (!verified.valid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { status, customer_email, customer_phone, shipping_address } = body ?? {};

  // Two independent things can be patched here: the order STATUS (existing
  // behaviour), or the customer's contact/shipping DETAILS (new -- lets the
  // admin fix a typo'd phone/address before a shipment goes out). A request
  // can update either or both, but at least one has to be present.
  const hasDetailsUpdate =
    customer_email !== undefined || customer_phone !== undefined || shipping_address !== undefined;

  if (!status && !hasDetailsUpdate) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  try {
    let data: any = null;

    if (hasDetailsUpdate) {
      // Editing contact/shipping details is only meant to happen before the
      // order ships -- once Delhivery has the package, the label is already
      // printed with the old address, so changing it here would just be
      // misleading. Mirrors the `canEditDetails` gate in the admin UI.
      data = await updateOrderContactDetails(params.id, {
        customer_email,
        customer_phone,
        shipping_address,
      });
    }

    if (status) {
      data = await updateOrderStatus(params.id, status);
    }

    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    if (err?.code === 'ORDER_ALREADY_SHIPPED') {
      return NextResponse.json(
        { error: 'This order already has a shipment — contact/address can no longer be edited.' },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: 'Failed to update order' }, { status: 500 });
  }
}
