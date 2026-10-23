import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAdminToken, ADMIN_SESSION_COOKIE } from '@/lib/admin-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

// Google Ads Customer Match CSV of loyalty members.
// Upload in Google Ads -> Audience manager -> Segments -> + -> Customer list,
// then set Customer type = Loyalty program members + tier.
//   GET /api/admin/loyalty/export                -> every registered customer (auto-enrolled)
//   GET /api/admin/loyalty/export?scope=earners  -> only customers with >=1 points ledger row
// Google hashes Email/Phone itself on upload when the file is plain text,
// so we send normalised plain values (lowercase email, +91XXXXXXXXXX phone).

async function requireAdmin() {
  const cookie = cookies().get(ADMIN_SESSION_COOKIE)?.value ?? null;
  const verified = await verifyAdminToken(cookie);
  return verified.valid;
}

function csvCell(v: string) {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

function normalisePhone(raw: string | null | undefined): string {
  const digits = (raw ?? '').replace(/\D/g, '');
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`;
  if (digits.length === 11 && digits.startsWith('0')) return `+91${digits.slice(1)}`;
  return '';
}

export async function GET(req: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const scope = new URL(req.url).searchParams.get('scope') === 'earners' ? 'earners' : 'all';
  const supabase = getSupabaseAdmin();

  try {
    // 1. Allowed user ids
    let allowed: Set<string> | null = null;
    if (scope === 'earners') {
      const { data: ledger, error } = await supabase.from('loyalty_points_ledger').select('user_id');
      if (error) throw error;
      allowed = new Set((ledger ?? []).map((l) => l.user_id as string));
    }

    // 2. Emails from auth.users (paginated)
    const users: { id: string; email: string | null }[] = [];
    for (let page = 1; page <= 50; page++) {
      const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) throw error;
      const batch = data?.users ?? [];
      users.push(...batch.map((u) => ({ id: u.id, email: u.email ?? null })));
      if (batch.length < 1000) break;
    }

    // 3. Name / phone from profiles
    const { data: profiles, error: pErr } = await supabase
      .from('profiles')
      .select('id, full_name, phone');
    if (pErr) throw pErr;
    const profileById = new Map((profiles ?? []).map((p) => [p.id as string, p]));

    // 4. Fallback phone + pincode from latest order
    const { data: orders } = await supabase
      .from('orders')
      .select('user_id, customer_phone, shipping_address, created_at')
      .not('user_id', 'is', null)
      .order('created_at', { ascending: false });
    const orderById = new Map<string, { phone: string | null; zip: string | null }>();
    for (const o of (orders ?? []) as any[]) {
      if (!o.user_id || orderById.has(o.user_id)) continue;
      const addr = (o.shipping_address ?? {}) as Record<string, any>;
      orderById.set(o.user_id, { phone: o.customer_phone ?? null, zip: addr.pincode ?? addr.zip ?? addr.postal_code ?? null });
    }

    const header = ['Email', 'Phone', 'First Name', 'Last Name', 'Country', 'Zip'];
    const lines = [header.join(',')];
    const seen = new Set<string>();

    for (const u of users) {
      if (allowed && !allowed.has(u.id)) continue;
      const email = (u.email ?? '').trim().toLowerCase();
      const profile = profileById.get(u.id) as any;
      const order = orderById.get(u.id);
      const phone = normalisePhone(profile?.phone) || normalisePhone(order?.phone);
      if (!email && !phone) continue;
      const key = email || phone;
      if (seen.has(key)) continue;
      seen.add(key);

      const parts = String(profile?.full_name ?? '').trim().split(/\s+/).filter(Boolean);
      const first = parts[0] ?? '';
      const last = parts.slice(1).join(' ');
      const zip = (order?.zip ?? '').toString().replace(/\D/g, '').slice(0, 6);

      lines.push([email, phone, first, last, 'IN', zip].map(csvCell).join(','));
    }

    const csv = '\uFEFF' + lines.join('\r\n') + '\r\n';
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="loyalty-members-${scope}.csv"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Export failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
