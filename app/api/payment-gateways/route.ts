import { NextResponse } from 'next/server';
import { getPaymentGatewaySettings } from '@/lib/payment-gateways-server';
import { resolveActiveGateway, GATEWAY_LABEL } from '@/lib/payment-gateways';

export const dynamic = 'force-dynamic';

// Public: tells the storefront which gateway (if any) should take a new online payment.
// Contains no secrets -- just the admin's on/off choice.
export async function GET() {
  const s = await getPaymentGatewaySettings();
  const active = resolveActiveGateway(s);
  return NextResponse.json(
    { active, label: active ? GATEWAY_LABEL[active] : null, onlineEnabled: active !== null },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
