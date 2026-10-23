import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import {
  fetchPublishedBlogPostsServer,
  fetchPublishedBlogPostBySlugServer,
} from '@/lib/blog-api-server';
import {
  fetchCategoriesServer,
  fetchProductBySlugServer,
  fetchProductsByCategoryServer,
  fetchFeaturedProductsServer,
} from '@/lib/products-api-server';
import { blurDataURL } from '@/lib/utils';
import { safeJsonLd } from '@/lib/json-ld';
import BlogProductCard from '@/components/blog/blog-product-card';
import BlogCtaButton from '@/components/blog/blog-cta-button';
import BlogViewTracker from '@/components/blog/blog-view-tracker';
import BlogReviewQuote from '@/components/blog/blog-review-quote';
import ProductCard from '@/components/product-card';
import { toPublicMediaUrl } from '@/lib/media-url';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.aruhihandlooms.com';

// See the matching comment in app/blog/page.tsx -- same reasoning applies
// here: without this, a newly-published or edited post's own page would
// also be served stale/missing from the last deploy's static build.
// Vercel ISR-writes fix: 60 -> 1800 (instant purge still happens via
// /api/admin/revalidate-blog after every admin save).
export const revalidate = 1800;

// Parses the `[anchor text](category:Category Name)` markup that the AI
// blog generator (and, optionally, manual authors) can embed in
// body_paragraphs, turning it into a real internal <Link> to that
// category's page. Any category name that doesn't resolve to a real,
// live category is rendered as plain text instead — so a stale/renamed
// category can never produce a dead link on the live site.
const CATEGORY_LINK_RE = /\[([^\]]+)\]\(category:([^)]+)\)/g;

// Inline product cards: a whole paragraph consisting of `{{product:slug}}`
// (inserted via the "Insert product card" button in the admin blog editor)
// renders as a BlogProductCard instead of prose. Block-level rather than
// the inline `[text](category:Name)` syntax above because a product card
// needs its own image/price/CTA, not just a text link. A slug that no
// longer resolves to a live product (deleted/unpublished since the post
// was written) is simply dropped — never a broken card on the live site.
const PRODUCT_CARD_RE = /^\{\{product:([a-z0-9-]+)\}\}$/i;

// Section headings: a whole paragraph consisting of `{{h2:Heading Text}}`
// (written by the AI generator — see app/api/admin/generate-blog-post)
// renders as a real <h2> instead of prose. Keeping this as a plain-text
// marker (rather than letting the model emit raw markdown/HTML) means a
// malformed or hallucinated heading can never break the page — worst case
// it just falls through to the generic paragraph renderer as plain text.
const H2_MARKER_RE = /^\{\{h2:(.+)\}\}$/;

// Inline customer-review blockquotes: a whole paragraph consisting of
// `{{review:<base64 json>}}` (written by the AI generator once, from a
// real approved review at generation time — see generate-blog-post)
// renders as a BlogReviewQuote. Base64-encoded JSON rather than a live
// DB id so the quote keeps working even if the underlying review is later
// deleted/unapproved — invalid/undecodable payloads are simply dropped.
const REVIEW_CARD_RE = /^\{\{review:([A-Za-z0-9+/=]+)\}\}$/;

interface ReviewMarkerData {
  name: string;
  rating: number;
  comment: string;
  product: string;
}

function parseReviewMarker(base64: string): ReviewMarkerData | null {
  try {
    const json = Buffer.from(base64, 'base64').toString('utf8');
    const parsed = JSON.parse(json);
    if (
      parsed &&
      typeof parsed.comment === 'string' &&
      typeof parsed.name === 'string' &&
      typeof parsed.product === 'string'
    ) {
      return {
        name: parsed.name,
        rating: typeof parsed.rating === 'number' ? parsed.rating : 5,
        comment: parsed.comment,
        product: parsed.product,
      };
    }
    return null;
  } catch {
    return null;
  }
}

const slugifyHeading = (s: string) =>
  s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');

