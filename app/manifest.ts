import type { MetadataRoute } from 'next';

// Makes the ADMIN panel installable as a real standalone app (its own
// window, no browser address bar / tab strip) instead of the plain
// "Add to Home Screen" bookmark shortcut, which just opens a normal
// browser tab.
//
// scope + start_url are both pinned to /admin on purpose: this is meant to
// turn the admin panel into an app, not the public storefront, so a
// customer browsing the shop never sees an "Install AruhiHandlooms Admin"
// prompt. Icons come from app/manifest-icon-192 and .../512 (see those
// files for why they're separate from the existing app/icon.tsx /
// apple-icon.tsx, which serve the browser-tab favicon instead).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'AruhiHandlooms Admin',
    short_name: 'Aruhi Admin',
    description: 'AruhiHandlooms store admin — orders, products, and settings.',
    start_url: '/admin',
    scope: '/admin',
    display: 'standalone',
    background_color: '#FBF5EE',
    theme_color: '#721D32',
    orientation: 'portrait',
    icons: [
      {
        src: '/manifest-icon-192',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/manifest-icon-192',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/manifest-icon-512',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/manifest-icon-512',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
