import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { verifyAdminToken, ADMIN_SESSION_COOKIE } from './lib/admin-auth';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  // ---------- Admin routes: unchanged existing token-based guard ----------
  if (pathname.startsWith('/admin')) {
    if (pathname === '/admin/login') return NextResponse.next();

    const cookie = req.cookies.get(ADMIN_SESSION_COOKIE);
    const token = cookie?.value ?? null;
    const verified = await verifyAdminToken(token);
    if (verified.valid) return NextResponse.next();

    const loginUrl = new URL('/admin/login', req.url);
    loginUrl.searchParams.set('next', pathname + search);
    return NextResponse.redirect(loginUrl);
  }

  // ---------- Customer session refresh (all other routes) ----------
  let response = NextResponse.next({ request: req });

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        cookiesToSet.forEach(({ name, value }) => req.cookies.set(name, value));
        response = NextResponse.next({ request: req });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // ---------- Protect /account and /vendor routes ----------
  if ((pathname.startsWith('/account') || pathname.startsWith('/vendor')) && !user) {
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('next', pathname + search);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: ['/admin/:path*', '/account/:path*', '/vendor/:path*', '/login', '/signup'],
};
