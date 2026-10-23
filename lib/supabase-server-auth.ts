import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;

/**
 * Auth-aware server client for use inside Server Components, Route
 * Handlers, and Server Actions. Reads/writes the Supabase auth
 * session via Next.js cookies so `auth.uid()` resolves correctly in
 * RLS policies for the current logged-in customer.
 *
 * NOTE: In a plain Server Component, cookies() is read-only, so the
 * `set`/`remove` calls below are wrapped in try/catch — session
 * refresh writes there are a no-op there and are instead handled by
 * middleware.ts, which runs on every request.
 */
export async function getSupabaseServer() {
  const cookieStore = await cookies();

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Called from a Server Component — middleware handles refresh.
        }
      },
    },
  });
}

export async function getCurrentUser() {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}
