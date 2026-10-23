import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAdminToken, ADMIN_SESSION_COOKIE } from '@/lib/admin-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

// SECURITY: newsletter_subscribers had `anon_select_newsletter` /
// `anon_delete_newsletter` policies (USING (true)) — any visitor with
// the public anon key could read or mass-delete every subscriber
// email. Listing/deleting is now server-side only, gated by the admin
// session cookie. Public signup (INSERT via /api/newsletter) is left
// untouched — that must stay open for the storefront signup form.

async function requireAdmin() {
  const cookie = cookies().get(ADMIN_SESSION_COOKIE)?.value ?? null;
  const verified = await verifyAdminToken(cookie);
  return verified.valid;
}

export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  try {
    const { data, error } = await supabase
      .from('newsletter_subscribers')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return NextResponse.json({ subscribers: data ?? [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load subscribers';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
