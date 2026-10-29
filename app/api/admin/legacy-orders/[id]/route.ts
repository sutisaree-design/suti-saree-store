import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { ADMIN_SESSION_COOKIE, verifyAdminToken } from '@/lib/admin-auth';
import { getLegacyOrderDetail } from '@/lib/legacy-orders-api';

// READ-ONLY. Admin-only. Never sends any email / WhatsApp / notification.
export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  ctx: { params: { id: string } | Promise<{ id: string }> }
) {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value ?? null;
  const auth = await verifyAdminToken(token);
  if (!auth.valid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: rawId } = await Promise.resolve(ctx.params);
  if (!/^\d+$/.test(rawId)) {
    return NextResponse.json({ error: 'Invalid order id' }, { status: 400 });
  }
  const id = parseInt(rawId, 10);
  if (!Number.isSafeInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'Invalid order id' }, { status: 400 });
  }

  try {
    const order = await getLegacyOrderDetail(id);
    if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    return NextResponse.json({ order });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Failed to load order' }, { status: 500 });
  }
}
