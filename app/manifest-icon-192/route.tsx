import { ImageResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase-server';
import { loadFavicon } from '@/lib/favicon-source';

// PWA manifest icons need fixed, un-hashed URLs at specific sizes (192x192
// and 512x512 are the two Chrome/Android actually require to show the
// "Install app" prompt and a proper home-screen icon) -- the Next.js
// icon-convention files (app/icon.tsx, app/apple-icon.tsx) are meant for
// <link rel="icon">/browser-tab use and don't reliably expose a stable
// path at these exact sizes, so this is a separate route dedicated to the
// manifest. Same source (Admin > Marketing > SEO > favicon_url) and same
// brand-monogram fallback as app/icon.tsx, just rendered bigger.
export const runtime = 'edge';
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

export async function GET() {
  const size = { width: 192, height: 192 };
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
        }}
      >
        <span style={{ fontSize: 112, fontWeight: 700, color: '#DAAA2F' }}>A</span>
      </div>
    ),
    { ...size }
  );
}
