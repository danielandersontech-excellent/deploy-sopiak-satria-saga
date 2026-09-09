import type { Metadata } from 'next'
import KarirClient from './KarirClient'

// [Rekrutmen] Halaman Karir — formulir lamaran publik. Data dikirim ke
// backend POST /api/rekrutmen/publik (rate-limit, honeypot, idempotency),
// berkas disimpan di folder privat backend dan hanya bisa diunduh admin.
export const metadata: Metadata = {
  title: 'Karir & Rekrutmen - PT Sopiak Satria Saga',
  description:
    'Lowongan anggota satpam dan komandan regu PT Sopiak Satria Saga, Pekanbaru. Daftar online: isi formulir, unggah KTP, ijazah, SKCK, dan pas foto — dapatkan nomor referensi untuk cek status lamaran.',
  alternates: { canonical: '/karir' },
  openGraph: {
    title: 'Karir & Rekrutmen - PT Sopiak Satria Saga',
    description:
      'Bergabung bersama tim keamanan profesional berbasis teknologi. Pendaftaran online untuk posisi anggota satpam dan komandan regu.',
    type: 'website',
  },
}

export default function KarirPage() {
  return <KarirClient />
}
