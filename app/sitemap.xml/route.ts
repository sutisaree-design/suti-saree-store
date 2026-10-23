import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase-server';
import { ProductRow, CategoryRow } from '@/lib/types';
import { LEGAL_PAGE_TITLES } from '@/lib/marketing-api';
import { fetchPublishedBlogPostsServer } from '@/lib/blog-api-server';
import { toPublicMediaUrl, toPublicMediaUrls } from '@/lib/media-url';

// This route replaces the app/sitemap.ts file-convention sitemap. The
// installed Next.js version's built-in sitemap XML serializer
// (next/dist/build/webpack/loaders/metadata/resolve-route-data.js) only
// knows how to emit <loc>/<lastmod>/<changefreq>/<priority> -- it silently
// drops any `images`/`videos` fields on a sitemap entry, no matter what you
// put in them, because that Google sitemap-extension support was added to
// Next.js in a later release than the one this project is pinned to. So
// instead of relying on the file-convention sitemap, this route builds the
// full XML (including the image/video namespaces and tags) by hand.

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.aruhihandlooms.com';

// Without a `revalidate` value, Next.js treats this route as static and
// bakes it ONCE at build/deploy time -- so a new product/variant added in
// Admin would NOT show up in sitemap.xml until the next deployment, even
// though the product page itself is already live (see the 60s revalidate
// on product/category/shop pages). 3600s (1 hour) means new products get
// picked up automatically without requiring a redeploy, same idea as the
// force-dynamic fix on the merchant-feed route.
export const revalidate = 3600;

// Supabase/PostgREST caps unbounded selects at 1000 rows by default. As the
// catalog grows past that, a plain `.select()` would silently drop rows from
// the sitemap -- so we page through everything explicitly instead of trusting
// the default limit.
const PAGE_SIZE = 1000;

