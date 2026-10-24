/** @type {import('next').NextConfig} */
const nextConfig = {
  trailingSlash: true,
  // Replaces the server-side `searchParams` check that used to live in
  // app/product/[slug]/page.tsx. Reading searchParams makes a page dynamic
  // (one Vercel function invocation per visit); handling it here at the
  // routing layer lets the product page be cached.
  async rewrites() {
    return [
      { source: '/product-category/:parent*/:slug', destination: '/category/:slug' },
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
