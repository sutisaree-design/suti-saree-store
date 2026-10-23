import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAdminToken, ADMIN_SESSION_COOKIE } from '@/lib/admin-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

// Replaces the GA4-based version. Reads straight from
// blog_analytics_events (see supabase/migrations/*_blog_analytics_events.sql)
// — no Google Cloud, no service account JSON, no external API. Response
// shape ({ days, posts: [{ slug, views, clicks, conversions, revenue }] })
// is unchanged, so lib/blog-performance-api.ts and the admin Blog table
// patch from before need no changes.
export interface BlogPostPerformance {
  slug: string;
  views: number;
  users: number; // not tracked separately in the self-hosted version; mirrors views
  clicks: number;
  conversions: number;
  revenue: number;
}

export async function GET(req: Request) {
  const cookie = cookies().get(ADMIN_SESSION_COOKIE)?.value ?? null;
  const verified = await verifyAdminToken(cookie);
  if (!verified.valid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const days = Number(searchParams.get('days') || 30);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  try {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from('blog_analytics_events')
      .select('blog_slug, event_type, amount')
      .gte('created_at', since);

    if (error) throw new Error(error.message);

    const bySlug = new Map<string, BlogPostPerformance>();
    const ensure = (slug: string): BlogPostPerformance => {
      let row = bySlug.get(slug);
      if (!row) {
        row = { slug, views: 0, users: 0, clicks: 0, conversions: 0, revenue: 0 };
        bySlug.set(slug, row);
      }
      return row;
    };

    for (const r of data ?? []) {
      const row = ensure(r.blog_slug);
      if (r.event_type === 'view') {
        row.views += 1;
        row.users += 1; // approximation: no dedup by visitor in the lightweight version
      } else if (r.event_type === 'click') {
        row.clicks += 1;
      } else if (r.event_type === 'conversion') {
        row.conversions += 1;
        row.revenue += Number(r.amount ?? 0);
      }
    }

    return NextResponse.json({ days, posts: Array.from(bySlug.values()) });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load blog performance data';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
