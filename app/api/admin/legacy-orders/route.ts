import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { ADMIN_SESSION_COOKIE, verifyAdminToken } from '@/lib/admin-auth';
import { getLegacyStatusStats, listLegacyOrders } from '@/lib/legacy-orders-api';

// READ-ONLY. Admin-only. Never sends any email / WhatsApp / notification.
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value ?? null;
  const auth = await verifyAdminToken(token);
  if (!auth.valid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);

    if (searchParams.get('stats') === '1') {
      const stats = await getLegacyStatusStats();
      return NextResponse.json({ stats });
    }

    const q = (searchParams.get('q') ?? '').trim().slice(0, 100);
    const status = (searchParams.get('status') ?? '').trim().slice(0, 50);
    const pageRaw = parseInt(searchParams.get('page') ?? '1', 10);
    const sizeRaw = parseInt(searchParams.get('pageSize') ?? '25', 10);
    const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
    const pageSize = Number.isFinite(sizeRaw) && sizeRaw > 0 ? Math.min(100, sizeRaw) : 25;

    const result = await listLegacyOrders({ q, status, page, pageSize });
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Failed to load legacy orders' }, { status: 500 });
  }
}
