import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAdminToken, ADMIN_SESSION_COOKIE } from '@/lib/admin-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { sendEmail } from '@/lib/email';
import { affiliateApplicationStatusEmail } from '@/lib/email-templates';

async function requireAdmin() {
  const cookie = cookies().get(ADMIN_SESSION_COOKIE)?.value ?? null;
  const verified = await verifyAdminToken(cookie);
  return verified.valid;
}

// GET — every affiliate with their order/commission totals, resolved
// contact info via their most recent referred order (same trick used by
// /api/admin/resellers, since `profiles` has no email column).
export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();

  try {
    const { data: affiliates, error } = await supabase
      .from('affiliates')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;

    const userIds = (affiliates ?? []).map((a) => a.user_id);
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, phone')
      .in('id', userIds.length ? userIds : ['00000000-0000-0000-0000-000000000000']);
    const profileByUser = new Map((profiles ?? []).map((p) => [p.id, p]));

    const { data: orders, error: ordersErr } = await supabase
      .from('orders')
      .select('affiliate_id, user_id, customer_email, total_amount, affiliate_commission_amount, status, created_at')
      .not('affiliate_id', 'is', null);
    if (ordersErr) throw ordersErr;

    const emailByUser = new Map<string, string>();
    for (const o of orders ?? []) {
      if (o.user_id && !emailByUser.has(o.user_id) && o.customer_email) {
        emailByUser.set(o.user_id, o.customer_email);
      }
    }

    const rows = (affiliates ?? []).map((a) => {
      const myOrders = (orders ?? []).filter((o) => o.affiliate_id === a.id);
      const totalOrders = myOrders.length;
      const totalSales = myOrders.reduce((s, o) => s + (o.total_amount || 0), 0);
      const totalCommission = myOrders.reduce((s, o) => s + (o.affiliate_commission_amount || 0), 0);
      const profile = profileByUser.get(a.user_id);
      return {
        id: a.id,
        userId: a.user_id,
        name: profile?.full_name || 'Affiliate',
        email: emailByUser.get(a.user_id) || null,
        phone: profile?.phone || null,
        code: a.code,
        status: a.status,
        commissionPercent: a.commission_percent,
        createdAt: a.created_at,
        totalOrders,
        totalSales,
        totalCommission,
      };
    });

    return NextResponse.json({
      affiliates: rows,
      totalAffiliates: rows.length,
      totalOrders: rows.reduce((s, r) => s + r.totalOrders, 0),
      totalSales: rows.reduce((s, r) => s + r.totalSales, 0),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load affiliates';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// PUT — approve/reject/suspend an affiliate, and/or set their commission %.
// Body: { id, status?, commission_percent? } — at least one of the two.
export async function PUT(req: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const id = body?.id as string | undefined;
  const status = body?.status as string | undefined;
  const commissionRaw = body?.commission_percent;

  if (!id) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const updates: Record<string, any> = { updated_at: new Date().toISOString() };

  if (status !== undefined) {
    if (!['pending', 'approved', 'rejected', 'suspended'].includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }
    updates.status = status;
  }

  if (commissionRaw !== undefined) {
    const commissionPercent = Number(commissionRaw);
    if (!Number.isFinite(commissionPercent) || commissionPercent < 0 || commissionPercent > 100) {
      return NextResponse.json({ error: 'Commission % must be between 0 and 100' }, { status: 400 });
    }
    updates.commission_percent = commissionPercent;
  }

  if (Object.keys(updates).length === 1) {
    // Only updated_at got set — nothing meaningful was passed in.
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  try {
    const { data: updated, error } = await supabase
      .from('affiliates')
      .update(updates)
      .eq('id', id)
      .select('user_id, commission_percent')
      .maybeSingle();
    if (error) throw error;

    // Only fire an email when the status itself actually changed (not
    // for a commission-only edit, and not for 'pending' — nothing to
    // tell the customer yet at that stage). A failed email should never
    // fail the request, so it's wrapped in its own try/catch — but it
    // IS awaited (not fire-and-forget), since a serverless function can
    // be frozen/killed right after the response is sent.
    if (status && ['approved', 'rejected', 'suspended'].includes(status) && updated?.user_id) {
      try {
        const [{ data: authUser }, { data: profile }] = await Promise.all([
          supabase.auth.admin.getUserById(updated.user_id),
          supabase.from('profiles').select('full_name').eq('id', updated.user_id).maybeSingle(),
        ]);
        const email = authUser?.user?.email;
        if (email) {
          const { subject, html } = affiliateApplicationStatusEmail({
            name: profile?.full_name || 'there',
            status: status as 'approved' | 'rejected' | 'suspended',
            commission_percent: updated.commission_percent,
          });
          await sendEmail({ to: email, subject, html });
        }
      } catch (emailErr) {
        console.error('[admin/affiliates] status email failed:', emailErr);
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update affiliate';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
