import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAdminToken, ADMIN_SESSION_COOKIE } from '@/lib/admin-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

async function requireAdmin() {
  const cookie = cookies().get(ADMIN_SESSION_COOKIE)?.value ?? null;
  const verified = await verifyAdminToken(cookie);
  return verified.valid;
}

// GET /api/admin/woocommerce-import/send-campaign/recipients?status=sent|opened|clicked|failed
//
// Backs the clickable Sent/Opened/Clicked/Failed cards in the admin panel
// (section 2, next to the Audience filters) — same underlying
// woocommerce_campaign_sends rows the aggregate counts on those cards
// already come from, just listed out by name/email instead of totalled,
// same idea as the existing Purchased/Cart abandoners/etc audience chips.
export async function GET(req: NextRequest) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const status = req.nextUrl.searchParams.get('status') || 'sent';
  if (!['sent', 'opened', 'clicked', 'failed'].includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  let query = supabase
    .from('woocommerce_campaign_sends')
    .select('id, customer_id, email, subject, status, sent_at, opened_at, clicked_at')
    .order('sent_at', { ascending: false })
    .limit(2000);

  if (status === 'opened') query = query.not('opened_at', 'is', null);
  else if (status === 'clicked') query = query.not('clicked_at', 'is', null);
  else if (status === 'failed') query = query.eq('status', 'failed');
  else query = query.eq('status', 'sent');

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Pull name/phone from woocommerce_customers separately rather than a
  // Supabase embed, so this doesn't depend on a specific FK relationship
  // name being set up correctly in Postgrest's schema cache.
  const customerIds = Array.from(
    new Set((data ?? []).map((r) => r.customer_id).filter((id): id is string => !!id))
  );
  let customerMap = new Map<string, { name: string | null; phone: string | null }>();
  if (customerIds.length > 0) {
    const { data: customers } = await supabase
      .from('woocommerce_customers')
      .select('id, name, phone')
      .in('id', customerIds);
    customerMap = new Map((customers ?? []).map((c) => [c.id, { name: c.name, phone: c.phone }]));
  }

  const recipients = (data ?? []).map((r) => ({
    id: r.id as string,
    name: (r.customer_id && customerMap.get(r.customer_id)?.name) || null,
    email: r.email as string,
    phone: (r.customer_id && customerMap.get(r.customer_id)?.phone) || null,
    subject: r.subject as string,
    status: r.status as string,
    sentAt: r.sent_at as string,
    openedAt: (r.opened_at as string | null) ?? null,
    clickedAt: (r.clicked_at as string | null) ?? null,
  }));

  return NextResponse.json({ recipients });
}