function renderParagraphWithLinks(paragraph: string, categoryNameToSlug: Map<string, string>) {
  const parts: (string | JSX.Element)[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  CATEGORY_LINK_RE.lastIndex = 0;
  while ((match = CATEGORY_LINK_RE.exec(paragraph)) !== null) {
    const [full, anchorText, categoryName] = match;
    if (match.index > lastIndex) parts.push(paragraph.slice(lastIndex, match.index));
    const slug = categoryNameToSlug.get(categoryName.trim().toLowerCase());
    if (slug) {
      parts.push(
        <Link
          key={`link-${key++}`}
          href={`/category/${slug}`}
          className="font-medium text-primary underline underline-offset-2 hover:opacity-80"
        >
          {anchorText}
        </Link>
      );
    } else {
      parts.push(anchorText);
    }
    lastIndex = match.index + full.length;
  }
  if (lastIndex < paragraph.length) parts.push(paragraph.slice(lastIndex));
  return parts;
}

type Params = { params: { slug: string } };

export async function generateStaticParams() {
  const posts = await fetchPublishedBlogPostsServer();
  return posts.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const post = await fetchPublishedBlogPostBySlugServer(params.slug);
  if (!post) {
    return { title: 'Post not found | AruhiHandlooms', robots: { index: false, follow: true } };
  }

  const url = `${SITE_URL}/blog/${post.slug}`;
  const title = `${post.title} | AruhiHandlooms`;
  const coverImage =
    toPublicMediaUrl(post.cover_image) ||
    post.cover_image ||
    'https://placehold.co/1200x630?text=No+Image';

  return {
    title,
    description: post.excerpt,
    keywords: post.keywords,
    alternates: { canonical: url },
    openGraph: {
      title,
      description: post.excerpt,
      url,
      siteName: 'AruhiHandlooms',
      type: 'article',
      images: [{ url: coverImage, width: 1200, height: 630, alt: post.title }],
      publishedTime: post.published_at,
      modifiedTime: post.updated_at || post.published_at,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description: post.excerpt,
      images: [coverImage],
    },
    robots: {
      index: true,
      follow: true,
      googleBot: { index: true, follow: true, 'max-image-preview': 'large' },
    },
  };
}

export default async function BlogPostPage({ params }: Params) {
  const post = await fetchPublishedBlogPostBySlugServer(params.slug);
  if (!post) notFound();

  // Resolve the post's related category to its real slug so the CTA at the
  // bottom links to the SEO category page (/category/[slug]) rather than
  // hardcoding a URL that could drift if the category is renamed. Also
  // build a name->slug map for any in-content `[text](category:Name)`
  // links inside body_paragraphs (see app/api/admin/generate-blog-post).
  let relatedCategorySlug: string | null = null;
  const categoryNameToSlug = new Map<string, string>();
  {
    const categories = await fetchCategoriesServer();
    for (const c of categories) categoryNameToSlug.set(c.name.toLowerCase(), c.slug);
    if (post.related_category_name) {
      relatedCategorySlug = categoryNameToSlug.get(post.related_category_name.toLowerCase()) ?? null;
    }
  }

  // Resolve any `{{product:slug}}` markers in the body to real, live
  // products up front, in parallel, so rendering below is a pure lookup.
  const productSlugs = Array.from(
    new Set(
      post.body_paragraphs
        .map((p) => p.trim().match(PRODUCT_CARD_RE)?.[1])
        .filter((s): s is string => Boolean(s))
    )
  );
  const productBySlug = new Map<string, Awaited<ReturnType<typeof fetchProductBySlugServer>>>();
  if (productSlugs.length > 0) {
    const products = await Promise.all(
      productSlugs.map((s) => fetchProductBySlugServer(s).catch(() => null))
    );
    productSlugs.forEach((s, i) => productBySlug.set(s, products[i]));
  }

  // "You might also like" grid at the end — real live products from the
  // post's related category, excluding anything already shown as an
  // inline {{product:slug}} card above, so it adds new options instead of
  // repeating the same products the reader already scrolled past.
  // Falls back to the store's featured/top-rated products when the post
  // has no matching related category (or that category currently has no
  // live stock) — the grid should never be empty just because the AI's
  // category guess didn't resolve.
  let relatedProducts = post.related_category_name
    ? await fetchProductsByCategoryServer(post.related_category_name, {
        limit: 4,
        excludeSlugs: productSlugs,
      }).catch(() => [])
    : [];
  if (relatedProducts.length === 0) {
    relatedProducts = await fetchFeaturedProductsServer({
      limit: 4,
      excludeSlugs: productSlugs,
    }).catch(() => []);
  }

  const url = `${SITE_URL}/blog/${post.slug}`;
  const coverImage =
    toPublicMediaUrl(post.cover_image) ||
    post.cover_image ||
    'https://placehold.co/1200x630?text=No+Image';
  // Keyword-rich alt text instead of a bare title repeat — folds in the
  // post's top search-intent keyword (set by the AI generator/admin) so
  // the cover image itself carries semantic SEO value for Google Images,
  // not just the page around it.
  const coverAlt =
    post.keywords && post.keywords.length > 0 ? `${post.title} — ${post.keywords[0]}` : post.title;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.excerpt,
    image: coverImage,
    datePublished: post.published_at,
    dateModified: post.updated_at || post.published_at,
    author: { '@type': 'Organization', name: 'AruhiHandlooms' },
    publisher: { '@type': 'Organization', name: 'AruhiHandlooms' },
    mainEntityOfPage: url,
  };

  // FAQPage structured data — makes the post eligible for Google's FAQ
  // rich results (the collapsible Q&A block that can appear directly in
  // search results), on top of the plain Article schema above. Omitted
  // entirely when a post has no faqs, since an empty FAQPage block is
  // invalid schema and Google would just ignore/flag it anyway.
  const faqJsonLd =
    post.faqs && post.faqs.length > 0
      ? {
          '@context': 'https://schema.org',
          '@type': 'FAQPage',
          mainEntity: post.faqs.map((f) => ({
            '@type': 'Question',
            name: f.question,
            acceptedAnswer: { '@type': 'Answer', text: f.answer },
          })),
        }
      : null;

  return (
    <article className="container-boutique max-w-3xl py-8 pb-24 md:pb-12">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }}
      />
      {faqJsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: safeJsonLd(faqJsonLd) }}
        />
      )}
      <BlogViewTracker slug={post.slug} />

      <nav className="mb-4 text-xs text-muted-foreground">
        <Link href="/" className="hover:text-primary">
          Home
        </Link>
        {' / '}
        <Link href="/blog" className="hover:text-primary">
          Blog
        </Link>
      </nav>

      <h1 className="font-serif text-2xl font-bold text-primary sm:text-4xl">{post.title}</h1>
      <p className="mt-2 text-xs text-muted-foreground">
        {new Date(post.published_at).toLocaleDateString('en-IN', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        })}
        {' · '}
        {post.read_minutes} min read
      </p>

      <div className="relative mt-6 aspect-[16/9] w-full overflow-hidden rounded-2xl bg-muted">
        <Image
          src={coverImage}
          alt={coverAlt}
          fill
          sizes="(max-width: 768px) 100vw, 768px"
          placeholder="blur"
          blurDataURL={blurDataURL(32, 18)}
          className="object-cover"
          priority
        />
      </div>

      <div className="mt-8 max-w-none text-foreground">
        {post.body_paragraphs.map((para, i) => {
          const trimmed = para.trim();

          const productSlug = trimmed.match(PRODUCT_CARD_RE)?.[1];
          if (productSlug) {
            const product = productBySlug.get(productSlug);
            return product ? <BlogProductCard key={i} product={product} blogSlug={post.slug} /> : null;
          }

          const heading = trimmed.match(H2_MARKER_RE)?.[1];
          if (heading) {
            return (
              <h2
                key={i}
                id={slugifyHeading(heading)}
                className="mb-3 mt-8 font-serif text-xl font-semibold text-foreground sm:text-2xl"
              >
                {heading}
              </h2>
            );
          }

          const reviewMatch = trimmed.match(REVIEW_CARD_RE)?.[1];
          if (reviewMatch) {
            const review = parseReviewMarker(reviewMatch);
            return review ? <BlogReviewQuote key={i} review={review} /> : null;
          }

          return (
            <p key={i} className="mb-4 leading-relaxed text-foreground/90">
              {renderParagraphWithLinks(para, categoryNameToSlug)}
            </p>
          );
        })}
      </div>

      {post.faqs && post.faqs.length > 0 && (
        <div className="mt-10">
          <h2 className="mb-4 font-serif text-xl font-semibold text-foreground sm:text-2xl">
            Frequently Asked Questions
          </h2>
          <div className="divide-y divide-border rounded-2xl border border-border">
            {post.faqs.map((faq, i) => (
              <details key={i} className="group p-4 sm:p-5" open={i === 0}>
                <summary className="cursor-pointer list-none font-medium text-foreground marker:content-none">
                  {faq.question}
                </summary>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{faq.answer}</p>
              </details>
            ))}
          </div>
        </div>
      )}

      {relatedCategorySlug && (
        <BlogCtaButton
          categorySlug={relatedCategorySlug}
          categoryName={post.related_category_name!}
          blogSlug={post.slug}
        />
      )}

      {relatedProducts.length > 0 && (
        <div className="mt-10">
          <h2 className="mb-4 font-serif text-xl font-semibold text-foreground sm:text-2xl">
            You Might Also Like
          </h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {relatedProducts.map((product) => (
              <ProductCard key={product.id} product={product} compact />
            ))}
          </div>
        </div>
      )}

      <div className="mt-8">
        <Link href="/blog" className="text-sm font-medium text-primary underline">
          ← Back to all guides
        </Link>
      </div>
    </article>
  );
}
