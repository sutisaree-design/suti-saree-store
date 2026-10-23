import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAdminToken, ADMIN_SESSION_COOKIE } from '@/lib/admin-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { slugify, buildSlug } from '@/lib/slug-utils';

// ---------------------------------------------------------------------
// ONE-TIME REPAIR TOOL — not part of the normal request flow.
//
// Background: before the ai-process / stuck-listings fix, some vendor
// products went live with a slug derived from the vendor's raw
// placeholder name (e.g. "cotton-silk-saree-me67h") instead of the
// AI-generated title that ended up in the `name` column and on the page
// (e.g. "Cotton Silk White Saree with Pink Heart Motifs"). New products
// no longer have this problem, but existing rows are stuck with the old
// mismatched slug forever (edits deliberately never touch slug, by
// design — see app/api/vendor/products/[id]/route.ts).
//
// This route finds every LIVE, vendor-sourced product whose current
// slug's "base" (the part before the trailing -xxxxx random suffix)
// doesn't match slugify(name) anymore, and gives it a fresh slug built
// from the CURRENT name — same buildSlug() used everywhere else.
//
// Usage:
//   GET  /api/admin/fix-vendor-slugs            -> dry run, lists what
//                                                    WOULD change, no writes
//   POST /api/admin/fix-vendor-slugs             -> actually applies the
//                                                    fix and returns what
//                                                    changed
//
// IMPORTANT — changing a slug changes the live product URL. Anything
// already shared/bookmarked/indexed under the OLD url will 404 (Next.js
// will fall through to /product/[slug]'s not-found handling) after this
// runs. Given these products' slugs were wrong from day one (never
// matched the on-page title), this is judged an acceptable one-time
// cleanup — but review the dry run output first.
//
// Auth: same admin-session cookie as every other /api/admin/* route.
// ---------------------------------------------------------------------

async function requireAdmin() {
  const cookie = cookies().get(ADMIN_SESSION_COOKIE)?.value ?? null;
  const verified = await verifyAdminToken(cookie);
  return verified.valid;
}

/** Strips a trailing `-xxxxx` (5 lowercase-alphanumeric) random suffix,
 *  the same shape buildSlug() always appends, so we can compare just the
 *  meaningful part of an existing slug against the current title. */
function stripRandomSuffix(slug: string): string {
  return slug.replace(/-[a-z0-9]{5}$/, '');
}

async function findMismatches() {
  const admin = getSupabaseAdmin();

  const { data: products, error } = await admin
    .from('products')
    .select('id, name, slug, vendor_id')
    .eq('approval_status', 'live')
    .not('vendor_id', 'is', null);

  if (error) throw error;

  const mismatches = (products ?? []).filter((p) => {
    const expectedBase = slugify(p.name) || 'product';
    const actualBase = stripRandomSuffix(p.slug || '');
    return expectedBase !== actualBase;
  });

  return mismatches;
}

// GET — dry run. Shows exactly what would change without writing anything.
export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const mismatches = await findMismatches();
    return NextResponse.json({
      dry_run: true,
      count: mismatches.length,
      would_update: mismatches.map((p) => ({
        id: p.id,
        name: p.name,
        current_slug: p.slug,
        new_slug_preview: `${slugify(p.name) || 'product'}-xxxxx`,
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to scan products';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST — actually applies the fix. Each product gets a fresh buildSlug(name)
// (a new random suffix — old suffix is discarded along with the mismatched
// base). Retries once on the rare slug-collision, same pattern used
// everywhere else in the vendor flow.
export async function POST() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = getSupabaseAdmin();

  try {
    const mismatches = await findMismatches();
    const updated: { id: string; name: string; old_slug: string; new_slug: string }[] = [];
    const errors: string[] = [];

    for (const product of mismatches) {
      let newSlug = buildSlug(product.name);
      let { error: updateErr } = await admin
        .from('products')
        .update({ slug: newSlug })
        .eq('id', product.id);

      if (updateErr?.code === '23505' && updateErr.message?.includes('slug')) {
        newSlug = buildSlug(product.name);
        const retry = await admin.from('products').update({ slug: newSlug }).eq('id', product.id);
        updateErr = retry.error;
      }

      if (updateErr) {
        errors.push(`product ${product.id}: ${updateErr.message}`);
        continue;
      }

      updated.push({ id: product.id, name: product.name, old_slug: product.slug, new_slug: newSlug });
    }

    return NextResponse.json({
      dry_run: false,
      scanned: mismatches.length,
      updated_count: updated.length,
      updated,
      errors,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fix slugs';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
