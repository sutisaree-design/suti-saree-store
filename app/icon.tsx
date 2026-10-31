import { ImageResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase-server';
import { loadFavicon } from '@/lib/favicon-source';

// Google requires a square favicon of at least 48x48px to reliably show it
// next to search results (32x32 is fine for browser tabs but too small for
// Google Search).
export const size = { width: 48, height: 48 };
export const contentType = 'image/png';
// Read the favicon from settings on every request, so a favicon changed in
// Admin > Media > Brand identity shows up without redeploying.
export const dynamic = 'force-dynamic';

async function getFaviconUrl(): Promise<string> {
  try {
    const supabase = getServerSupabase();
    const { data } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'seo_settings')
      .maybeSingle();
    return (data?.value as { favicon_url?: string })?.favicon_url || '';
  } catch {
    return '';
  }
}

// Serves Admin > Marketing > SEO's "favicon_url" as the site favicon if one
// has been set, otherwise falls back to a generated brand monogram — so the
// site always has a proper icon even before anyone configures one.
export default async function Icon() {
  const faviconUrl = await getFaviconUrl();

  const favicon = await loadFavicon(faviconUrl);
  if (favicon) {
    return new Response(favicon.body, {
      headers: {
        'Content-Type': favicon.contentType,
        'Cache-Control': 'public, max-age=3600',
      },
    });
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#721D32',
          borderRadius: 6,
        }}
      >
        <span style={{ fontSize: 28, fontWeight: 700, color: '#DAAA2F' }}>A</span>
      </div>
    ),
    { ...size }
  );
}
