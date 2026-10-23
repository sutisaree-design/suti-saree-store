import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAdminToken, ADMIN_SESSION_COOKIE } from '@/lib/admin-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

async function requireAdmin() {
  const cookie = cookies().get(ADMIN_SESSION_COOKIE)?.value ?? null;
  const verified = await verifyAdminToken(cookie);
  return verified.valid;
}

// PATCH — full/partial edit of a variant. Pass { setDefaultForProductId }
// to also clear the default flag on that product's other variants first
// (mirrors the old client-side setDefaultVariant() two-step update).
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { setDefaultForProductId, ...fields } = body || {};

  const update: Record<string, unknown> = {};
  const allowed = [
    'color',
    'color_hex',
    'slug',
    'images',
    'video',
    'price_override',
    'meta_title',
    'meta_description',
    'style_note',
    'is_default',
    'sku',
    'rating',
    'reviews',
  ];
  for (const key of allowed) {
    if (fields[key] !== undefined) update[key] = fields[key];
  }

  const supabase = getSupabaseAdmin();
  try {
    if (setDefaultForProductId) {
      const { error: clearErr } = await supabase
        .from('product_variants')
        .update({ is_default: false })
        .eq('product_id', setDefaultForProductId);
      if (clearErr) throw clearErr;
      update.is_default = true;
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('product_variants')
      .update(update)
      .eq('id', params.id)
      .select('*')
      .single();
    if (error) throw error;
    return NextResponse.json({ variant: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update variant';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  try {
    const { error } = await supabase.from('product_variants').delete().eq('id', params.id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to delete variant';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
