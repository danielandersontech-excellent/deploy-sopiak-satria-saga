import type { Metadata } from 'next'
import ProfilClient from './ProfilClient'

// [Konten Profil] Halaman Profil Perusahaan — memuat SELURUH konten resmi
// Company Profile PT Sopiak Satria Saga: Tentang Kami, Visi & Misi,
// Nilai-Nilai, Ruang Lingkup Layanan, Digital Security Monitoring,
// Legalitas, Manajemen & Struktur Organisasi, Alur Kerja, dan Sektor.
export const metadata: Metadata = {
  title: 'Profil Perusahaan - PT Sopiak Satria Saga',
  description:
    'Profil resmi PT Sopiak Satria Saga: visi & misi, nilai perusahaan, legalitas lengkap (NIB, BUJP, ABIJAPI, KTA Satpam, NPWP, BPJS), struktur organisasi, alur kerja operasional, dan sektor yang kami layani.',
  alternates: { canonical: '/profil' },
  openGraph: {
    title: 'Profil Perusahaan - PT Sopiak Satria Saga',
    description:
      'Perusahaan jasa pengamanan berdedikasi dengan solusi keamanan terintegrasi, personel tersertifikasi, dan monitoring berbasis teknologi.',
    type: 'website',
  },
}

export default function ProfilPage() {
  return <ProfilClient />
}
