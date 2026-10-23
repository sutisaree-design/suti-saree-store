import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAdminToken, ADMIN_SESSION_COOKIE } from '@/lib/admin-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

// SECURITY: blog post create/update/delete used to go straight from the
// browser to Supabase using the anon key (lib/blog-api.ts via the plain
// anon `supabase` client), protected only by RLS policies that allowed ANY
// anon/authenticated caller to insert/update/delete ANY post
// (`anon_insert_blog_posts` / `anon_update_blog_posts` /
// `anon_delete_blog_posts`, `USING (true) WITH CHECK (true)`). That meant
// anyone could open the browser console and rewrite or delete any blog
// post — a website-defacement risk. Writes are now server-side only,
// gated by the same admin session cookie every other /api/admin/* route
// checks. Reads (blog_posts SELECT) stay open — public /blog pages need
// that.

async function requireAdmin() {
  const cookie = cookies().get(ADMIN_SESSION_COOKIE)?.value ?? null;
  const verified = await verifyAdminToken(cookie);
  return verified.valid;
}

// GET — every post, published + draft, newest first (admin list view).
export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('blog_posts')
    .select('*')
    .order('published_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ posts: data ?? [] });
}

// POST — create a new post.
export async function POST(req: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const input = await req.json().catch(() => ({}));

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from('blog_posts').insert(input).select('*').single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ post: data });
}
