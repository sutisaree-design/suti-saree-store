import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

// Public, unauthenticated endpoint — called from the live blog page (view
// events) and from the CTA/product card (click events). No GA4, no Google
// Cloud: writes straight into blog_analytics_events via the service role.
//
// Rate/abuse note: this only ever inserts a tiny row (slug + event_type),
// never reads or exposes anything, so the worst a bad actor can do is
// inflate view/click counts — same exposure any public analytics beacon
// has. Slug and event_type are validated against a small allow-list below
// so this can never be used to write arbitrary data.
const VALID_EVENT_TYPES = new Set(['view', 'click']);
const VALID_CTA_TYPES = new Set(['category', 'product_card']);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const blogSlug = String(body?.blog_slug || '').trim();
    const eventType = String(body?.event_type || '').trim();
    const ctaType = body?.cta_type ? String(body.cta_type).trim() : null;

    if (!blogSlug || !VALID_EVENT_TYPES.has(eventType)) {
      return NextResponse.json({ error: 'Invalid blog_slug or event_type' }, { status: 400 });
    }
    if (ctaType && !VALID_CTA_TYPES.has(ctaType)) {
      return NextResponse.json({ error: 'Invalid cta_type' }, { status: 400 });
    }
    // Basic slug sanity check — matches the slugify() pattern used elsewhere
    // in the codebase (lowercase, digits, hyphens only).
    if (!/^[a-z0-9-]{1,200}$/.test(blogSlug)) {
      return NextResponse.json({ error: 'Invalid blog_slug format' }, { status: 400 });
    }

    const admin = getSupabaseAdmin();
    const { error } = await admin.from('blog_analytics_events').insert({
      blog_slug: blogSlug,
      event_type: eventType,
      cta_type: ctaType,
    });

    if (error) {
      console.error('[blog track] insert failed:', error.message);
      return NextResponse.json({ error: 'Failed to record event' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}
