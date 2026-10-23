import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

const DEFAULT_WINDOW_MINUTES = 15;

// Public, read-only "how many people are looking at this product right
// now" count — powers the live-viewers badge on the product page.
// Counts DISTINCT sessions (not raw events, so one person refreshing or
// scrolling doesn't inflate the number) that fired a product_view event
// for this exact product within the last N minutes. Reads the window
// from Admin > Marketing > Growth Tools (growth_settings.
// live_viewers_window_minutes) so the admin can tune it without a
// redeploy; falls back to 15 minutes if settings can't be read.
//
// This is always a real, live count off activity_events — never a
// fabricated or padded number. If real traffic is low, the count is
// just low (the storefront badge hides itself below the admin's
// configured minimum-to-show instead of faking a higher number).
export async function GET(req: NextRequest) {
  try {
    const productId = req.nextUrl.searchParams.get('product_id');
    if (!productId) {
      return NextResponse.json({ count: 0 });
    }

    const supabase = getSupabaseAdmin();

    let windowMinutes = DEFAULT_WINDOW_MINUTES;
    const { data: settingsRow } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'growth_settings')
      .maybeSingle();
    const configuredWindow = (settingsRow?.value as any)?.live_viewers_window_minutes;
    if (typeof configuredWindow === 'number' && configuredWindow > 0) {
      windowMinutes = configuredWindow;
    }

    const since = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from('activity_events')
      .select('session_id')
      .eq('event_type', 'product_view')
      .eq('product_id', productId)
      .gte('created_at', since);

    if (error) throw error;

    const distinctSessions = new Set((data ?? []).map((row: any) => row.session_id).filter(Boolean));

    return NextResponse.json({ count: distinctSessions.size });
  } catch {
    // Fail quiet — this badge is decorative, never block the page for it.
    return NextResponse.json({ count: 0 });
  }
}
