import { ImageResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase-server';

export const size = { width: 180, height: 180 };
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

// Same source as app/icon.tsx (Admin > Marketing > SEO > favicon_url), just
// rendered at the larger size iOS expects for "Add to Home Screen".
export default async function AppleIcon() {
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
        }}
      >
        <span style={{ fontSize: 96, fontWeight: 700, color: '#DAAA2F' }}>A</span>
      </div>
    ),
    { ...size }
  );
}