async function fetchAllRows<T>(
  table: string,
  columns: string,
  applyFilter?: (query: any) => any
): Promise<T[]> {
  const supabase = getServerSupabase();
  const rows: T[] = [];
  let from = 0;

  while (true) {
    let query = supabase.from(table).select(columns).range(from, from + PAGE_SIZE - 1);
    if (applyFilter) query = applyFilter(query);
    const { data, error } = await query;
    if (error) {
      console.error(`sitemap: failed to fetch ${table}`, error);
      break;
    }
    if (!data || data.length === 0) break;
    rows.push(...(data as T[]));
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return rows;
}

// Turns a raw images array (which may hold relative storage paths, or
// absolute Supabase Storage URLs) into absolute own-domain URLs, since
// Google's image sitemap extension requires full URLs. Routing Supabase
// URLs through toPublicMediaUrl means the sitemap always advertises
// aruhihandlooms.com URLs, not the storage provider's host -- see
// lib/media-url.ts for why.
function toAbsoluteImageUrls(images: string[] | null | undefined): string[] {
  if (!images || images.length === 0) return [];
  const absolute = images
    .filter((img): img is string => !!img)
    .map((img) =>
      img.startsWith('http://') || img.startsWith('https://')
        ? img
        : `${SITE_URL}${img.startsWith('/') ? '' : '/'}${img}`
    );
  return toPublicMediaUrls(absolute);
}

type SitemapVideoEntry = {
  title: string;
  thumbnail_loc: string;
  description: string;
  content_loc: string;
};

// Builds the `videos` sitemap-extension entry for a product/variant that has
// a video_url set. Without this, a page's video is invisible to Google as
// "video content" -- it just sees on-page UI, never something eligible for
// the Search Console "Video" report or video search results. thumbnail_loc
// is required by Google's video sitemap spec, so entries without any usable
// image are skipped entirely rather than emitted with a missing thumbnail.
function buildVideoEntry(
  videoUrl: string | null | undefined,
  title: string,
  description: string | null | undefined,
  images: string[]
): SitemapVideoEntry[] | undefined {
  if (!videoUrl) return undefined;
  const absoluteVideoUrl = videoUrl.startsWith('http://') || videoUrl.startsWith('https://')
    ? videoUrl
    : `${SITE_URL}${videoUrl.startsWith('/') ? '' : '/'}${videoUrl}`;
  // toAbsoluteImageUrls already routes through toPublicMediaUrls for the
  // thumbnail; the video file itself needs the same treatment here.
  const publicVideoUrl = toPublicMediaUrl(absoluteVideoUrl) || absoluteVideoUrl;
  const thumbnails = toAbsoluteImageUrls(images);
  if (thumbnails.length === 0) return undefined;

  return [
    {
      title,
      thumbnail_loc: thumbnails[0],
      description: (description || title).slice(0, 2048),
      content_loc: publicVideoUrl,
    },
  ];
}

type SitemapEntry = {
  url: string;
  lastModified?: Date | string;
  changeFrequency?: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
  priority?: number;
  images?: string[];
  videos?: SitemapVideoEntry[];
};

// Escapes text that goes inside an XML element (loc, title, description...).
// Without this, a product name/description containing `&`, `<`, `>`, or
// quotes would produce invalid XML that Google (and some browsers) reject
// outright, rather than just that one entry being skipped.
function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildSitemapXml(entries: SitemapEntry[]): string {
  const hasImages = entries.some((e) => e.images && e.images.length > 0);
  const hasVideos = entries.some((e) => e.videos && e.videos.length > 0);

  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"';
  if (hasImages) xml += ' xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"';
  if (hasVideos) xml += ' xmlns:video="http://www.google.com/schemas/sitemap-video/1.1"';
  xml += '>\n';

  for (const entry of entries) {
    xml += '<url>\n';
    xml += `<loc>${escapeXml(entry.url)}</loc>\n`;
    if (entry.lastModified) {
      const serialized =
        entry.lastModified instanceof Date ? entry.lastModified.toISOString() : entry.lastModified;
      xml += `<lastmod>${serialized}</lastmod>\n`;
    }
    if (entry.changeFrequency) {
      xml += `<changefreq>${entry.changeFrequency}</changefreq>\n`;
    }
    if (typeof entry.priority === 'number') {
      xml += `<priority>${entry.priority}</priority>\n`;
    }
    if (entry.images) {
      for (const image of entry.images) {
        xml += `<image:image>\n<image:loc>${escapeXml(image)}</image:loc>\n</image:image>\n`;
      }
    }
    if (entry.videos) {
      for (const video of entry.videos) {
        xml += '<video:video>\n';
        xml += `<video:title>${escapeXml(video.title)}</video:title>\n`;
        xml += `<video:thumbnail_loc>${escapeXml(video.thumbnail_loc)}</video:thumbnail_loc>\n`;
        xml += `<video:description>${escapeXml(video.description)}</video:description>\n`;
        xml += `<video:content_loc>${escapeXml(video.content_loc)}</video:content_loc>\n`;
        xml += '</video:video>\n';
      }
    }
    xml += '</url>\n';
  }

  xml += '</urlset>\n';
  return xml;
}

async function buildSitemapEntries(): Promise<SitemapEntry[]> {
  const [products, categories, variants, blogPosts] = await Promise.all([
    fetchAllRows<
      Pick<ProductRow, 'slug' | 'updated_at' | 'images' | 'name' | 'description' | 'video_url'> & {
        category_name: string;
      }
    >(
      'products',
      'slug, updated_at, images, category_name, name, description, video_url',
      (q) => q.eq('approval_status', 'live')
    ),
    fetchAllRows<Pick<CategoryRow, 'slug' | 'name'>>('categories', 'slug, name'),
    fetchAllRows<{
      slug: string;
      created_at: string;
      images: string[] | null;
      video: string | null;
      color: string | null;
      meta_title: string | null;
      meta_description: string | null;
    }>('product_variants', 'slug, created_at, images, video, color, meta_title, meta_description'),
    fetchPublishedBlogPostsServer(),
  ]);

  const staticPages: SitemapEntry[] = [
    { url: SITE_URL, lastModified: new Date(), changeFrequency: 'daily', priority: 1 },
    { url: `${SITE_URL}/shop`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.9 },
    {
      url: `${SITE_URL}/sell-with-us`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: `${SITE_URL}/vendor-registration`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: `${SITE_URL}/vendor-login`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.4,
    },
    {
      url: `${SITE_URL}/reseller-registration`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: `${SITE_URL}/reseller-login`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.4,
    },
  ];

  // Only submit categories that currently have at least one live product --
  // an empty category page is noindex (see app/category/[slug]/page.tsx),
  // and listing a noindex URL in the sitemap just generates a confusing
  // "Submitted URL marked noindex" warning in Search Console. A category
  // rejoins the sitemap automatically on the next build/revalidation once
  // it has a product.
  const namesWithProducts = new Set(products.map((p) => p.category_name));
  const categoryPages: SitemapEntry[] = categories
    .filter((c) => namesWithProducts.has(c.name))
    .map((c) => ({
      url: `${SITE_URL}/category/${c.slug}`,
      lastModified: new Date(),
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    }));

  const blogPages: SitemapEntry[] = [
    { url: `${SITE_URL}/blog`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.6 },
    ...blogPosts.map((p) => ({
      url: `${SITE_URL}/blog/${p.slug}`,
      lastModified: new Date(p.updated_at || p.published_at),
      changeFrequency: 'monthly' as const,
      priority: 0.5,
    })),
  ];

  const legalPages: SitemapEntry[] = Object.keys(LEGAL_PAGE_TITLES).map((slug) => ({
    url: `${SITE_URL}/legal/${slug}`,
    lastModified: new Date(),
    changeFrequency: 'monthly' as const,
    priority: 0.2,
  }));

  const productPages: SitemapEntry[] = products.map((p) => {
    const images = toAbsoluteImageUrls(p.images);
    const videos = buildVideoEntry(p.video_url, p.name, p.description, p.images || []);
    return {
      url: `${SITE_URL}/product/${p.slug}`,
      lastModified: p.updated_at ? new Date(p.updated_at) : new Date(),
      changeFrequency: 'weekly' as const,
      priority: 0.8,
      ...(images.length > 0 ? { images } : {}),
      ...(videos ? { videos } : {}),
    };
  });

  const variantPages: SitemapEntry[] = variants.map((v) => {
    const images = toAbsoluteImageUrls(v.images);
    // Variants don't carry their own product name, so fall back to the
    // colour and their own meta title/description (same source used for
    // <title>/<meta name="description"> on the variant page itself) rather
    // than leaving the video sitemap entry untitled.
    const videos = buildVideoEntry(
      v.video,
      v.meta_title || [v.color, 'video'].filter(Boolean).join(' '),
      v.meta_description,
      v.images || []
    );
    return {
      url: `${SITE_URL}/product/${v.slug}`,
      lastModified: v.created_at ? new Date(v.created_at) : new Date(),
      changeFrequency: 'weekly' as const,
      priority: 0.6,
      ...(images.length > 0 ? { images } : {}),
      ...(videos ? { videos } : {}),
    };
  });

  return [...staticPages, ...categoryPages, ...blogPages, ...legalPages, ...productPages, ...variantPages];
}

export async function GET() {
  const entries = await buildSitemapEntries();
  const xml = buildSitemapXml(entries);

  return new NextResponse(xml, {
    headers: {
      'Content-Type': 'application/xml',
    },
  });
}
