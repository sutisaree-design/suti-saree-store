import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAdminToken, ADMIN_SESSION_COOKIE } from '@/lib/admin-auth';
import { fetchOrders, deleteOrders } from '@/lib/orders-api';

export async function GET() {
  const cookie = cookies().get(ADMIN_SESSION_COOKIE)?.value ?? null;
  const verified = await verifyAdminToken(cookie);
  if (!verified.valid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const orders = await fetchOrders();
    return NextResponse.json({ orders });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to load orders' }, { status: 500 });
  }
}

// Bulk delete: admin selects one or more rows in the Orders table and hits
// "Delete Selected". Body: { ids: string[] }.
export async function DELETE(req: Request) {
  const cookie = cookies().get(ADMIN_SESSION_COOKIE)?.value ?? null;
  const verified = await verifyAdminToken(cookie);
  if (!verified.valid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const ids = Array.isArray(body?.ids)
    ? body.ids.filter((id: unknown): id is string => typeof id === 'string' && id.length > 0)
    : [];

  if (ids.length === 0) {
    return NextResponse.json({ error: 'No order IDs provided' }, { status: 400 });
  }

  try {
    const deleted = await deleteOrders(ids);
    return NextResponse.json({ success: true, deletedCount: deleted?.length ?? 0 });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to delete orders' }, { status: 500 });
  }
}
