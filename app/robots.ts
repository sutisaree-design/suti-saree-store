import { MetadataRoute } from 'next';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.sutisaree.com';

export default function robots(): MetadataRoute.Robots {
  // Test period: block all crawlers until ALLOW_INDEXING=true is set in Vercel.
  if (process.env.ALLOW_INDEXING !== 'true') {
    return {
      rules: { userAgent: '*', disallow: '/' },
    };
  }

  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // Private order/guest pages - contain personal order data.
      // Must never appear in Google search results.
      disallow: ['/admin', '/checkout', '/cart', '/api/', '/track/', '/order-confirmation/'],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
