import { supabase } from '@/lib/supabase';

export type HomepageTileLinkType = 'collection' | 'promotion' | 'custom_url';

export interface HomepageTile {
  id: string;
  position: number;
  title: string;
  subtitle: string | null;
  badge_text: string | null;
  price_label: string | null;
  image_url: string | null;
  cta_label: string;
  link_type: HomepageTileLinkType;
  link_value: string | null;
  is_active: boolean;
  created_at?: string;
}

export interface HomepageTileInput {
  title: string;
  subtitle: string | null;
  badge_text: string | null;
  price_label: string | null;
  image_url: string | null;
  cta_label: string;
  link_type: HomepageTileLinkType;
  link_value: string | null;
  is_active: boolean;
}

// ---------------------------------------------------------------------
// Admin management (Admin > Homepage Tiles tab)
// ---------------------------------------------------------------------

export async function fetchHomepageTilesAdmin(): Promise<HomepageTile[]> {
  const res = await fetch('/api/admin/homepage-tiles');
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'Failed to load homepage tiles');
  return (body.tiles ?? []) as HomepageTile[];
}

async function adminHomepageTileRequest(url: string, options: RequestInit) {
  const res = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'Request failed');
  return body;
}

export async function createHomepageTile(input: HomepageTileInput) {
  await adminHomepageTileRequest('/api/admin/homepage-tiles', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function updateHomepageTile(id: string, input: Partial<HomepageTileInput>) {
  await adminHomepageTileRequest(`/api/admin/homepage-tiles/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export async function deleteHomepageTile(id: string) {
  await adminHomepageTileRequest(`/api/admin/homepage-tiles/${id}`, { method: 'DELETE' });
}

export async function setHomepageTileActive(id: string, is_active: boolean) {
  await adminHomepageTileRequest(`/api/admin/homepage-tiles/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ is_active }),
  });
}

// Persists a new order for all (or a subset of) tiles in one batch call —
// used by the up/down reorder buttons in the admin panel (Part 3b).
export async function reorderHomepageTiles(orderedIds: string[]) {
  await adminHomepageTileRequest('/api/admin/homepage-tiles/reorder', {
    method: 'PATCH',
    body: JSON.stringify({ orderedIds }),
  });
}

/**
 * Uploads a homepage tile image via the server-side dual-write route
 * (/api/upload-image), which writes to BOTH Supabase and R2 and returns
 * a canonical aruhihandlooms.com/media/... URL.
 * Previously uploaded directly to Supabase from the browser.
 */
export async function uploadHomepageTileImage(file: File, seoName?: string): Promise<string> {
  const form = new FormData();
  form.append('file', file);
  form.append('folder', 'tiles');
  if (seoName) form.append('slug', seoName);
  const res = await fetch('/api/upload-image', { method: 'POST', body: form });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.error || 'Could not upload tile image.');
  if (!json?.url) throw new Error('Upload succeeded but no URL returned.');
  return json.url as string;
}

// ---------------------------------------------------------------------
// Storefront (public) — used by the homepage grid (Part 3b).
// ---------------------------------------------------------------------

export async function fetchActiveHomepageTiles(): Promise<HomepageTile[]> {
  try {
    const { data, error } = await supabase
      .from('homepage_tiles')
      .select('*')
      .eq('is_active', true)
      .order('position', { ascending: true });
    if (error) throw error;
    return (data ?? []) as HomepageTile[];
  } catch {
    // A homepage render should never break because tiles failed to
    // load — same "fail quiet" approach as fetchHomeBanner in
    // lib/home-data-server.ts.
    return [];
  }
}
