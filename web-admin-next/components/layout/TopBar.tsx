"use client";
import React, { useState, useEffect, useCallback } from "react";
import { usePathname } from "next/navigation";
import { getUser, panicApi } from "@/lib/api";
import { onRealtimeEvent } from "@/lib/socketClient";
import { useSettings } from "@/hooks/useSettings";

const BREADCRUMB_MAP: Record<string, string> = {
  "/": "Dashboard",
  "/lokasi": "Lokasi",
  "/personil": "Personil",
  "/absensi": "Absensi",
  "/patroli": "Patroli",
  "/laporan-harian": "Laporan Harian",
  "/laporan-kejadian": "Laporan Kejadian",
  "/serah-terima": "Serah Terima",
  "/checkpoint": "Checkpoint",
  "/routes": "Rute Patroli",
  "/pos-jaga": "Pos Jaga",
  "/jadwal": "Jadwal Shift",
  "/shift-assignment": "Penugasan Shift",
  "/broadcast": "Broadcast",
  "/panic": "Panic Alert",
  "/clients": "Klien",
  "/export": "Export",
  "/live-map": "Live Map",
  "/geofence": "Geofence",
  "/backup": "Backup",
  "/analytics": "Analytics",
  "/qr-generator": "QR Generator",
};

export function TopBar() {
  const { isDark, toggleDark, lang, setLang, t } = useSettings();
  const pathname = usePathname();
  const [time, setTime] = useState(new Date());
  const [unreadCount, setUnreadCount] = useState(0);
  const user = getUser();

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const loadNotifCount = useCallback(async () => {
    try {
      const data = await panicApi.list("status=active");
      setUnreadCount(Array.isArray(data) ? data.length : 0);
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    loadNotifCount();
    const unsub = onRealtimeEvent((ev) => {
      if (ev.includes("panic") || ev.includes("broadcast") || ev.includes("laporan")) {
        loadNotifCount();
      }
    });
    return unsub;
  }, [loadNotifCount]);

  if (!user) return null;

  const roleColors: Record<string, string> = {
    admin: "var(--danger)",
    supervisor: "var(--purple)",
    komandan: "var(--brand-primary)",
    anggota: "var(--success)",
    klien: "var(--warning)",
  };

  const breadcrumb = BREADCRUMB_MAP[pathname] || "Dashboard";

  return (
    <div className="topbar">
      <div className="topbar-left">
        <div className="topbar-breadcrumb">
          <span style={{ color: "var(--text-muted)", fontSize: 12 }}>PT Sopiak Satria Saga</span>
          <i className="fas fa-chevron-right" style={{ fontSize: 8, color: "var(--text-muted)", margin: "0 8px" }} />
          <span style={{ fontWeight: 600, fontSize: 13 }}>{breadcrumb}</span>
        </div>
      </div>
      <div className="topbar-right">
        <div className="topbar-clock">
          <i className="fas fa-clock" style={{ fontSize: 12, opacity: 0.5 }} />
          <span>{time.toLocaleDateString("id-ID", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</span>
          <span style={{ fontFamily: "var(--font-sora), monospace", fontWeight: 600 }}>
            {time.toLocaleTimeString("id-ID")}
          </span>
        </div>
        <a href="/panic" className="btn-icon" style={{ position: "relative" }} title="Notifikasi">
          <i className="fas fa-bell" />
          {unreadCount > 0 && (
            <span style={{
              position: "absolute", top: -4, right: -4,
              background: "var(--danger)", color: "#fff",
              fontSize: 9, fontWeight: 800, minWidth: 16, height: 16,
              borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center",
              padding: "0 4px",
            }}>{unreadCount}</span>
          )}
        </a>
        <button className="theme-toggle" onClick={toggleDark}>
          <i className={`fas ${isDark ? "fa-sun" : "fa-moon"}`} />
        </button>
        <button className="lang-toggle" onClick={() => setLang(lang === "id" ? "en" : "id")}>
          <span className={lang === "id" ? "lang-active" : "lang-inactive"}>ID</span>
          <span className={lang === "en" ? "lang-active" : "lang-inactive"}>EN</span>
        </button>
        <div className="topbar-user">
          <div className="topbar-user-avatar" style={{ background: roleColors[user.role] || "var(--brand-primary)" }}>
            {user.nama?.charAt(0)?.toUpperCase() || "U"}
          </div>
          <div className="topbar-user-info">
            <div className="topbar-user-name">{user.nama}</div>
            <div className="topbar-user-role">
              {user.nrp} · <span style={{ textTransform: "capitalize" }}>{user.role}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
