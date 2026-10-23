import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { verifyAdminToken, ADMIN_SESSION_COOKIE } from '@/lib/admin-auth';
import { requestGoogleIndexing } from '@/lib/google-indexing';

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.aruhihandlooms.com').replace(/\/$/, '');

// The admin blog editor (components/admin/blog-panel.tsx) writes posts
// straight to Supabase from the browser -- there's no server route in the
// create/update/delete path to hang a revalidation off. app/blog/page.tsx
// and app/blog/[slug]/page.tsx have no dynamic/revalidate config, so
// Next.js serves the statically-cached version from the last deploy until
// something explicitly busts that cache. `export const revalidate = 60` on
// those pages is the safety net (self-heals within a minute either way);
// this route is what makes a save show up on the live site immediately
// instead of the admin having to wait or redeploy.
export async function POST(req: Request) {
  const cookie = cookies().get(ADMIN_SESSION_COOKIE)?.value ?? null;
  const verified = await verifyAdminToken(cookie);
  if (!verified.valid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const slug = (body?.slug as string | undefined)?.trim() || '';
  const previousSlug = (body?.previous_slug as string | undefined)?.trim() || '';
  const published = Boolean(body?.published);

  revalidatePath('/blog');
  if (slug) revalidatePath(`/blog/${slug}`);
  // Editing a post can change its slug -- bust the old URL too, or it'd
  // keep serving stale cached content (or a stale 200) at the old address.
  if (previousSlug && previousSlug !== slug) revalidatePath(`/blog/${previousSlug}`);

  // Only ping Google to (re)crawl the URL when the post is actually
  // published -- a draft's URL 404s on the public site (see
  // fetchPublishedBlogPostBySlugServer), so indexing it would just waste a
  // request against Google's daily quota for nothing. Fire-and-forget:
  // requestGoogleIndexing never throws and is silently skipped entirely if
  // GOOGLE_INDEXING_CLIENT_EMAIL / GOOGLE_INDEXING_PRIVATE_KEY aren't set
  // (see lib/google-indexing.ts), so this is safe to call unconditionally.
  let indexed = false;
  if (published && slug) {
    indexed = await requestGoogleIndexing(`${SITE_URL}/blog/${slug}`);
  }

  return NextResponse.json({ revalidated: true, indexed });
}
