"use client";
import React, { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { authApi } from "@/lib/api";

function LoginForm() {
  const searchParams = useSearchParams();
  const [nrp, setNrp] = useState("");
  const [pin, setPin] = useState("");
  // [Audit 2B] apiFetch mengarahkan ke /login?reason=... saat sesi tidak valid
  // (akun dinonaktifkan, dsb.) — tampilkan alasannya agar pengguna paham.
  const [error, setError] = useState(searchParams.get("reason") || "");
  const [loading, setLoading] = useState(false);
  const handle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setError("");
    setLoading(true);
    try {
      await authApi.login(nrp, pin);
      // Hanya izinkan redirect ke path internal (bukan URL luar).
      const raw = searchParams.get("redirect") || "/";
      const redirect = raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";
      window.location.href = redirect;
    } catch (err: any) {
      setError(err.message || "Login gagal");
      setLoading(false);
    }
  };
  return (
    <form onSubmit={handle}>
      <input
        placeholder="NRP / ID / Kode Klien"
        value={nrp}
        onChange={(e) => setNrp(e.target.value)}
        autoComplete="username"
        autoCapitalize="characters"
        required
      />
      <input
        placeholder="PIN (6 digit)"
        type="password"
        inputMode="numeric"
        autoComplete="current-password"
        value={pin}
        onChange={(e) => setPin(e.target.value)}
        required
      />
      {error && <div className="login-error">{error}</div>}
      <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
        {loading ? "Memeriksa..." : "Masuk"}
      </button>
      <p className="muted" style={{ textAlign: "center", marginTop: 10, fontSize: 11 }}>
        Klien: Gunakan Kode Klien untuk login
      </p>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <img
            src="/logo-ptsss.png"
            alt="PT Sopiak Satria Saga"
            style={{ width: 90, height: 90, objectFit: "contain" }}
          />
        </div>
        <h2>PT Sopiak Satria Saga</h2>
        <p className="login-sub">Sistem Manajemen Keamanan</p>
        <Suspense fallback={<div style={{ padding: 20, textAlign: "center" }}>Memuat...</div>}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
