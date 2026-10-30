/** @type {import('next').NextConfig} */
const nextConfig = {
  trailingSlash: true,
  // Replaces the server-side `searchParams` check that used to live in
  // app/product/[slug]/page.tsx. Reading searchParams makes a page dynamic
  // (one Vercel function invocation per visit); handling it here at the
  // routing layer lets the product page be cached.
  // Old WordPress/WooCommerce/Rank Math URLs -> new equivalents (301).
  // Redirects run before rewrites below.
  async redirects() {
    return [
      { source: '/my-account/orders', destination: '/account/orders/', permanent: true },
      { source: '/my-account/view-order/:id', destination: '/account/orders/', permanent: true },
      { source: '/my-account/edit-account', destination: '/account/profile/', permanent: true },
      { source: '/my-account/edit-address', destination: '/account/addresses/', permanent: true },
      { source: '/my-account/edit-address/:type', destination: '/account/addresses/', permanent: true },
      { source: '/my-account/lost-password', destination: '/forgot-password/', permanent: true },
      { source: '/lost-password', destination: '/forgot-password/', permanent: true },
      // Sitemaps (Rank Math / WP core / Yoast style) -> our single sitemap
      { source: '/sitemap_index.xml', destination: '/sitemap.xml', permanent: true },
      { source: '/wp-sitemap.xml', destination: '/sitemap.xml', permanent: true },
      { source: '/product-sitemap.xml', destination: '/sitemap.xml', permanent: true },
      { source: '/product-sitemap:n.xml', destination: '/sitemap.xml', permanent: true },
      { source: '/page-sitemap.xml', destination: '/sitemap.xml', permanent: true },
      { source: '/post-sitemap.xml', destination: '/sitemap.xml', permanent: true },
      { source: '/product_cat-sitemap.xml', destination: '/sitemap.xml', permanent: true },
      { source: '/product_tag-sitemap.xml', destination: '/sitemap.xml', permanent: true },
      { source: '/category-sitemap.xml', destination: '/sitemap.xml', permanent: true },
      // WP RSS feed
      { source: '/feed', destination: '/rss.xml', permanent: true },
    ];
  },
  async rewrites() {
    return [
      // Old WooCommerce feed URL (Merchant Center ke saved File URL ke liye) -> naya feed
      { source: '/wp-content/uploads/woo-feed/google/xml/saree.xml', destination: '/feeds/google-saree.xml' },
      // Old WordPress media at its original URL -> read from Cloudflare R2 (app/api/wp-uploads).
      { source: '/wp-content/uploads/:path*', destination: '/api/wp-uploads/:path*' },
      { source: '/product-category/:parent*/:slug', destination: '/category/:slug' },      { source: '/product-tag/:slug', destination: '/tag/:slug' },
      { source: '/privacy-policy', destination: '/legal/privacy-policy' },
      { source: '/terms-and-conditions', destination: '/legal/terms-conditions' },
      { source: '/shipping-delivery-information', destination: '/legal/shipping-policy' },
      { source: '/returns-exchange', destination: '/legal/refund-policy' },
      { source: '/about-us', destination: '/about' },
      { source: '/contact-us', destination: '/contact' },
      { source: '/my-account', destination: '/account' },
      {
        // Merchant-feed links (/product/x?size=XL) need server-rendered
        // JSON-LD with that size's price; serve them from a dynamic twin
        // route. Normal product views (no ?size=) stay on the cached page.
        source: '/product/:slug',
        has: [{ type: 'query', key: 'size', value: '.+' }],
        destination: '/product-size/:slug',
      },
    ];
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  experimental: {
    serverComponentsExternalPackages: ['sharp'],
  },
  images: {
    // Custom responsive loader:
    // - New images: serves -sm (480px) / -md (900px) / original (1600px)
    //   based on requested width — right size per device, no Vercel quota
    // - Old images (no suffix variants): falls back to original URL safely
    loader: 'custom',
    loaderFile: './lib/cloudflare-image-loader.js',
    remotePatterns: [
      { protocol: 'https', hostname: 'images.pexels.com' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: 'picsum.photos' },
      { protocol: 'https', hostname: 'placehold.co' },
      { protocol: 'https', hostname: '*.supabase.co', pathname: '/storage/v1/object/public/**' },
      { protocol: 'https', hostname: 'cdn.aruhihandlooms.com' },
      { protocol: 'https', hostname: 'aruhihandlooms.com' },
      { protocol: 'https', hostname: 'www.aruhihandlooms.com' },
    ],
  },
};

module.exports = nextConfig;
