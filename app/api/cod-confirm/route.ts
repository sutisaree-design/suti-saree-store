import { NextResponse } from 'next/server';
import { confirmCodOrderByToken, lookupCodConfirmToken } from '@/lib/cod-confirmation';

// Public (token = the credential). GET only READS -- WhatsApp / email link
// scanners prefetch links, so a GET must never confirm anything. The actual
// confirmation is a POST triggered by the customer pressing the button on
// /confirm-order/[token].
const noStore = { 'Cache-Control': 'no-store' };

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get('token') || '';
  const result = await lookupCodConfirmToken(token);
  return NextResponse.json(result, { headers: noStore });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const token = typeof body?.token === 'string' ? body.token : '';
  const result = await confirmCodOrderByToken(token, 'link');
  return NextResponse.json(result, { headers: noStore });
}
