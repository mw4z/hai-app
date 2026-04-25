const withPWA = require('next-pwa')({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development',
  runtimeCaching: [
    {
      urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
      handler: 'CacheFirst',
      options: { cacheName: 'google-fonts', expiration: { maxEntries: 10, maxAgeSeconds: 365 * 24 * 60 * 60 } },
    },
    {
      // Brand icons + favicons MUST always go to the network so the
      // CDN-served file wins on the very first load after a brand
      // refresh. Without this carve-out, the old runtimeCaching
      // 'images' rule held the previous icon in the SW cache for
      // 30 days even when the file on Vercel was already updated.
      urlPattern: /\/(icon|favicon)[-\w.]*\.(?:png|svg|ico)(\?.*)?$/i,
      handler: 'NetworkFirst',
      options: { cacheName: 'brand-icons-v2', networkTimeoutSeconds: 4 },
    },
    {
      // All other images: switched from CacheFirst → StaleWhileRevalidate
      // and the cache name bumped to 'images-v2' so the OLD cache
      // (still holding the previous icon under the bare /icon-192.png
      // URL) is dropped on next SW activation. SWR shows the cached
      // copy instantly AND fetches the fresh file in the background
      // for next time — best of both for content images.
      urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp|ico)$/i,
      handler: 'StaleWhileRevalidate',
      options: { cacheName: 'images-v2', expiration: { maxEntries: 60, maxAgeSeconds: 7 * 24 * 60 * 60 } },
    },
    {
      urlPattern: /\.(?:js|css)$/i,
      handler: 'StaleWhileRevalidate',
      options: { cacheName: 'static-resources', expiration: { maxEntries: 60, maxAgeSeconds: 24 * 60 * 60 } },
    },
    {
      urlPattern: /^\/api\/.*/i,
      handler: 'NetworkFirst',
      options: { cacheName: 'api-cache', expiration: { maxEntries: 30, maxAgeSeconds: 5 * 60 }, networkTimeoutSeconds: 10 },
    },
  ],
})

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: [],
  },
  // CDN cache hints: icon/favicon files get a 5-minute s-maxage so
  // a brand refresh propagates within minutes instead of staying
  // edge-cached for the default static-asset year. Other static
  // assets keep their default long-lived cache.
  // Note: Next.js header sources use path-to-regexp, not raw regex.
  async headers() {
    const brandIconHeaders = [
      { key: 'Cache-Control', value: 'public, max-age=300, s-maxage=300, must-revalidate' },
    ]
    return [
      { source: '/icon-:size.png', headers: brandIconHeaders },
      { source: '/icon-:size.svg', headers: brandIconHeaders },
      { source: '/icon-foreground-:size.svg', headers: brandIconHeaders },
      { source: '/favicon.ico', headers: brandIconHeaders },
      { source: '/favicon.svg', headers: brandIconHeaders },
    ]
  },
}

module.exports = withPWA(nextConfig)
