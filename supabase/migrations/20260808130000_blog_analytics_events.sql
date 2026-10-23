-- Self-hosted blog analytics (no GA4 / Google Cloud needed). Every page
-- view, CTA click, and purchase-conversion on a blog post lands here.
create table if not exists blog_analytics_events (
  id uuid primary key default gen_random_uuid(),
  blog_slug text not null,
  event_type text not null check (event_type in ('view', 'click', 'conversion')),
  cta_type text,          -- 'category' | 'product_card' | null (only for click events)
  amount numeric,         -- order amount, only set for conversion events
  created_at timestamptz not null default now()
);

create index if not exists idx_blog_analytics_slug_type
  on blog_analytics_events (blog_slug, event_type);

create index if not exists idx_blog_analytics_created_at
  on blog_analytics_events (created_at);

-- RLS: only the service role (used server-side via getSupabaseAdmin()) can
-- read/write. The public track endpoint uses the service role internally,
-- so anon/browser never touches this table directly.
alter table blog_analytics_events enable row level security;
