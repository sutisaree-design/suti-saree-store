'use client';

import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. Check your .env file.'
  );
}

// ---------------------------------------------------------------------
// Egress saver: browser-side cache + de-dupe for /rest/v1/settings reads.
//
// Every storefront component (banners, badges, popups, checkout trust
// badges, WhatsApp button...) fetches its own settings key, which meant
// 15+ separate /rest/v1/settings requests on every page load. Here, the
// same request URL made again within 5 minutes is served from memory
// (or sessionStorage after a full reload), and identical requests made at
// the same moment share ONE network call.
//
// Safe by design:
//  - Only runs in the browser, only for GET requests to /rest/v1/settings.
//  - Skipped on /admin and /vendor pages so admins always see fresh data.
//  - Any write (POST/PATCH/PUT/DELETE) to settings clears the cache.
//  - Failed (non-2xx) responses are never cached.
// ---------------------------------------------------------------------
const SETTINGS_TTL_MS = 5 * 60 * 1000;
const SS_PREFIX = 'sbs:';

type CachedEntry = { body: string; status: number; contentType: string; expiresAt: number };
const memoryCache = new Map<string, CachedEntry>();
const inFlight = new Map<string, Promise<CachedEntry>>();

function toResponse(e: CachedEntry): Response {
  return new Response(e.body, { status: e.status, headers: { 'Content-Type': e.contentType } });
}

function clearSettingsCache() {
  memoryCache.clear();
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const k = sessionStorage.key(i);
      if (k && k.startsWith(SS_PREFIX)) sessionStorage.removeItem(k);
    }
  } catch {
    /* sessionStorage unavailable — ignore */
  }
}

const cachingFetch: typeof fetch = async (input, init) => {
  const fallback = () => fetch(input, init);
  try {
    if (typeof window === 'undefined') return fallback();

    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (!url.includes('/rest/v1/settings')) return fallback();

    const method = (init?.method || (typeof input !== 'string' && !(input instanceof URL) ? input.method : 'GET') || 'GET').toUpperCase();

    if (method !== 'GET') {
      clearSettingsCache();
      return fallback();
    }

    const path = window.location.pathname;
    if (path.startsWith('/admin') || path.startsWith('/vendor')) return fallback();

    const now = Date.now();

    const mem = memoryCache.get(url);
    if (mem && mem.expiresAt > now) return toResponse(mem);

    try {
      const raw = sessionStorage.getItem(SS_PREFIX + url);
      if (raw) {
        const parsed = JSON.parse(raw) as CachedEntry;
        if (parsed.expiresAt > now) {
          memoryCache.set(url, parsed);
          return toResponse(parsed);
        }
        sessionStorage.removeItem(SS_PREFIX + url);
      }
    } catch {
      /* ignore */
    }

    let pending = inFlight.get(url);
    if (!pending) {
      pending = (async () => {
        const res = await fetch(input, init);
        const entry: CachedEntry = {
          body: await res.text(),
          status: res.status,
          contentType: res.headers.get('content-type') || 'application/json',
          expiresAt: Date.now() + SETTINGS_TTL_MS,
        };
        if (res.ok) {
          memoryCache.set(url, entry);
          try {
            sessionStorage.setItem(SS_PREFIX + url, JSON.stringify(entry));
          } catch {
            /* storage full/unavailable — memory cache is enough */
          }
        }
        return entry;
      })().finally(() => {
        inFlight.delete(url);
      });
      inFlight.set(url, pending);
    }
    return toResponse(await pending);
  } catch {
    return fallback();
  }
};

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!client) {
    client = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
      global: { fetch: cachingFetch },
    });
  }
  return client;
}

export const supabase = getSupabase();
