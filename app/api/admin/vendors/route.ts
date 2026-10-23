import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAdminToken, ADMIN_SESSION_COOKIE } from '@/lib/admin-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { notifyVendorApplicationStatus } from '@/lib/vendor-notifications';
import { generateUniqueCollectionSlug } from '@/lib/collection-slug';

async function requireAdmin() {
  const cookie = cookies().get(ADMIN_SESSION_COOKIE)?.value ?? null;
  const verified = await verifyAdminToken(cookie);
  return verified.valid;
}

// GET — every vendor application/profile, newest first.
export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();

  try {
    const { data: vendors, error } = await supabase
      .from('vendors')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;

    return NextResponse.json({ vendors: vendors ?? [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load vendors';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// PUT — approve / reject / suspend / reinstate a vendor application.
// Uses the SERVICE ROLE client (bypasses RLS) since there is no
// `authenticated` UPDATE policy on `vendors` at all — only the admin
// (via this route) can ever change status, admin_note, or bank fields.
export async function PUT(req: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const id = body?.id as string | undefined;
  const status = body?.status as string | undefined;
  const admin_note = body?.admin_note ? String(body.admin_note) : null;
  // Public-storefront rating toggle — optional, independent of status.
  // Explicit `in` check (not just truthiness) so `false` is honoured.
  const hasShowPublicRating = typeof body?.show_public_rating === 'boolean';
  const show_public_rating = hasShowPublicRating ? (body.show_public_rating as boolean) : undefined;

  if (!id) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
  if (status && !['pending', 'approved', 'rejected', 'suspended'].includes(status)) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
  if (!status && !hasShowPublicRating) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  try {
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (status) {
      updates.status = status;
      updates.admin_note = admin_note;
    }
    if (hasShowPublicRating) {
      updates.show_public_rating = show_public_rating;
    }

    // First time a vendor goes 'approved', give them their public storefront
    // slug -- clean, name-derived, and only suffixed (-2, -3, ...) if it
    // actually collides with another vendor's slug or an admin collection.
    if (status === 'approved') {
      const { data: existing } = await supabase
        .from('vendors')
        .select('business_name, storefront_slug')
        .eq('id', id)
        .maybeSingle();
      if (existing && !existing.storefront_slug) {
        updates.storefront_slug = await generateUniqueCollectionSlug(supabase, existing.business_name, {
          excludeVendorId: id,
        });
      }
    }

    const { data: updated, error } = await supabase
      .from('vendors')
      .update(updates)
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;

    if (status === 'approved' || status === 'rejected') {
      // Best-effort notification — never block the status change on this.
      notifyVendorApplicationStatus({
        business_name: updated.business_name,
        email: updated.email,
        whatsapp: updated.whatsapp,
        status,
        admin_note,
      }).catch(() => {});
    }

    return NextResponse.json({ success: true, vendor: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update vendor';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
