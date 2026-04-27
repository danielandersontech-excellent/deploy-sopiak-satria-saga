"use client";
import React, { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { authApi } from "@/lib/api";

function LoginForm() {
  const searchParams = useSearchParams();
  const [nrp, setNrp] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const handle = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await authApi.login(nrp, pin);
      const redirect = searchParams.get("redirect") || "/";
      window.location.href = redirect;
    } catch (err: any) {
      setError(err.message || "Login gagal");
    }
    setLoading(false);
  };
  return (
    <form onSubmit={handle}>
      <input
        placeholder="NRP / ID / Kode Klien"
        value={nrp}
        onChange={(e) => setNrp(e.target.value)}
        required
      />
      <input
        placeholder="PIN (6 digit)"
        type="password"
        value={pin}
        onChange={(e) => setPin(e.target.value)}
        required
      />
      {error && <div className="login-error">{error}</div>}
      <button type="submit" disabled={loading}>
        {loading ? "Loading..." : "Masuk"}
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
