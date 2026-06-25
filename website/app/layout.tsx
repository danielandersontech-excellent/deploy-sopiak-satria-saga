import type { Metadata, Viewport } from 'next'
import '@/styles/globals.css'

export const metadata: Metadata = {
  // [6-9 finalisasi] Domain produksi terkonfirmasi (sopiaksatriasaga.com) →
  // metadataBase membuat URL openGraph/canonical absolut, canonical eksplisit.
  metadataBase: new URL('https://sopiaksatriasaga.com'),
  alternates: { canonical: '/' },
  title: 'PT Sopiak Satria Saga - Jasa Keamanan Profesional & Terpercaya',
  description: 'PT Sopiak Satria Saga menyediakan layanan jasa keamanan profesional dengan teknologi terdepan. Sistem manajemen security berbasis AI, GPS tracking, dan real-time monitoring di Pekanbaru, Riau.',
  keywords: 'jasa keamanan, security, satpam profesional, PT Sopiak Satria Saga, pekanbaru, riau, GPS tracking, patroli',
  // [6-9] Robots eksplisit (index,follow) untuk SEO dasar.
  robots: { index: true, follow: true },
  openGraph: {
    title: 'PT Sopiak Satria Saga - Jasa Keamanan Profesional',
    description: 'Layanan keamanan terpercaya dengan teknologi modern di Pekanbaru, Riau.',
    type: 'website',
  },
}

// [6-9] Viewport + themeColor (navy brand) sesuai konvensi Next 14 (terpisah
// dari metadata). metadataBase + alternates.canonical kini DIISI (domain
// produksi sopiaksatriasaga.com terkonfirmasi). Favicon app/icon masih dilewati
// (aset belum ada) — tambah saat aset siap.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0A0F1C',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Sora:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  )
}
