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
    // Security headers (audit C-3). CSP shipped in Report-Only first
    // so we can watch for legitimate violations on Vercel logs before
    // promoting to enforced. Other headers are safe to enforce
    // immediately — they don't break anything.
    //
    // Sources allow-listed:
    //   - 'self', https: blob: data: for image flexibility
    //   - Google Fonts (already used)
    //   - MapTiler + OpenStreetMap (used by LocationPicker)
    //   - Vercel Blob domain pattern for uploaded images
    //   - DiceBear for fallback avatars (if used)
    //   - 'unsafe-inline' on script/style is unfortunately required
    //     today: Next.js's runtime bootstrap injects inline scripts,
    //     and many Tailwind utility classes ship inline styles. Both
    //     are mitigatable later via nonces, but doing it now would
    //     break the build. Document the gap and revisit.
    const ContentSecurityPolicy = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.vercel-insights.com https://va.vercel-scripts.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "img-src 'self' data: blob: https://*.public.blob.vercel-storage.com https://*.tile.openstreetmap.org https://api.maptiler.com https://api.dicebear.com https:",
      "font-src 'self' data: https://fonts.gstatic.com",
      "connect-src 'self' https: wss:",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "upgrade-insecure-requests",
    ].join('; ')

    const securityHeaders = [
      // Report-Only CSP first — observe violations in Vercel logs for
      // ~24-48h, then flip the key to 'Content-Security-Policy' to
      // enforce. Until then this is informational, never blocks.
      { key: 'Content-Security-Policy-Report-Only', value: ContentSecurityPolicy },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=(self), interest-cohort=()' },
      { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
      { key: 'X-DNS-Prefetch-Control', value: 'on' },
    ]
    return [
      { source: '/icon-:size.png', headers: brandIconHeaders },
      { source: '/icon-:size.svg', headers: brandIconHeaders },
      { source: '/icon-foreground-:size.svg', headers: brandIconHeaders },
      { source: '/favicon.ico', headers: brandIconHeaders },
      { source: '/favicon.svg', headers: brandIconHeaders },
      // Apple fetches the AASA (no file extension) and is happiest with an
      // explicit JSON content-type. assetlinks.json already gets it via .json.
      { source: '/.well-known/apple-app-site-association', headers: [{ key: 'Content-Type', value: 'application/json' }] },
      // Security headers apply to everything — last so the brand-icon
      // rules above can layer Cache-Control on top.
      { source: '/(.*)', headers: securityHeaders },
    ]
  },
}

module.exports = withPWA(nextConfig)
