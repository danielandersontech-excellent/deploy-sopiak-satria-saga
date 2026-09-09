import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'

// [Halaman 404] Ditampilkan Next.js untuk route yang tidak dikenal, dan juga
// saat notFound() dipanggil (mis. slug /layanan/[slug] yang tidak valid).
// Memakai Navbar + Footer yang sama seperti halaman lain agar navigasi tetap
// tersedia meski pengguna nyasar.
export const metadata: Metadata = {
  title: 'Halaman Tidak Ditemukan - PT Sopiak Satria Saga',
  robots: { index: false, follow: false },
}

export default function NotFound() {
  return (
    <>
      <Navbar />
      <section className="notfound-section">
        <div className="container" style={{ textAlign: 'center' }}>
          <div className="notfound-code text-gradient">404</div>
          <h1 className="section-title" style={{ textAlign: 'center', margin: '0 auto 18px' }}>
            Halaman Tidak Ditemukan
          </h1>
          <p className="section-desc" style={{ margin: '0 auto 36px', textAlign: 'center' }}>
            Maaf, halaman yang Anda cari tidak tersedia atau sudah dipindahkan.
            Silakan kembali ke beranda atau lihat layanan kami.
          </p>
          <div className="pf-closing-actions">
            <Link href="/" className="btn-primary">
              Kembali ke Beranda <ArrowRight size={16} />
            </Link>
            <Link href="/#layanan" className="btn-outline">
              Lihat Layanan Kami
            </Link>
          </div>
        </div>
      </section>
      <Footer />
    </>
  )
}
