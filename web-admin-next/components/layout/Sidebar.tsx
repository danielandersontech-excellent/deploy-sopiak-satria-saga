"use client";
import React, { useState, useEffect, useCallback } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { authApi, getUser, apiFetchPaged, panicApi, rekrutmenApi, ROLE_MENUS } from "@/lib/api";
import { onRealtimeEvent } from "@/lib/socketClient";
import { useSettings } from "@/hooks/useSettings";

export function Sidebar({
  open = false,
  onClose,
}: {
  open?: boolean;
  onClose?: () => void;
}) {
  const pathname = usePathname();
  const { isDark, toggleDark, lang, setLang, t } = useSettings();
  const [counts, setCounts] = useState({ pending: 0, panic: 0, rekrutmen: 0 });
  const refreshCounts = useCallback(async () => {
    try {
      const role = getUser()?.role || "anggota";
      // [Audit 2B] Hitung dari pagination.total — sebelumnya .length dari
      // 20 baris pertama (badge mentok di 20 walau pending lebih banyak).
      const [lh, lk, pa, rk] = await Promise.all([
        apiFetchPaged("/api/laporan/harian", "status=pending&limit=1"),
        apiFetchPaged("/api/laporan/kejadian", "status=pending&limit=1"),
        panicApi.list("status=active"),
        // [Rekrutmen] badge pelamar baru — hanya admin/supervisor yang punya akses.
        ["admin", "supervisor"].includes(role) ? rekrutmenApi.ringkasan().catch(() => null) : Promise.resolve(null),
      ]);
      setCounts({
        pending: (Number(lh?.pagination?.total) || 0) + (Number(lk?.pagination?.total) || 0),
        panic: pa?.length || 0,
        rekrutmen: Number(rk?.baru) || 0,
      });
    } catch {}
  }, []);
  useEffect(() => {
    refreshCounts();
    const unsub = onRealtimeEvent((ev) => {
      if (
        [
          "laporan:new",
          "panic:alert",
          "panic:resolved",
          "stats:update",
          "rekrutmen:new",
        ].includes(ev)
      )
        refreshCounts();
    });
    return unsub;
  }, []);
  const userRole = getUser()?.role || "anggota";
  const isKlien = userRole === "klien";
  const menu = isKlien
    ? [
        {
          s: "Monitoring",
          items: [
            { p: "/", i: "fa-th-large", l: t("dashboard") },
            { p: "/live-map", i: "fa-map-marked-alt", l: "Live Map Anggota" },
          ],
        },
        {
          s: t("operasional"),
          items: [
            { p: "/absensi", i: "fa-fingerprint", l: t("absensi") },
            { p: "/patroli", i: "fa-route", l: t("patroli") },
            { p: "/laporan-harian", i: "fa-file-alt", l: t("lap_harian") },
            {
              p: "/laporan-kejadian",
              i: "fa-exclamation-triangle",
              l: t("lap_kejadian"),
            },
          ],
        },
        {
          s: t("lainnya"),
          items: [
            {
              p: "/panic",
              i: "fa-bell",
              l: t("panic_alert"),
              b: counts.panic || undefined,
            },
            { p: "/export", i: "fa-download", l: t("export") },
          ],
        },
      ]
    : [
        {
          s: t("utama"),
          items: [
            { p: "/", i: "fa-th-large", l: t("dashboard") },
            { p: "/live-map", i: "fa-map-marked-alt", l: "Live Map" },
            { p: "/lokasi", i: "fa-building", l: t("lokasi") },
            { p: "/clients", i: "fa-user-tie", l: "Klien" },
            { p: "/personil", i: "fa-users", l: t("personil") },
            {
              p: "/rekrutmen",
              i: "fa-user-plus",
              l: "Rekrutmen",
              b: counts.rekrutmen || undefined,
            },
          ],
        },
        {
          s: t("operasional"),
          items: [
            { p: "/absensi", i: "fa-fingerprint", l: t("absensi") },
            { p: "/patroli", i: "fa-route", l: t("patroli") },
            {
              p: "/laporan-harian",
              i: "fa-file-alt",
              l: t("lap_harian"),
              b: counts.pending || undefined,
            },
            {
              p: "/laporan-kejadian",
              i: "fa-exclamation-triangle",
              l: t("lap_kejadian"),
            },
            { p: "/serah-terima", i: "fa-handshake", l: t("serah_terima") },
            { p: "/geofence", i: "fa-shield-alt", l: "Geofence" },
          ],
        },
        {
          s: t("konfigurasi"),
          items: [
            { p: "/checkpoint", i: "fa-map-marker-alt", l: t("checkpoint") },
            { p: "/routes", i: "fa-project-diagram", l: t("rute_patroli") },
            { p: "/pos-jaga", i: "fa-map-pin", l: t("pos_jaga") },
            { p: "/jadwal", i: "fa-calendar-alt", l: t("jadwal_shift") },
            {
              p: "/shift-assignment",
              i: "fa-user-clock",
              l: t("penugasan_shift"),
            },
          ],
        },
        {
          s: t("lainnya"),
          items: [
            { p: "/broadcast", i: "fa-bullhorn", l: t("broadcast") },
            {
              p: "/panic",
              i: "fa-bell",
              l: t("panic_alert"),
              b: counts.panic || undefined,
            },
            { p: "/analytics", i: "fa-chart-bar", l: "Analytics" },
            { p: "/qr-generator", i: "fa-qrcode", l: "QR Generator" },
            { p: "/export", i: "fa-download", l: t("export") },
            { p: "/backup", i: "fa-database", l: t("backup") },
          ],
        },
      ];
  const allowedPaths = ROLE_MENUS[userRole] || ROLE_MENUS.anggota;
  const filteredMenu = menu
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => allowedPaths.includes(item.p)),
    }))
    .filter((section) => section.items.length > 0);
  return (
    <aside className={`sidebar${open ? " sidebar--open" : ""}`}>
      <div className="sidebar-logo">
        <div className="logo-icon">
          <img
            src="/logo-ptsss.png"
            alt="Logo"
            style={{ width: 40, height: 40, objectFit: "contain" }}
          />
        </div>
        <div>
          <h2>PT Sopiak Satria Saga</h2>
          <small>
            {isKlien ? `Klien: ${getUser()?.nama || "Portal"}` : "Command Center"}
          </small>
        </div>
      </div>
      {filteredMenu.map((s) => (
        <div key={s.s} className="nav-section">
          <div className="nav-label">{s.s}</div>
          {s.items.map((i) => {
            const isActive = i.p === "/" ? pathname === "/" : pathname.startsWith(i.p);
            return (
            <Link
              key={i.p}
              href={i.p}
              className={`nav-item ${isActive ? "active" : ""}`}
              onClick={() => onClose?.()}
            >
              <i className={`fas ${i.i}`} />
              <span>{i.l}</span>
              {(i as any).b && (
                <span className="nav-badge">{(i as any).b}</span>
              )}
            </Link>
            );
          })}
        </div>
      ))}
      <div
        className="nav-section"
        style={{ borderTop: "1px solid rgba(255,255,255,.08)", paddingTop: 12 }}
      >
        <button className="nav-item" onClick={toggleDark}>
          <i className={`fas ${isDark ? "fa-sun" : "fa-moon"}`} />
          <span>{isDark ? t("light_mode") : t("dark_mode")}</span>
        </button>
        <button
          className="nav-item"
          onClick={() => setLang(lang === "id" ? "en" : "id")}
        >
          <i className="fas fa-globe" />
          <span>
            {t("bahasa")}: {lang.toUpperCase()}
          </span>
        </button>
      </div>
      <div
        className="nav-section"
        style={{
          marginTop: "auto",
          borderTop: "1px solid rgba(255,255,255,.08)",
          paddingTop: 16,
        }}
      >
        <button
          className="nav-item"
          onClick={() => {
            authApi.logout();
            window.location.href = "/login";
          }}
        >
          <i className="fas fa-sign-out-alt" />
          <span>{t("logout")}</span>
        </button>
      </div>
    </aside>
  );
}
