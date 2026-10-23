// Server-only Supabase client using the SERVICE ROLE key.
//
// This bypasses Row Level Security and can perform privileged auth
// operations (like generating a signup verification link) that the
// public anon key cannot. NEVER import this file from a Client
// Component or expose SUPABASE_SERVICE_ROLE_KEY to the browser.

import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;

let adminClient: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Add SUPABASE_SERVICE_ROLE_KEY ' +
        '(Project Settings -> API -> service_role key, in Supabase dashboard) to your .env file. ' +
        'Keep it secret — never expose it with a NEXT_PUBLIC_ prefix.'
    );
  }

  if (!adminClient) {
    adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }
  return adminClient;
}
