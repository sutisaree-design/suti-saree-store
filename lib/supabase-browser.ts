'use client';

import { createBrowserClient } from '@supabase/ssr';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;

/**
 * Auth-aware browser client. Persists the session in cookies (not
 * localStorage) so the server (middleware, server components, route
 * handlers) can also read the logged-in user. Use this client for
 * anything auth-related: sign up, sign in, sign out, OAuth, and any
 * query that must run "as" the logged-in customer (RLS-protected
 * tables like profiles, addresses, wishlist, returns).
 *
 * For plain public catalog reads (products/categories) the existing
 * `lib/supabase.ts` client is still fine to use.
 */
export function getSupabaseBrowser() {
  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
