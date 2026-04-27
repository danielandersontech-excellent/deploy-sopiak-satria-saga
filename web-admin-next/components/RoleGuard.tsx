"use client";
import React from "react";
import { isMenuAllowed } from "@/lib/api";

export function RoleGuard({ children, path }: { children: React.ReactNode; path: string }) {
  if (!isMenuAllowed(path)) {
    return (
      <div className="section-card" style={{ textAlign: "center", padding: 60 }}>
        <i className="fas fa-lock" style={{ fontSize: 48, color: "var(--danger)", marginBottom: 16 }} />
        <h2>Akses Ditolak</h2>
        <p style={{ color: "var(--text-muted)" }}>Anda tidak memiliki izin untuk mengakses halaman ini.</p>
      </div>
    );
  }
  return <>{children}</>;
}
