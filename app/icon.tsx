import { ImageResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase-server';

// Google requires a square favicon of at least 48x48px to reliably show it
// next to search results (32x32 is fine for browser tabs but too small for
// Google Search).
export const size = { width: 48, height: 48 };
export const contentType = 'image/png';

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

  if (faviconUrl) {
    try {
      const res = await fetch(faviconUrl);
      if (res.ok) {
        const buffer = await res.arrayBuffer();
        return new Response(buffer, {
          headers: {
            'Content-Type': res.headers.get('content-type') || 'image/png',
            'Cache-Control': 'public, max-age=3600',
          },
        });
      }
    } catch {
      // fall through to the generated monogram below
    }
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
