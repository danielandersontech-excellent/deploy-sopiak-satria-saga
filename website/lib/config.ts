/**
 * Konfigurasi runtime website publik.
 *
 * Website tidak memakai build-arg di docker-compose (berbeda dari web-admin),
 * jadi URL API dibaca dari NEXT_PUBLIC_API_URL bila ada, dengan fallback ke
 * domain produksi. Untuk pengembangan lokal: NEXT_PUBLIC_API_URL=http://localhost:3000
 */
export const API_URL: string =
  (process.env.NEXT_PUBLIC_API_URL || '').replace(/\/+$/, '') || 'https://api.sopiaksatriasaga.com'
