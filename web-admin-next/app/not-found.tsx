"use client";
import Link from "next/link";

// [Misi V3 / E] Halaman 404 ramah (sebelumnya halaman 404 bawaan Next.js tanpa gaya aplikasi).
export default function NotFound() {
  return (
    <div className="error-page">
      <div className="section-card error-card">
        <i className="fas fa-map-signs error-icon text-warning" />
        <h1>Halaman Tidak Ditemukan</h1>
        <p>Alamat yang Anda buka tidak ada atau sudah dipindahkan. Periksa kembali tautan atau kembali ke dashboard.</p>
        <div className="error-actions">
          <Link href="/" className="btn btn-primary"><i className="fas fa-home" /> Ke Dashboard</Link>
          <button className="btn btn-outline" onClick={() => window.history.back()}><i className="fas fa-arrow-left" /> Kembali</button>
        </div>
      </div>
    </div>
  );
}
