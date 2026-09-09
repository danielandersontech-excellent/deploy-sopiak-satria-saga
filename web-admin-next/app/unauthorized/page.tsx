"use client";
import Link from "next/link";

// [Misi V3 / B2] Memakai kelas bersama .error-page/.error-card (token kanonik --bg),
// sebelumnya inline style + token keluarga lama (--bg-primary).
export default function UnauthorizedPage() {
  return (
    <div className="error-page">
      <div className="section-card error-card">
        <i className="fas fa-shield-alt error-icon text-danger" />
        <h1>Akses Ditolak</h1>
        <p>
          Anda tidak memiliki izin untuk mengakses halaman ini.
          Silakan hubungi administrator jika Anda merasa ini adalah kesalahan.
        </p>
        <div className="error-actions">
          <Link href="/" className="btn btn-primary">
            <i className="fas fa-home" /> Kembali ke Dashboard
          </Link>
          <Link href="/login" className="btn btn-outline">
            <i className="fas fa-sign-out-alt" /> Login Ulang
          </Link>
        </div>
      </div>
    </div>
  );
}
