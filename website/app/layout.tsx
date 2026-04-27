import type { Metadata } from 'next'
import '@/styles/globals.css'

export const metadata: Metadata = {
  title: 'PT Sopiak Satria Saga - Jasa Keamanan Profesional & Terpercaya',
  description: 'PT Sopiak Satria Saga menyediakan layanan jasa keamanan profesional dengan teknologi terdepan. Sistem manajemen security berbasis AI, GPS tracking, dan real-time monitoring di Pekanbaru, Riau.',
  keywords: 'jasa keamanan, security, satpam profesional, PT Sopiak Satria Saga, pekanbaru, riau, GPS tracking, patroli',
  openGraph: {
    title: 'PT Sopiak Satria Saga - Jasa Keamanan Profesional',
    description: 'Layanan keamanan terpercaya dengan teknologi modern di Pekanbaru, Riau.',
    type: 'website',
  },
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
