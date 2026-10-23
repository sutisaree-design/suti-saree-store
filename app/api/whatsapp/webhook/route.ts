import { NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { confirmCodOrderById } from '@/lib/cod-confirmation';

// ---------------------------------------------------------------------
// OPTIONAL -- only works if you use the official WhatsApp Business
// Platform (Meta Cloud API) or a provider that forwards Meta webhooks.
// Messages opened through wa.me links are sent from a normal WhatsApp
// account and CAN'T be read by the website, so without the Cloud API the
// admin uses the "Mark confirmed" button instead.
//
// Env vars (all required for this route to do anything):
//   WHATSAPP_VERIFY_TOKEN  any secret string you also paste in Meta's webhook setup
//   WHATSAPP_APP_SECRET    Meta app secret (used to verify X-Hub-Signature-256)
//
// Safety rules: unsigned / badly-signed requests are rejected; a reply only
// confirms an order when it matches EXACTLY ONE pending, unconfirmed COD
// order for that phone number placed in the last 7 days.
// ---------------------------------------------------------------------

const YES = new Set(['yes', 'y', 'confirm', 'confirmed', 'ok', 'okay', 'haan', 'han', 'ha', 'haa', 'yes confirm', '1', '👍', '✅']);

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const expected = process.env.WHATSAPP_VERIFY_TOKEN;
  if (expected && sp.get('hub.mode') === 'subscribe' && sp.get('hub.verify_token') === expected) {
    return new Response(sp.get('hub.challenge') || '', { status: 200 });
  }
  return new Response('Forbidden', { status: 403 });
}

function validSignature(raw: string, header: string | null): boolean {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret || !header?.startsWith('sha256=')) return false;
  const expected = createHmac('sha256', secret).update(raw).digest('hex');
  const got = header.slice('sha256='.length);
  if (got.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(got), Buffer.from(expected));
}

export async function POST(req: Request) {
  const raw = await req.text();
  if (!validSignature(raw, req.headers.get('x-hub-signature-256'))) {
    return new Response('Invalid signature', { status: 401 });
  }

  try {
    const payload = JSON.parse(raw);
    const messages: any[] = [];
    for (const entry of payload?.entry ?? []) {
      for (const change of entry?.changes ?? []) {
        for (const m of change?.value?.messages ?? []) messages.push(m);
      }
    }

    const supabase = getSupabaseAdmin();
    for (const m of messages) {
      const text = String(
        m?.text?.body ?? m?.button?.text ?? m?.interactive?.button_reply?.title ?? m?.interactive?.button_reply?.id ?? ''
      )
        .trim()
        .toLowerCase();
      if (!YES.has(text)) continue;

      const last10 = String(m?.from ?? '').replace(/\D/g, '').slice(-10);
      if (last10.length !== 10) continue;

      const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
      const { data: candidates } = await supabase
        .from('orders')
        .select('id')
        .eq('payment_method', 'cod')
        .eq('status', 'pending')
        .is('cod_confirmed_at', null)
        .ilike('customer_phone', `%${last10}`)
        .gte('created_at', since);

      if (candidates && candidates.length === 1) {
        await confirmCodOrderById(candidates[0].id, 'whatsapp_reply');
      } else {
        console.log('[whatsapp-webhook] reply not auto-matched, candidates:', candidates?.length ?? 0);
      }
    }
  } catch (err) {
    console.error('[whatsapp-webhook] failed:', err);
  }
  // Always 200 so Meta doesn't retry-storm us.
  return NextResponse.json({ received: true });
}
