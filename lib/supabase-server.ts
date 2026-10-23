import { createClient, SupabaseClient } from '@supabase/supabase-js';

// NOTE: the URL/key are read lazily inside getServerSupabase() rather than
// thrown at module top-level. A top-level throw here would crash this
// entire module -- and every file that imports it (lib/email.ts, used by
// signup/OTP/forgot-password/test-email) -- the instant it's imported,
// before any of those routes' own try/catch blocks get a chance to run.
// That produced unhelpful crashes (HTML 500 pages instead of JSON errors)
// across multiple unrelated features whenever these env vars were missing.
let serverClient: SupabaseClient | null = null;

export function getServerSupabase(): SupabaseClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. Check your .env file (or your hosting provider\'s Environment Variables settings).'
    );
  }

  if (!serverClient) {
    serverClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }
  return serverClient;
}
