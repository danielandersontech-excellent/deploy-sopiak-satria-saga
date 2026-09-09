/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  // [Audit 2C] Jangan bocorkan fingerprint framework (x-powered-by: Next.js).
  poweredByHeader: false,
  images: {
    domains: [],
    unoptimized: false,
  },
  // [Audit 2C] Header keamanan dasar untuk website publik. CSP tidak
  // dipasang di sini karena halaman memuat Google Fonts + embed Google Maps
  // (iframe) — daftar sumbernya lebih aman dikelola bila diperlukan nanti.
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ]
  },
}

module.exports = nextConfig
