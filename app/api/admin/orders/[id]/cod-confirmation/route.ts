import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAdminToken, ADMIN_SESSION_COOKIE } from '@/lib/admin-auth';
import { codConfirmUrl, confirmCodOrderById, getOrCreateCodConfirmToken } from '@/lib/cod-confirmation';

// Admin-only helpers for the COD confirmation flow.
//   GET  -> { url }  the customer's secret one-tap confirm link (created if needed)
//   POST -> { action: 'mark_confirmed' }  admin confirmed it by phone/WhatsApp
async function guard() {
  const cookie = cookies().get(ADMIN_SESSION_COOKIE)?.value ?? null;
  const verified = await verifyAdminToken(cookie);
  return verified.valid;
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  if (!(await guard())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const token = await getOrCreateCodConfirmToken(params.id);
  if (!token) {
    return NextResponse.json(
      { error: 'Could not create the confirmation link (is this a COD order, and has the SQL migration been run?)' },
      { status: 409 }
    );
  }
  const base = (process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin).replace(/\/$/, '');
  return NextResponse.json({ url: codConfirmUrl(token, base) });
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  if (!(await guard())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  if (body?.action !== 'mark_confirmed') {
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  }
  const ok = await confirmCodOrderById(params.id, 'admin');
  if (!ok) return NextResponse.json({ error: 'Order is not a pending, unconfirmed COD order' }, { status: 409 });
  return NextResponse.json({ success: true });
}
