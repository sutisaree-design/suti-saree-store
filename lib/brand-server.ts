// Server-only: reads the store's brand assets (logo + favicon) that the admin
// sets in Admin > Media > Brand identity.
//
//   logo_url     -> settings row key = 'brand_settings'
//   favicon_url  -> settings row key = 'seo_settings' (same field Admin >
//                   Marketing > SEO already uses, so the old favicon upload
//                   box and the new one always show the same image)
//
// Uses the service-role client so it works for emails / crons / PDFs too.
// Never throws: any failure falls back to empty strings, which every caller
// treats as "no custom logo -> use the original text wordmark".
import { getSupabaseAdmin } from './supabase-admin';

export interface BrandSettings {
  logo_url: string;
  favicon_url: string;
}

const EMPTY: BrandSettings = { logo_url: '', favicon_url: '' };
const TTL_MS = 60_000;
let memo: { at: number; value: BrandSettings } | null = null;

export function clearBrandMemo() {
  memo = null;
}

export async function getBrandSettings(opts: { fresh?: boolean } = {}): Promise<BrandSettings> {
  if (!opts.fresh && memo && Date.now() - memo.at < TTL_MS) return memo.value;
  try {
    const admin = getSupabaseAdmin();
    const { data } = await admin
      .from('settings')
      .select('key, value')
      .in('key', ['brand_settings', 'seo_settings']);
    const rows = (data || []) as { key: string; value: Record<string, unknown> | null }[];
    const brand = rows.find((r) => r.key === 'brand_settings')?.value || {};
    const seo = rows.find((r) => r.key === 'seo_settings')?.value || {};
    const value: BrandSettings = {
      logo_url: typeof brand.logo_url === 'string' ? brand.logo_url : '',
      favicon_url: typeof seo.favicon_url === 'string' ? seo.favicon_url : '',
    };
    memo = { at: Date.now(), value };
    return value;
  } catch {
    return memo?.value || EMPTY;
  }
}
