import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAdminToken, ADMIN_SESSION_COOKIE } from '@/lib/admin-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { normalizePaymentGateways, resolveActiveGateway } from '@/lib/payment-gateways';
import { isCashfreeConfigured, getCashfreeMode } from '@/lib/cashfree';

async function requireAdmin() {
  const cookie = cookies().get(ADMIN_SESSION_COOKIE)?.value ?? null;
  const verified = await verifyAdminToken(cookie);
  return verified.valid;
}

// Tells the admin UI whether the API keys for each gateway are actually present in the
// server environment, so they get a warning instead of a broken checkout.
function configStatus() {
  return {
    razorpay: !!process.env.RAZORPAY_KEY_ID && !!process.env.RAZORPAY_KEY_SECRET,
    cashfree: isCashfreeConfigured(),
    cashfreeMode: getCashfreeMode(),
  };
}

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data, error } = await getSupabaseAdmin()
    .from('settings')
    .select('value')
    .eq('key', 'payment_gateways')
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const settings = normalizePaymentGateways(data?.value as any);
  return NextResponse.json({ settings, active: resolveActiveGateway(settings), configured: configStatus() });
}

export async function PUT(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Invalid body' }, { status: 400 });

  const settings = normalizePaymentGateways(body as any);
  const cfg = configStatus();
  if (settings.online_enabled && settings.razorpay_enabled && !cfg.razorpay) {
    return NextResponse.json({ error: 'Razorpay keys are not set on the server (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET).' }, { status: 400 });
  }
  if (settings.online_enabled && settings.cashfree_enabled && !cfg.cashfree) {
    return NextResponse.json({ error: 'Cashfree keys are not set on the server (CASHFREE_APP_ID / CASHFREE_SECRET_KEY).' }, { status: 400 });
  }

  const { error } = await getSupabaseAdmin()
    .from('settings')
    .upsert({ key: 'payment_gateways', value: settings }, { onConflict: 'key' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, settings, active: resolveActiveGateway(settings), configured: cfg });
}
