import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAdminToken, ADMIN_SESSION_COOKIE } from '@/lib/admin-auth';
import { getDelhiveryRateEstimate } from '@/lib/delhivery-api';

/**
 * Returns live Surface + Express shipping cost estimates for a given
 * destination pincode + weight, using Delhivery's Rate Calculator API.
 * Powers the "Create Shipment" popup so the admin can see cost before
 * confirming (same numbers Delhivery's own "Get AWB Number" screen shows).
 */
export async function POST(req: Request) {
  const cookie = cookies().get(ADMIN_SESSION_COOKIE)?.value ?? null;
  const verified = await verifyAdminToken(cookie);
  if (!verified.valid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { destination_pincode, weight_grams, payment_method } = body || {};

  if (!destination_pincode || !weight_grams) {
    return NextResponse.json(
      { error: 'destination_pincode and weight_grams are required' },
      { status: 400 }
    );
  }

  try {
    const estimates = await getDelhiveryRateEstimate({
      destination_pincode: String(destination_pincode),
      weight_grams: Number(weight_grams),
      payment_method,
    });
    return NextResponse.json({ estimates });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch rate estimate';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
