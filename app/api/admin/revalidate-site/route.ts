import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { verifyAdminToken, ADMIN_SESSION_COOKIE } from '@/lib/admin-auth';

// The admin settings forms (site banner, SEO, analytics, growth/sale bar,
// payment discount, shipping threshold) save straight to Supabase from the
// browser, so nothing on the server knows a save happened. The root layout
// reads those settings and is cached (`revalidate = 1800` in app/layout.tsx),
// which meant a saved change could take up to 30 minutes to show on the live
// site.
//
// The admin UI calls this right after a successful save. It marks every
// page's layout stale; pages then regenerate lazily on their next visit (no
// eager rebuild), so this costs at most one ISR write per page that actually
// gets visited. Only call it from rare admin saves -- never from a hot path.
export async function POST() {
  const cookie = cookies().get(ADMIN_SESSION_COOKIE)?.value ?? null;
  const verified = await verifyAdminToken(cookie);
  if (!verified.valid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  revalidatePath('/', 'layout');
  return NextResponse.json({ revalidated: true });
}
