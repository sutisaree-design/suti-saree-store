import { ImageResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase-server';
import { loadFavicon } from '@/lib/favicon-source';

// See app/manifest-icon-192/route.tsx for why this is a separate route
// from the Next.js icon-convention files. This is the larger (512x512)
// size Chrome/Android use for the splash screen / app-drawer icon.
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
  const size = { width: 512, height: 512 };
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
        <span style={{ fontSize: 300, fontWeight: 700, color: '#DAAA2F' }}>A</span>
      </div>
    ),
    { ...size }
  );
}
