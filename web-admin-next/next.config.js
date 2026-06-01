const withPWA = require('next-pwa')({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development',
  runtimeCaching: [
    {
      urlPattern: /^https?:\/\/.*\/api\/.*/,
      handler: 'NetworkFirst',
      options: {
        cacheName: 'api-cache',
        expiration: { maxEntries: 100, maxAgeSeconds: 300 },
        networkTimeoutSeconds: 10,
      },
    },
    {
      urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/,
      handler: 'CacheFirst',
      options: {
        cacheName: 'google-fonts',
        expiration: { maxEntries: 10, maxAgeSeconds: 31536000 },
      },
    },
    {
      urlPattern: /\.(png|jpg|jpeg|svg|gif|webp|ico)$/,
      handler: 'CacheFirst',
      options: {
        cacheName: 'static-images',
        expiration: { maxEntries: 60, maxAgeSeconds: 2592000 },
      },
    },
  ],
});

// =============================================================================
// AUDIT FIX (P1-19) — CSP connect-src tightening.
//
// The previous policy was:
//     connect-src 'self' wss: ws: http: https:
// which is functionally equivalent to "allow connecting to any origin"
// — CSP had no meaningful restriction left.
//
// New policy builds the connect-src dynamically from the API URL the
// frontend is already configured to talk to:
//
//   - Production build:
//       NEXT_PUBLIC_API_URL = https://api.sopiaksatriasaga.com
//     →  connect-src 'self' https://api.sopiaksatriasaga.com wss://api.sopiaksatriasaga.com
//
//   - Local development (npm run dev):
//       NEXT_PUBLIC_API_URL = http://localhost:3000
//     →  connect-src 'self' http://localhost:3000 ws://localhost:3000
//
// The WebSocket origin is derived by swapping `http` ↔ `ws` / `https` ↔ `wss`
// because Socket.io connects to the same host:port as the REST API.
//
// Two consequences worth knowing:
//   1. If NEXT_PUBLIC_API_URL changes between build and runtime, the
//      CSP header will still reflect the build-time value. For Next.js
//      this is fine because NEXT_PUBLIC_* vars are inlined at build.
//   2. Any new external service the frontend talks to (analytics,
//      sentry, etc.) must be added explicitly to ALLOWED_CONNECT
//      below — the browser will silently block any fetch/WebSocket
//      that's not on the list. That's the point of a tight CSP.
// =============================================================================
const apiBase = process.env.NEXT_PUBLIC_API_URL || 'https://api.sopiaksatriasaga.com';
// Swap protocol for the WebSocket origin: http→ws, https→wss.
const wsBase = apiBase.replace(/^http(s?):/, 'ws$1:');
const ALLOWED_CONNECT = ["'self'", apiBase, wsBase]
  // Dedupe (apiBase === wsBase only happens if the URL was malformed).
  .filter((v, i, a) => a.indexOf(v) === i)
  .join(' ');

const CSP_VALUE = [
  "default-src 'self'",
  // Tile providers + Leaflet CDN are still needed for the live map.
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdnjs.cloudflare.com https://unpkg.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com https://unpkg.com",
  "font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com",
  // OpenStreetMap tile servers are accessed via <img>, hence img-src.
  "img-src 'self' data: blob: https://ui-avatars.com https://*.tile.openstreetmap.org https://unpkg.com",
  // AUDIT FIX (P1-19): connect-src now restricted to the configured API.
  `connect-src ${ALLOWED_CONNECT}`,
  // Leaflet's tile preview / iframe maps render data: and blob: URLs.
  "frame-src 'self' blob: data:",
].join('; ');

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'ui-avatars.com' },
      { protocol: 'http', hostname: 'localhost' },
      { protocol: 'https', hostname: 'sopiaksatriasaga.com' },
    ],
    unoptimized: false,
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: CSP_VALUE,
          },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // P1-20 (kept from prior fix): geolocation=(self) so the
          // live-map "Lokasi Saya" feature can ask for browser GPS.
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self)' },
        ],
      },
    ];
  },
};

module.exports = withPWA(nextConfig);