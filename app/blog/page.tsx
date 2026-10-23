import { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { fetchPublishedBlogPostsServer } from '@/lib/blog-api-server';
import { blurDataURL } from '@/lib/utils';
import { toPublicMediaUrl } from '@/lib/media-url';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.aruhihandlooms.com';

// Without this, Next.js treats this page as fully static -- built once at
// deploy time and never refetched -- so a post added/edited in the admin
// panel (which writes straight to Supabase from the browser) would never
// appear here until the next deploy. 60s keeps it near-live while still
// caching between requests; the admin panel also pings
// /api/admin/revalidate-blog right after a save for a near-instant update
// instead of waiting out this window.
// Vercel ISR-writes fix: 60 -> 1800. The admin panel still purges instantly
// via /api/admin/revalidate-blog after every save.
export const revalidate = 1800;

export const metadata: Metadata = {
  title: 'Blog | AruhiHandlooms',
  description:
    'Saree draping guides, wedding outfit advice, and fabric care tips from AruhiHandlooms — everything you need to know about Indian ethnic wear.',
  alternates: { canonical: `${SITE_URL}/blog` },
  openGraph: {
    title: 'Blog | AruhiHandlooms',
    description:
      'Saree draping guides, wedding outfit advice, and fabric care tips from AruhiHandlooms.',
    url: `${SITE_URL}/blog`,
    siteName: 'AruhiHandlooms',
    type: 'website',
  },
};

export default async function BlogIndexPage() {
  const posts = await fetchPublishedBlogPostsServer();

  return (
    <div className="container-boutique py-8 pb-24 md:pb-12">
      <div className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-secondary">
          Guides & Stories
        </p>
        <h1 className="mt-1 font-serif text-3xl font-bold text-primary sm:text-4xl">
          The Aruhi Journal
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Draping guides, styling advice, and fabric care tips — everything to help you shop and
          wear ethnic wear with confidence.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {posts.map((post) => (
          <Link
            key={post.slug}
            href={`/blog/${post.slug}`}
            className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-background transition-shadow hover:shadow-md"
          >
            <div className="relative aspect-[16/10] w-full overflow-hidden bg-muted">
              <Image
                src={
                  toPublicMediaUrl(post.cover_image) ||
                  post.cover_image ||
                  'https://placehold.co/800x500?text=No+Image'
                }
                alt={post.keywords && post.keywords.length > 0 ? `${post.title} — ${post.keywords[0]}` : post.title}
                fill
                sizes="(max-width: 768px) 100vw, 33vw"
                placeholder="blur"
                blurDataURL={blurDataURL(32, 20)}
                className="object-cover transition-transform duration-300 group-hover:scale-105"
              />
            </div>
            <div className="flex flex-1 flex-col gap-2 p-5">
              <p className="text-xs text-muted-foreground">
                {new Date(post.published_at).toLocaleDateString('en-IN', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}
                {' · '}
                {post.read_minutes} min read
              </p>
              <h2 className="font-serif text-lg font-semibold text-foreground group-hover:text-primary sm:text-xl">
                {post.title}
              </h2>
              <p className="line-clamp-3 text-sm text-muted-foreground">{post.excerpt}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
