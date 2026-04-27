"use client";
import Link from "next/link";

export default function UnauthorizedPage() {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "center",
      minHeight: "100vh", background: "var(--bg-primary)",
    }}>
      <div className="section-card" style={{ textAlign: "center", padding: 60, maxWidth: 480 }}>
        <i className="fas fa-shield-alt" style={{ fontSize: 56, color: "var(--danger)", marginBottom: 20 }} />
        <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8 }}>Akses Ditolak</h1>
        <p style={{ color: "var(--text-muted)", marginBottom: 24, lineHeight: 1.6 }}>
          Anda tidak memiliki izin untuk mengakses halaman ini.
          Silakan hubungi administrator jika Anda merasa ini adalah kesalahan.
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
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
